import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { and, desc, eq, inArray, isNull, lte, sql, sum } from "drizzle-orm";
import {
  db,
  rentalDisputesTable,
  rentalMarketplaceRequestsTable,
  rentalPaymentsTable,
  rentalPayoutsTable,
  rentalReconciliationFailuresTable,
  rentalRefundsTable,
  rentalReservationsTable,
  rentalNotificationsTable,
  rentalOperatorsTable,
  rentalStripeEventsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { marketplacePolicy } from "../lib/marketplace-policy";
import { isMarketplaceEnabled } from "../lib/rental-request-policy.mjs";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { authenticatePartner, partnerIdentity } from "./partner";
import { isVehicleAvailable } from "./rental-vehicles";
import { retryRentalNotification } from "../lib/rental-events";

const router: IRouter = Router();
const StripeCurrency = "jpy";

function stripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Stripe payments are not configured");
  return new Stripe(secret);
}

function validId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider or reconciliation error";
}

function publicBaseUrl(): string | null {
  const configured = process.env.RENTAL_PUBLIC_BASE_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function commissionConfiguration(policyValue: unknown): { percent: number; basisPoints: number } | null {
  const percent = typeof policyValue === "number"
    ? policyValue
    : typeof policyValue === "string" && policyValue.trim() !== ""
      ? Number(policyValue)
      : Number.NaN;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return { percent, basisPoints: Math.round(percent * 100) };
}

function moneyInYen(value: unknown): number | null {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

async function reconciliationFailure(input: {
  paymentId?: number | null;
  eventId?: string | null;
  type: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  await db.insert(rentalReconciliationFailuresTable).values({
    paymentId: input.paymentId ?? null,
    stripeEventId: input.eventId ?? null,
    failureType: input.type,
    message: input.message.slice(0, 2000),
    details: input.details ?? {},
  });
}

type FinanceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FinanceNotificationType = "payment" | "voucher" | "alert" | "refund";
type FinanceNotificationInput = {
  key: string;
  email?: string | null;
  type: FinanceNotificationType;
  bookingId: number;
  locale: "en" | "ja";
  english: { subject: string; body: string };
  japanese: { subject: string; body: string };
};

async function createFinanceNotificationOutbox(
  tx: FinanceTransaction,
  input: FinanceNotificationInput,
): Promise<number> {
  const configuredRecipient = Boolean(input.email?.trim());
  const [notification] = await tx.insert(rentalNotificationsTable).values({
    email: input.email?.trim() || null,
    eventType: input.type,
    channel: "smtp",
    dedupeKey: input.key,
    deliveryStatus: configuredRecipient ? "pending" : "unconfigured",
    lastError: configuredRecipient ? null : "Notification recipient email is not configured.",
    payload: {
      financeNotificationKey: input.key,
      bookingId: input.bookingId,
      locale: input.locale,
      localeTemplates: { en: input.english, ja: input.japanese },
    },
  }).onConflictDoNothing({ target: rentalNotificationsTable.dedupeKey })
    .returning({ id: rentalNotificationsTable.id });
  if (notification) return notification.id;
  const [existing] = await tx.select({ id: rentalNotificationsTable.id })
    .from(rentalNotificationsTable)
    .where(eq(rentalNotificationsTable.dedupeKey, input.key))
    .limit(1);
  if (!existing) throw new Error("Could not create or recover finance notification outbox item");
  return existing.id;
}

function preferredLocale(driver: unknown): "en" | "ja" {
  if (!isRecord(driver)) return "en";
  const preference = String(driver.locale ?? driver.language ?? "").toLowerCase();
  return preference === "ja" || preference.startsWith("ja-") ? "ja" : "en";
}

function offerTerms(payment: typeof rentalPaymentsTable.$inferSelect): string {
  const policy = payment.policySnapshot;
  const format = (label: string, value: unknown) => value == null || value === ""
    ? `${label}: not specified`
    : `${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
  return [
    format("Cancellation terms", policy.cancellationPolicy),
    format("Security deposit terms", policy.depositPolicy),
    format("Payout terms", policy.payoutTerms),
  ].join("; ");
}

async function enqueueConfirmedBookingNotifications(
  tx: FinanceTransaction,
  payment: typeof rentalPaymentsTable.$inferSelect,
  request: typeof rentalMarketplaceRequestsTable.$inferSelect,
  reservation: typeof rentalReservationsTable.$inferSelect,
): Promise<number[]> {
  const [operator] = await tx.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.id, payment.operatorId));
  const driver = isRecord(request.driver) ? request.driver : {};
  const locale = request.locale === "ja" ? "ja" : preferredLocale(driver);
  const customerEmail = typeof driver.email === "string" ? driver.email : null;
  const terms = offerTerms(payment);
  const offer = isRecord(request.acceptedOffer) ? request.acceptedOffer : {};
  const baseUrl = publicBaseUrl();
  const voucherUrl = baseUrl
    ? new URL(`/rentalcar/requests/${request.id}?accessCode=${encodeURIComponent(request.customerAccessToken)}`, baseUrl).toString()
    : "the booking page";
  const pickup = reservation.pickupAt.toISOString();
  const returnAt = reservation.returnAt.toISOString();
  const contact = [
    operator?.name ?? "Rental operator",
    operator?.contactEmail ? `email ${operator.contactEmail}` : null,
    operator?.contactPhone ? `phone ${operator.contactPhone}` : null,
  ].filter(Boolean).join(", ");
  const key = `rental-payment-${payment.id}-confirmed`;
  const ids = await Promise.all([
    createFinanceNotificationOutbox(tx, {
      key: `${key}:customer-payment`,
      email: customerEmail,
      type: "payment",
      bookingId: reservation.id,
      locale,
      english: {
        subject: `Payment confirmed for rental #${reservation.id}`,
        body: `Your payment of JPY ${payment.amount} is confirmed. Pickup: ${pickup}; return: ${returnAt}. Operator contact: ${contact}. ${terms}`,
      },
      japanese: {
        subject: `レンタル #${reservation.id} のお支払いが確定しました`,
        body: `JPY ${payment.amount} のお支払いが確定しました。受取: ${pickup}、返却: ${returnAt}。事業者連絡先: ${contact}。${terms}`,
      },
    }),
    createFinanceNotificationOutbox(tx, {
      key: `${key}:customer-voucher`,
      email: customerEmail,
      type: "voucher",
      bookingId: reservation.id,
      locale,
      english: {
        subject: `Your rental voucher for booking #${reservation.id}`,
        body: `Your rental booking is confirmed. Vehicle: ${String(offer.vehicleName ?? `vehicle ${reservation.vehicleId}`)}. Pickup: ${String(offer.pickupLocation ?? reservation.pickupLocation)} at ${pickup}; return: ${String(offer.returnLocation ?? reservation.returnLocation)} at ${returnAt}. Operator contact: ${contact}. ${terms} Booking details: ${voucherUrl}`,
      },
      japanese: {
        subject: `予約 #${reservation.id} のレンタルバウチャー`,
        body: `レンタル予約が確定しました。車両: ${String(offer.vehicleName ?? `車両 ${reservation.vehicleId}`)}。受取: ${String(offer.pickupLocation ?? reservation.pickupLocation)} (${pickup})、返却: ${String(offer.returnLocation ?? reservation.returnLocation)} (${returnAt})。事業者連絡先: ${contact}。${terms} 予約詳細: ${voucherUrl}`,
      },
    }),
    createFinanceNotificationOutbox(tx, {
      key: `${key}:operator`,
      email: operator?.contactEmail,
      type: "alert",
      bookingId: reservation.id,
      locale: "en",
      english: {
        subject: `Paid rental booking #${reservation.id}`,
        body: `Payment of JPY ${payment.amount} was verified for booking #${reservation.id}. Customer: ${String(driver.fullName ?? "Customer")} (${String(driver.email ?? "email unavailable")}, ${String(driver.phone ?? "phone unavailable")}). Pickup: ${pickup}; return: ${returnAt}. ${terms}`,
      },
      japanese: {
        subject: `有料予約 #${reservation.id} のお知らせ`,
        body: `予約 #${reservation.id} のJPY ${payment.amount} の決済が確認されました。お客様: ${String(driver.fullName ?? "お客様")} (${String(driver.email ?? "メール未登録")}, ${String(driver.phone ?? "電話未登録")})。受取: ${pickup}、返却: ${returnAt}。${terms}`,
      },
    }),
  ]);
  return ids;
}

async function enqueueLedgerUpdateNotifications(
  tx: FinanceTransaction,
  payment: typeof rentalPaymentsTable.$inferSelect,
  key: string,
  type: "refund" | "dispute",
  englishMessage: string,
  japaneseMessage: string,
): Promise<number[]> {
  const [request] = await tx.select().from(rentalMarketplaceRequestsTable)
    .where(eq(rentalMarketplaceRequestsTable.id, payment.requestId));
  const [reservation] = await tx.select().from(rentalReservationsTable)
    .where(eq(rentalReservationsTable.id, payment.reservationId));
  const [operator] = await tx.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.id, payment.operatorId));
  const driver = isRecord(request?.driver) ? request.driver : {};
  const locale = request?.locale === "ja" ? "ja" : preferredLocale(driver);
  const terms = offerTerms(payment);
  const contact = [
    operator?.name ?? "Rental operator",
    operator?.contactEmail ? `email ${operator.contactEmail}` : null,
    operator?.contactPhone ? `phone ${operator.contactPhone}` : null,
  ].filter(Boolean).join(", ");
  const bookingId = reservation?.id ?? payment.reservationId;
  return Promise.all([
    createFinanceNotificationOutbox(tx, {
      key: `${key}:customer`,
      email: typeof driver.email === "string" ? driver.email : null,
      type: type === "refund" ? "refund" : "payment",
      bookingId,
      locale,
      english: {
        subject: `${type === "refund" ? "Refund" : "Dispute"} update for rental #${bookingId}`,
        body: `${englishMessage} Operator contact: ${contact}. ${terms}`,
      },
      japanese: {
        subject: `レンタル #${bookingId} の${type === "refund" ? "返金" : "異議申し立て"}のお知らせ`,
        body: `${japaneseMessage} 事業者連絡先: ${contact}。${terms}`,
      },
    }),
    createFinanceNotificationOutbox(tx, {
      key: `${key}:operator`,
      email: operator?.contactEmail,
      type: "alert",
      bookingId,
      locale: "en",
      english: {
        subject: `${type === "refund" ? "Refund" : "Dispute"} update for rental #${bookingId}`,
        body: `${englishMessage} Customer: ${String(driver.fullName ?? "Customer")} (${String(driver.email ?? "email unavailable")}, ${String(driver.phone ?? "phone unavailable")}). ${terms}`,
      },
      japanese: {
        subject: `予約 #${bookingId} の${type === "refund" ? "返金" : "異議申し立て"}のお知らせ`,
        body: `${japaneseMessage} お客様: ${String(driver.fullName ?? "お客様")} (${String(driver.email ?? "メール未登録")}, ${String(driver.phone ?? "電話未登録")})。${terms}`,
      },
    }),
  ]);
}

async function deliverFinanceNotifications(ids: number[]): Promise<void> {
  for (const id of ids) await retryRentalNotification(id);
}

async function paymentFromMetadataOrReferences(
  metadata: Stripe.Metadata | null | undefined,
  references: { sessionId?: string; paymentIntentId?: string; chargeId?: string },
) {
  const metadataId = Number(metadata?.rentalPaymentId);
  let metadataPayment: typeof rentalPaymentsTable.$inferSelect | undefined;
  if (Number.isSafeInteger(metadataId) && metadataId > 0) {
    const [row] = await db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.id, metadataId));
    metadataPayment = row;
  }
  const lookups = [
    references.sessionId
      ? db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.stripeCheckoutSessionId, references.sessionId)).then((rows) => rows[0])
      : Promise.resolve(undefined),
    references.paymentIntentId
      ? db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.stripePaymentIntentId, references.paymentIntentId)).then((rows) => rows[0])
      : Promise.resolve(undefined),
    references.chargeId
      ? db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.stripeChargeId, references.chargeId)).then((rows) => rows[0])
      : Promise.resolve(undefined),
  ];
  if (!references.sessionId && !references.paymentIntentId && !references.chargeId) return undefined;
  const rows = (await Promise.all(lookups)).filter((row): row is NonNullable<typeof row> => Boolean(row));
  const distinct = new Map(rows.map((row) => [row.id, row]));
  if (distinct.size > 1 || (metadataPayment && distinct.size === 1 && !distinct.has(metadataPayment.id))) {
    return undefined;
  }
  const candidate = metadataPayment ?? [...distinct.values()][0];
  if (!candidate ||
      (references.sessionId && candidate.stripeCheckoutSessionId && candidate.stripeCheckoutSessionId !== references.sessionId) ||
      (references.paymentIntentId && candidate.stripePaymentIntentId && candidate.stripePaymentIntentId !== references.paymentIntentId) ||
      (references.chargeId && candidate.stripeChargeId && candidate.stripeChargeId !== references.chargeId)) {
    return undefined;
  }
  // Refunds and disputes must have a provider identity already recorded by a
  // confirmed Checkout; metadata alone cannot attach them to an unpaid offer.
  if (!references.sessionId && !(
    (references.paymentIntentId && candidate.stripePaymentIntentId === references.paymentIntentId) ||
    (references.chargeId && candidate.stripeChargeId === references.chargeId)
  )) return undefined;
  return candidate;
}

async function updatePaymentFee(paymentId: number, paymentIntentId: string): Promise<void> {
  try {
    const stripe = stripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = intent.latest_charge as Stripe.Charge | string | null;
    const balance = charge && typeof charge !== "string"
      ? charge.balance_transaction as Stripe.BalanceTransaction | string | null
      : null;
    if (balance && typeof balance !== "string" && Number.isSafeInteger(balance.fee)) {
      await db.update(rentalPaymentsTable).set({
        providerFeeAmount: balance.fee,
        stripeChargeId: charge && typeof charge !== "string" ? charge.id : undefined,
        updatedAt: new Date(),
      }).where(eq(rentalPaymentsTable.id, paymentId));
    }
  } catch (error) {
    await reconciliationFailure({
      paymentId,
      type: "provider_fee_lookup",
      message: errorText(error),
      details: { paymentIntentId },
    });
  }
}

async function createAutomaticRefund(paymentId: number, eventId: string): Promise<void> {
  const [payment] = await db.select().from(rentalPaymentsTable)
    .where(eq(rentalPaymentsTable.id, paymentId));
  if (!payment?.stripePaymentIntentId) {
    await reconciliationFailure({
      paymentId,
      eventId,
      type: "automatic_refund_missing_intent",
      message: "Paid but unfulfillable checkout has no Stripe PaymentIntent reference",
    });
    return;
  }
  const idempotencyKey = `rental-auto-refund-payment-${paymentId}`;
  const refundAmount = payment.chargedAmount ?? payment.amount;
  const existing = await db.select().from(rentalRefundsTable)
    .where(eq(rentalRefundsTable.idempotencyKey, idempotencyKey)).then((rows) => rows[0]);
  if (existing?.stripeRefundId) return;
  const [refund] = existing
    ? [existing]
    : await db.insert(rentalRefundsTable).values({
      paymentId,
      amount: refundAmount,
      currency: payment.currency,
      reason: "Inventory, deadline, or reservation validation failed after a verified payment",
      idempotencyKey,
      createdBy: "system:stripe-webhook",
    }).returning();
  try {
    const stripe = stripeClient();
    const result = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refund.amount,
      reason: "requested_by_customer",
      metadata: { rentalPaymentId: String(paymentId), rentalRefundId: String(refund.id) },
    }, { idempotencyKey });
    await db.update(rentalRefundsTable).set({
      stripeRefundId: result.id,
      status: result.status === "succeeded" ? "succeeded" : "pending",
      updatedAt: new Date(),
    }).where(eq(rentalRefundsTable.id, refund.id));
    if (result.status === "succeeded") {
      await db.update(rentalPaymentsTable).set({
        status: "refunded",
        refundedAmount: refundAmount,
        updatedAt: new Date(),
      }).where(eq(rentalPaymentsTable.id, paymentId));
      await db.update(rentalReservationsTable).set({
        status: "refunded",
        paymentStatus: "refunded",
        refundAmount,
        updatedAt: new Date(),
      }).where(eq(rentalReservationsTable.id, payment.reservationId));
    }
  } catch (error) {
    await db.update(rentalPaymentsTable).set({
      status: "reconciliation_failed",
      updatedAt: new Date(),
    }).where(eq(rentalPaymentsTable.id, paymentId));
    await reconciliationFailure({
      paymentId,
      eventId,
      type: "automatic_refund",
      message: errorText(error),
      details: { stripePaymentIntentId: payment.stripePaymentIntentId, refundId: refund.id },
    });
    throw error;
  }
}

async function finalizeSuccessfulCheckout(
  session: Stripe.Checkout.Session,
  paymentId: number,
  eventId: string,
): Promise<void> {
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id;
  let refundUnfulfillable = false;
  let failureMessage = "";
  const notificationIds: number[] = [];
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.id, paymentId)).for("update");
    if (!payment) {
      throw new Error("Verified Stripe checkout has no matching financial ledger entry");
    }
    if (payment.stripeCheckoutSessionId !== session.id) {
      throw new Error("Checkout session does not match the current rental payment attempt");
    }
    if (payment.stripePaymentIntentId && paymentIntentId !== payment.stripePaymentIntentId) {
      throw new Error("Checkout PaymentIntent does not match the current rental payment attempt");
    }
    if (["paid", "partially_refunded", "refunded", "disputed", "chargeback"].includes(payment.status)) {
      if (payment.paidAt) {
        const [reservation] = await tx.select().from(rentalReservationsTable)
          .where(eq(rentalReservationsTable.id, payment.reservationId));
        const [request] = await tx.select().from(rentalMarketplaceRequestsTable)
          .where(eq(rentalMarketplaceRequestsTable.id, payment.requestId));
        if (reservation?.status === "confirmed" && request) {
          notificationIds.push(...await enqueueConfirmedBookingNotifications(tx, payment, request, reservation));
        }
      }
      return;
    }
    const [reservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, payment.reservationId)).for("update");
    if (reservation) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${reservation.vehicleId})`);
    }
    const [request] = await tx.select().from(rentalMarketplaceRequestsTable)
      .where(eq(rentalMarketplaceRequestsTable.id, payment.requestId)).for("update");
    let available = Boolean(
      reservation &&
      request &&
      reservation.status === "pending_payment" &&
      request.status === "awaiting_payment" &&
      request.paymentDeadline &&
      request.paymentDeadline > new Date() &&
      isRecord(request.acceptedOffer) &&
      Number(request.acceptedOffer.totalPrice) === payment.amount &&
      Number(reservation.marketplaceOfferSnapshot?.totalPrice) === payment.amount &&
      Number(reservation.operatorId) === payment.operatorId &&
      reservation.vehicleId === request.vehicleId &&
      Boolean(paymentIntentId) &&
      session.amount_total === payment.amount &&
      session.currency?.toLowerCase() === payment.currency &&
      (!payment.stripePaymentIntentId || payment.stripePaymentIntentId === paymentIntentId),
    );
    if (available && reservation) {
      available = await isVehicleAvailable(
        reservation.vehicleId,
        reservation.pickupAt,
        reservation.returnAt,
        undefined,
        reservation.id,
        tx,
      );
    }
    if (!available || !reservation) {
      refundUnfulfillable = true;
      failureMessage = "The payment arrived after the accepted reservation was no longer fulfillable";
      await tx.update(rentalPaymentsTable).set({
        status: "refund_pending",
        stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
        chargedAmount: session.amount_total,
        chargedCurrency: session.currency?.toLowerCase() ?? null,
        updatedAt: new Date(),
      }).where(eq(rentalPaymentsTable.id, payment.id));
      if (reservation) {
        await tx.update(rentalReservationsTable).set({
          status: "cancelled",
          paymentStatus: "refund_pending",
          updatedAt: new Date(),
        }).where(eq(rentalReservationsTable.id, reservation.id));
      }
      if (request?.status === "awaiting_payment") {
        await tx.update(rentalMarketplaceRequestsTable).set({
          status: "expired",
          updatedAt: new Date(),
        }).where(eq(rentalMarketplaceRequestsTable.id, request.id));
      }
      return;
    }
    await tx.update(rentalPaymentsTable).set({
      status: "paid",
      stripePaymentIntentId: paymentIntentId ?? payment.stripePaymentIntentId,
      chargedAmount: session.amount_total,
      chargedCurrency: session.currency?.toLowerCase() ?? null,
      paidAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(rentalPaymentsTable.id, payment.id));
    await tx.update(rentalReservationsTable).set({
      status: "confirmed",
      paymentStatus: "paid",
      paidAmount: payment.amount,
      outstanding: 0,
      updatedAt: new Date(),
    }).where(eq(rentalReservationsTable.id, reservation.id));
    await tx.update(rentalMarketplaceRequestsTable).set({
      status: "confirmed",
      updatedAt: new Date(),
    }).where(eq(rentalMarketplaceRequestsTable.id, request.id));
    notificationIds.push(...await enqueueConfirmedBookingNotifications(tx, payment, request, {
      ...reservation,
      status: "confirmed",
      paymentStatus: "paid",
      paidAmount: payment.amount,
      outstanding: 0,
    }));
  });

  if (refundUnfulfillable) {
    await reconciliationFailure({
      paymentId,
      eventId,
      type: "paid_checkout_unfulfillable",
      message: failureMessage,
      details: { checkoutSessionId: session.id },
    });
    await createAutomaticRefund(paymentId, eventId);
    return;
  }
  await deliverFinanceNotifications(notificationIds);
  if (paymentIntentId) await updatePaymentFee(paymentId, paymentIntentId);
}

function stripeRefundStatus(refund: Stripe.Refund): "pending" | "succeeded" | "failed" | "canceled" {
  if (refund.status === "succeeded") return "succeeded";
  if (refund.status === "failed") return "failed";
  if (refund.status === "canceled") return "canceled";
  return "pending";
}

async function syncRefund(refund: Stripe.Refund, eventId: string): Promise<void> {
  const paymentIntentId = typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : refund.payment_intent?.id;
  const payment = await paymentFromMetadataOrReferences(refund.metadata, {
    paymentIntentId,
    chargeId: typeof refund.charge === "string" ? refund.charge : refund.charge?.id,
  });
  if (!payment) {
    await reconciliationFailure({
      eventId,
      type: "unmatched_stripe_refund",
      message: `Stripe refund ${refund.id} could not be linked to a rental payment`,
      details: { refundId: refund.id, paymentIntentId },
    });
    return;
  }
  const notificationIds = await db.transaction(async (tx) => {
    const [lockedPayment] = await tx.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.id, payment.id)).for("update");
    if (!lockedPayment) throw new Error("Rental payment ledger entry disappeared during refund reconciliation");
    const idempotencyKey = `stripe-refund:${refund.id}`;
    let [storedRefund] = await tx.select().from(rentalRefundsTable)
      .where(eq(rentalRefundsTable.stripeRefundId, refund.id)).for("update");
    if (!storedRefund) {
      [storedRefund] = await tx.select().from(rentalRefundsTable).where(and(
        eq(rentalRefundsTable.paymentId, payment.id),
        eq(rentalRefundsTable.idempotencyKey, idempotencyKey),
      )).for("update");
    }
    if (storedRefund && storedRefund.paymentId !== payment.id) {
      throw new Error("Stripe refund reference belongs to a different rental payment");
    }
    if (storedRefund) {
      // Stripe does not guarantee event order. Never let an older pending or
      // failed snapshot reverse a successfully reconciled customer refund.
      const nextStatus = storedRefund.status === "succeeded"
        ? "succeeded" : storedRefund.status !== "pending" && refund.status === "pending"
          ? storedRefund.status : stripeRefundStatus(refund);
      [storedRefund] = await tx.update(rentalRefundsTable).set({
        amount: refund.amount,
        currency: refund.currency,
        status: nextStatus,
        stripeRefundId: refund.id,
        updatedAt: new Date(),
      }).where(eq(rentalRefundsTable.id, storedRefund.id)).returning();
    } else {
      [storedRefund] = await tx.insert(rentalRefundsTable).values({
        paymentId: payment.id,
        amount: refund.amount,
        currency: refund.currency,
        reason: "Refund created outside the rental admin API",
        status: stripeRefundStatus(refund),
        stripeRefundId: refund.id,
        idempotencyKey,
        createdBy: "stripe:webhook",
      }).returning();
    }

    const refunds = await tx.select().from(rentalRefundsTable)
      .where(eq(rentalRefundsTable.paymentId, payment.id));
    const refundedAmount = refunds.filter((row) => row.status === "succeeded")
      .reduce((total, row) => total + row.amount, 0);
    const targetAmount = lockedPayment.chargedAmount ?? lockedPayment.amount;
    const status = lockedPayment.status === "disputed" || lockedPayment.status === "chargeback"
      ? lockedPayment.status
      : refundedAmount >= targetAmount
        ? "refunded"
        : refundedAmount > 0 ? "partially_refunded" : lockedPayment.status;
    const [updatedPayment] = await tx.update(rentalPaymentsTable).set({
      status,
      refundedAmount,
      updatedAt: new Date(),
    }).where(eq(rentalPaymentsTable.id, payment.id)).returning();
    const [manualPayout] = await tx.select({ total: sum(rentalPayoutsTable.amount) })
      .from(rentalPayoutsTable).where(and(
        eq(rentalPayoutsTable.paymentId, payment.id),
        eq(rentalPayoutsTable.status, "reported_manual"),
      ));
    const remainingShare = Math.max(0, lockedPayment.operatorShareAmount -
      Math.round(Math.min(refundedAmount, targetAmount) * lockedPayment.operatorShareAmount / targetAmount));
    if (Number(manualPayout?.total ?? 0) > remainingShare) {
      await tx.insert(rentalReconciliationFailuresTable).values({
        paymentId: payment.id,
        stripeEventId: eventId,
        failureType: "manual_payout_exceeds_refunded_operator_share",
        message: "Manual payout reports exceed the operator share after the verified refund; recover the difference outside Stripe",
        details: { reportedPayout: Number(manualPayout?.total), remainingShare, refundedAmount },
      }).onConflictDoNothing();
    }
    if (status === "refunded" || status === "partially_refunded") {
      await tx.update(rentalReservationsTable).set({
        paymentStatus: status,
        refundAmount: refundedAmount,
        ...(status === "refunded" ? { status: "refunded" as const } : {}),
        updatedAt: new Date(),
      }).where(eq(rentalReservationsTable.id, payment.reservationId));
    }
    if (storedRefund.status === "succeeded") {
      return enqueueLedgerUpdateNotifications(
        tx,
        updatedPayment,
        `rental-refund-${refund.id}-succeeded`,
        "refund",
        `A refund of JPY ${refund.amount} was successfully recorded for booking #${payment.reservationId}.`,
        `予約 #${payment.reservationId} に JPY ${refund.amount} の返金が正常に記録されました。`,
      );
    }
    return [];
  });
  await deliverFinanceNotifications(notificationIds);
  if (refund.status === "failed") {
    await reconciliationFailure({
      paymentId: payment.id,
      eventId,
      type: "provider_refund_failed",
      message: refund.failure_reason ?? "Stripe refund failed",
      details: { refundId: refund.id },
    });
  }
}

async function syncDispute(dispute: Stripe.Dispute, eventId: string): Promise<void> {
  const intentId = typeof dispute.payment_intent === "string"
    ? dispute.payment_intent
    : dispute.payment_intent?.id;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  const payment = await paymentFromMetadataOrReferences(null, {
    paymentIntentId: intentId,
    chargeId,
  });
  if (!payment) {
    await reconciliationFailure({
      eventId,
      type: "unmatched_stripe_dispute",
      message: `Stripe dispute ${dispute.id} could not be linked to a rental payment`,
      details: { disputeId: dispute.id, paymentIntentId: intentId, chargeId },
    });
    return;
  }
  const currentDispute = await stripeClient().disputes.retrieve(dispute.id);
  const status = currentDispute.status === "won" ? "won"
    : currentDispute.status === "lost" ? "lost"
      : currentDispute.status === "warning_needs_response" ? "needs_response"
        : currentDispute.status === "warning_under_review" || currentDispute.status === "under_review" ? "under_review"
          : "closed";
  const notificationIds = await db.transaction(async (tx) => {
    const [lockedPayment] = await tx.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.id, payment.id)).for("update");
    if (!lockedPayment) throw new Error("Rental payment ledger entry disappeared during dispute reconciliation");
    const priorPaymentStatus = lockedPayment.refundedAmount >= lockedPayment.amount ? "refunded"
      : lockedPayment.refundedAmount > 0 ? "partially_refunded" : "paid";
    const paymentStatus = status === "won" || status === "closed"
      ? priorPaymentStatus
      : status === "lost" ? "chargeback" : "disputed";
    const evidenceDueAt = currentDispute.evidence_details?.due_by
      ? new Date(currentDispute.evidence_details.due_by * 1000)
      : null;
    await tx.insert(rentalDisputesTable).values({
      paymentId: payment.id,
      stripeDisputeId: dispute.id,
      amount: currentDispute.amount,
      currency: currentDispute.currency,
      reason: currentDispute.reason,
      status,
      evidenceDueAt,
    }).onConflictDoUpdate({
      target: rentalDisputesTable.stripeDisputeId,
      set: { status, reason: currentDispute.reason, evidenceDueAt, updatedAt: new Date() },
    });
    const [updatedPayment] = await tx.update(rentalPaymentsTable).set({
      status: paymentStatus,
      updatedAt: new Date(),
    }).where(eq(rentalPaymentsTable.id, payment.id)).returning();
    await tx.update(rentalReservationsTable).set({
      paymentStatus,
      updatedAt: new Date(),
    }).where(eq(rentalReservationsTable.id, payment.reservationId));
    return enqueueLedgerUpdateNotifications(
      tx,
      updatedPayment,
      `rental-dispute-${dispute.id}-${status}`,
      "dispute",
      `A Stripe dispute for JPY ${currentDispute.amount} on booking #${payment.reservationId} is ${status.replaceAll("_", " ")}.`,
      `予約 #${payment.reservationId} の JPY ${currentDispute.amount} の異議申し立て状況は「${status}」です。`,
    );
  });
  await deliverFinanceNotifications(notificationIds);
}

async function processStripeEvent(event: Stripe.Event): Promise<void> {
  const object = event.data.object;
  if (event.type.startsWith("checkout.session.")) {
    const session = object as Stripe.Checkout.Session;
    const payment = await paymentFromMetadataOrReferences(session.metadata, { sessionId: session.id });
    if (!payment) {
      await reconciliationFailure({
        eventId: event.id,
        type: "unmatched_checkout_session",
        message: `Stripe Checkout session ${session.id} has no rental payment record`,
        details: { sessionId: session.id, metadata: session.metadata ?? {} },
      });
      return;
    }
    if (payment.stripeCheckoutSessionId !== session.id) {
      if ((event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded") &&
          session.payment_status === "paid") {
        throw new Error("Paid Checkout session does not match the current rental payment attempt");
      }
      return;
    }
    if (event.type === "checkout.session.expired") {
      if (payment.stripeCheckoutSessionId === session.id &&
          !["paid", "partially_refunded", "refunded", "disputed", "chargeback"].includes(payment.status)) {
        await db.update(rentalPaymentsTable).set({ status: "expired", updatedAt: new Date() })
          .where(eq(rentalPaymentsTable.id, payment.id));
      }
      return;
    }
    if (event.type === "checkout.session.async_payment_failed") {
      if (payment.stripeCheckoutSessionId === session.id &&
          !["paid", "partially_refunded", "refunded", "disputed", "chargeback"].includes(payment.status)) {
        await db.update(rentalPaymentsTable).set({ status: "failed", updatedAt: new Date() })
          .where(eq(rentalPaymentsTable.id, payment.id));
      }
      return;
    }
    if (event.type === "checkout.session.completed" && session.payment_status !== "paid") {
      await db.update(rentalPaymentsTable).set({ status: "checkout_open", updatedAt: new Date() })
        .where(and(eq(rentalPaymentsTable.id, payment.id), eq(rentalPaymentsTable.status, "checkout_open")));
      return;
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (session.payment_status === "paid") await finalizeSuccessfulCheckout(session, payment.id, event.id);
    }
    return;
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = object as Stripe.PaymentIntent;
    const payment = await paymentFromMetadataOrReferences(intent.metadata, { paymentIntentId: intent.id });
    // A failed attempt can be retried inside the same Checkout session. The
    // session-level async_payment_failed/expired events are authoritative.
    if (!payment) {
      await reconciliationFailure({
        eventId: event.id,
        type: "unmatched_payment_failure",
        message: `Failed PaymentIntent ${intent.id} is not linked to a rental payment`,
      });
    }
    return;
  }

  if (event.type === "refund.updated" || event.type === "refund.created") {
    await syncRefund(object as Stripe.Refund, event.id);
    return;
  }

  if (event.type.startsWith("charge.dispute.")) {
    await syncDispute(object as Stripe.Dispute, event.id);
    return;
  }

  if (event.type === "charge.refunded") {
    const charge = object as Stripe.Charge;
    const paymentIntentId = typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
    const payment = await paymentFromMetadataOrReferences(charge.metadata, {
      paymentIntentId,
      chargeId: charge.id,
    });
    if (!payment) {
      await reconciliationFailure({
        eventId: event.id,
        type: "unmatched_charge_refund",
        message: `Refunded Stripe charge ${charge.id} is not linked to a rental payment`,
      });
      return;
    }
    const latestCharge = charge.refunds?.data.length
      ? charge
      : await stripeClient().charges.retrieve(charge.id, { expand: ["refunds.data"] });
    for (const refund of latestCharge.refunds?.data ?? []) await syncRefund(refund, event.id);
  }
}

export async function rentalStripeWebhookHandler(req: Request, res: Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !process.env.STRIPE_SECRET_KEY?.trim()) {
    res.status(503).json({ error: "Stripe webhook verification credentials are not configured" });
    return;
  }
  const signature = req.header("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "A Stripe signature and raw request body are required" });
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(req.body, signature, secret);
  } catch (error) {
    req.log.warn({ err: error, action: "rental_stripe_webhook_signature_invalid" });
    res.status(400).json({ error: "Invalid Stripe webhook signature" });
    return;
  }

  let claimAttempt: number | undefined;
  try {
    const [inserted] = await db.insert(rentalStripeEventsTable).values({
      id: event.id,
      eventType: event.type,
      objectId: isRecord(event.data.object) && typeof event.data.object.id === "string"
        ? event.data.object.id
        : null,
    }).onConflictDoNothing().returning({ attempts: rentalStripeEventsTable.attempts });
    claimAttempt = inserted?.attempts;
    if (claimAttempt === undefined) {
      const [existing] = await db.select().from(rentalStripeEventsTable)
        .where(eq(rentalStripeEventsTable.id, event.id));
      if (existing?.status === "processed") {
        res.json({ received: true, duplicate: true });
        return;
      }
      if (!existing) throw new Error("Could not claim Stripe event processing lease");
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const isStaleProcessing = existing.status === "processing" && existing.receivedAt <= staleBefore;
      if (existing.status !== "failed" && !isStaleProcessing) {
        res.status(503).json({ error: "Stripe event is already being reconciled" });
        return;
      }
      const claimCondition = existing.status === "failed"
        ? and(eq(rentalStripeEventsTable.id, event.id), eq(rentalStripeEventsTable.status, "failed"))
        : and(
          eq(rentalStripeEventsTable.id, event.id),
          eq(rentalStripeEventsTable.status, "processing"),
          lte(rentalStripeEventsTable.receivedAt, staleBefore),
        );
      const [claimed] = await db.update(rentalStripeEventsTable).set({
        status: "processing",
        attempts: sql`${rentalStripeEventsTable.attempts} + 1`,
        receivedAt: new Date(),
        processedAt: null,
        lastError: null,
      }).where(claimCondition).returning({ attempts: rentalStripeEventsTable.attempts });
      if (!claimed) {
        res.status(503).json({ error: "Stripe event is already being reconciled" });
        return;
      }
      claimAttempt = claimed.attempts;
    }
    if (claimAttempt === undefined) throw new Error("Could not establish Stripe event processing attempt");
    await processStripeEvent(event);
    await db.update(rentalStripeEventsTable).set({
      status: "processed",
      processedAt: new Date(),
      lastError: null,
    }).where(and(
      eq(rentalStripeEventsTable.id, event.id),
      eq(rentalStripeEventsTable.attempts, claimAttempt),
      eq(rentalStripeEventsTable.status, "processing"),
    ));
    res.json({ received: true });
  } catch (error) {
    const message = errorText(error);
    await db.update(rentalStripeEventsTable).set({
      status: "failed",
      lastError: message.slice(0, 2000),
    }).where(and(
      eq(rentalStripeEventsTable.id, event.id),
      ...(claimAttempt === undefined ? [] : [eq(rentalStripeEventsTable.attempts, claimAttempt)]),
    ));
    await reconciliationFailure({
      eventId: event.id,
      type: "stripe_webhook_processing",
      message,
      details: { eventType: event.type },
    });
    req.log.error({ err: error, action: "rental_stripe_webhook_reconciliation_failed", eventId: event.id });
    res.status(500).json({ error: "Stripe event reconciliation failed and will be retried" });
  }
}

router.post("/rental/requests/:id/checkout", async (req, res): Promise<void> => {
  if (!isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  const requestId = validId(req.params.id);
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "Request ID and accessCode are required" });
    return;
  }
  if (!process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    res.status(503).json({ error: "Stripe checkout requires both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET" });
    return;
  }
  const baseUrl = publicBaseUrl();
  if (!baseUrl) {
    res.status(503).json({ error: "RENTAL_PUBLIC_BASE_URL must be configured before checkout can be enabled" });
    return;
  }
  let stripe: Stripe;
  let activePaymentId: number | undefined;
  try {
    stripe = stripeClient();
  } catch (error) {
    res.status(503).json({ error: errorText(error) });
    return;
  }

  try {
    const [request] = await db.select().from(rentalMarketplaceRequestsTable).where(and(
      eq(rentalMarketplaceRequestsTable.id, requestId),
      eq(rentalMarketplaceRequestsTable.customerAccessToken, accessCode),
    ));
    if (!request || request.status !== "awaiting_payment" || !request.acceptedOffer ||
        !request.reservationId || !request.paymentDeadline || request.paymentDeadline <= new Date()) {
      res.status(409).json({ error: "Accepted offer is missing, expired, or no longer payable" });
      return;
    }
    const [reservation] = await db.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, request.reservationId));
    if (!reservation || reservation.status !== "pending_payment" ||
        reservation.operatorId !== request.operatorId || reservation.vehicleId !== request.vehicleId) {
      res.status(409).json({ error: "The accepted reservation is not payable" });
      return;
    }
    const offer = request.acceptedOffer as Record<string, unknown>;
    const amount = moneyInYen(offer.totalPrice);
    if (!amount || amount !== moneyInYen(reservation.finalTotal) ||
        !isRecord(reservation.marketplaceOfferSnapshot) ||
        Number(reservation.marketplaceOfferSnapshot.totalPrice) !== amount) {
      await reconciliationFailure({
        type: "accepted_offer_price_mismatch",
        message: "Accepted offer, reservation total, and immutable snapshot do not match",
        details: { requestId, reservationId: reservation.id },
      });
      res.status(409).json({ error: "Accepted offer pricing could not be verified" });
      return;
    }
    const policy = await marketplacePolicy();
    const commission = commissionConfiguration(policy.values.marketplaceCommissionPercent);
    if (!commission) {
      res.status(503).json({ error: "Marketplace commission must be explicitly configured from 0 to 100 percent" });
      return;
    }
    const paymentIntent = Math.round((amount * commission.basisPoints) / 10_000);
    const paymentIdempotency = `rental-payment-reservation-${reservation.id}`;
    let [payment] = await db.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.reservationId, reservation.id));
    if (!payment) {
      try {
        [payment] = await db.insert(rentalPaymentsTable).values({
          requestId,
          reservationId: reservation.id,
          operatorId: reservation.operatorId!,
          status: "pending",
          currency: StripeCurrency,
          amount,
          commissionAmount: paymentIntent,
          commissionBasisPoints: commission.basisPoints,
          commissionPolicyVersion: "marketplace-settings-v1",
          operatorShareAmount: amount - paymentIntent,
          idempotencyKey: paymentIdempotency,
          priceSnapshot: {
            acceptedOffer: offer,
            reservationOfferSnapshot: reservation.marketplaceOfferSnapshot,
            amount,
            currency: StripeCurrency,
          },
          policySnapshot: {
            commissionPolicyVersion: "marketplace-settings-v1",
            commissionPercent: commission.percent,
            commissionBasisPoints: commission.basisPoints,
            payoutTerms: policy.values.marketplacePayoutTerms ?? null,
            cancellationPolicy: policy.values.marketplaceCancellationPolicy ?? null,
            depositPolicy: policy.values.marketplaceDepositPolicy ?? null,
            providerFee: "recorded from Stripe balance transaction after successful charge",
          },
        }).returning();
      } catch (error) {
        const [concurrent] = await db.select().from(rentalPaymentsTable)
          .where(eq(rentalPaymentsTable.reservationId, reservation.id));
        if (!concurrent) throw error;
        payment = concurrent;
      }
    }
    if (!payment) throw new Error("Could not initialize marketplace payment ledger");
    activePaymentId = payment.id;
    if (["paid", "partially_refunded", "refunded", "disputed", "chargeback"].includes(payment.status)) {
      res.status(409).json({ error: "This reservation already has a verified payment" });
      return;
    }

    if (payment.status === "checkout_open" && payment.stripeCheckoutSessionId) {
      const previous = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId);
      if (previous.status === "open" && previous.url) {
        res.json({ checkoutUrl: previous.url, paymentId: payment.id, expiresAt: new Date(previous.expires_at * 1000).toISOString() });
        return;
      }
      if (previous.status === "complete") {
        res.status(409).json({ error: "Payment verification is processing; check the payment status before retrying" });
        return;
      }
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const checkoutExpiry = Math.min(
      Math.floor(request.paymentDeadline.getTime() / 1000),
      nowSeconds + 24 * 60 * 60,
    );
    if (checkoutExpiry < nowSeconds + 30 * 60) {
      res.status(409).json({ error: "The payment deadline is too close to create a time-bounded Stripe Checkout session" });
      return;
    }
    const attempt = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(rentalPaymentsTable)
        .where(eq(rentalPaymentsTable.id, payment.id)).for("update");
      if (!locked) throw new Error("Payment ledger entry not found");
      if (["paid", "partially_refunded", "refunded", "disputed", "chargeback"].includes(locked.status)) {
        throw Object.assign(new Error("This reservation already has a verified payment"), { statusCode: 409 });
      }
      if (locked.status === "creating_checkout" &&
          Date.now() - locked.updatedAt.getTime() < 2 * 60 * 1000) {
        throw Object.assign(new Error("Checkout session creation is already in progress; retry shortly"), { statusCode: 409 });
      }
      const attempt = locked.status === "creating_checkout"
        ? Math.max(1, locked.checkoutAttempts)
        : locked.checkoutAttempts + 1;
      await tx.update(rentalPaymentsTable).set({
        status: "creating_checkout",
        checkoutAttempts: attempt,
        updatedAt: new Date(),
      }).where(eq(rentalPaymentsTable.id, locked.id));
      return { ...locked, attempt };
    });

    const success = new URL("/rentalcar/payment/return", baseUrl);
    success.searchParams.set("requestId", String(requestId));
    success.searchParams.set("accessCode", accessCode);
    success.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
    const cancel = new URL(`/rentalcar/requests/${requestId}`, baseUrl);
    cancel.searchParams.set("requestId", String(requestId));
    cancel.searchParams.set("accessCode", accessCode);
    const product = payment.stripeProductId
      ? await stripe.products.retrieve(payment.stripeProductId)
      : await stripe.products.create({
        name: `Rental reservation ${reservation.id}`,
        description: `${reservation.pickupAt.toISOString()} – ${reservation.returnAt.toISOString()}`,
        metadata: {
          rentalPaymentId: String(payment.id),
          rentalReservationId: String(reservation.id),
        },
      }, { idempotencyKey: `rental-product-payment-${payment.id}` });
    const price = payment.stripePriceId
      ? await stripe.prices.retrieve(payment.stripePriceId)
      : await stripe.prices.create({
        product: product.id,
        currency: StripeCurrency,
        unit_amount: amount,
        metadata: {
          rentalPaymentId: String(payment.id),
          rentalReservationId: String(reservation.id),
        },
      }, { idempotencyKey: `rental-price-payment-${payment.id}` });
    const priceProductId = typeof price.product === "string" ? price.product : price.product.id;
    if (!price.active || price.unit_amount !== amount || price.currency.toLowerCase() !== StripeCurrency ||
        priceProductId !== product.id) {
      await reconciliationFailure({
        paymentId: payment.id,
        type: "stripe_price_mismatch",
        message: "Stripe reservation Price does not match the immutable JPY payment snapshot",
        details: { stripePriceId: price.id, amount, currency: StripeCurrency },
      });
      res.status(409).json({ error: "Stripe reservation pricing could not be verified" });
      return;
    }
    await db.update(rentalPaymentsTable).set({
      stripeProductId: product.id,
      stripePriceId: price.id,
      updatedAt: new Date(),
    }).where(eq(rentalPaymentsTable.id, payment.id));
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(payment.id),
      metadata: {
        rentalPaymentId: String(payment.id),
        rentalRequestId: String(requestId),
        rentalReservationId: String(reservation.id),
      },
      payment_intent_data: {
        metadata: {
          rentalPaymentId: String(payment.id),
          rentalRequestId: String(requestId),
          rentalReservationId: String(reservation.id),
        },
      },
      line_items: [{
        quantity: 1,
        price: price.id,
      }],
      success_url: success.toString(),
      cancel_url: cancel.toString(),
      expires_at: checkoutExpiry,
    }, { idempotencyKey: `rental-checkout-payment-${payment.id}-attempt-${attempt.attempt}` });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    await db.update(rentalPaymentsTable).set({
      stripeCheckoutSessionId: session.id,
      status: sql`CASE
        WHEN ${rentalPaymentsTable.status} = 'creating_checkout'
          THEN 'checkout_open'::rental_payment_ledger_status
        ELSE ${rentalPaymentsTable.status}
      END`,
      updatedAt: new Date(),
    }).where(eq(rentalPaymentsTable.id, payment.id));
    res.json({
      checkoutUrl: session.url,
      paymentId: payment.id,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
    });
  } catch (error) {
    if (activePaymentId) {
      await reconciliationFailure({
        paymentId: activePaymentId,
        type: "checkout_session_creation",
        message: errorText(error),
      });
    }
    req.log.error({ err: error, action: "rental_checkout_creation_failed", requestId });
    const status = (error as { statusCode?: number }).statusCode ?? 503;
    res.status(status).json({ error: errorText(error) });
  }
});

router.get("/rental/requests/:id/payment", async (req, res): Promise<void> => {
  if (!isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  const requestId = validId(req.params.id);
  const accessCode = typeof req.query.accessCode === "string" ? req.query.accessCode : "";
  if (!requestId || !accessCode) {
    res.status(400).json({ error: "Request ID and accessCode are required" });
    return;
  }
  const [request] = await db.select().from(rentalMarketplaceRequestsTable).where(and(
    eq(rentalMarketplaceRequestsTable.id, requestId),
    eq(rentalMarketplaceRequestsTable.customerAccessToken, accessCode),
  ));
  if (!request) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  const [payment] = request.reservationId
    ? await db.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.reservationId, request.reservationId))
    : [];
  const [reservation] = request.reservationId
    ? await db.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, request.reservationId))
    : [];
  const configured = Boolean(process.env.STRIPE_SECRET_KEY?.trim() &&
    process.env.STRIPE_WEBHOOK_SECRET?.trim() && publicBaseUrl() &&
    commissionConfiguration((await marketplacePolicy()).values.marketplaceCommissionPercent));
  const checkoutAvailable = configured && request.status === "awaiting_payment" &&
    Boolean(request.acceptedOffer && reservation?.status === "pending_payment" &&
      request.paymentDeadline && request.paymentDeadline.getTime() - Date.now() >= 30 * 60_000) &&
    !["paid", "partially_refunded", "refunded", "disputed", "chargeback", "refund_pending", "reconciliation_failed"].includes(payment?.status ?? "");
  res.set("Cache-Control", "no-store");
  res.json({
    requestId,
    reservationId: request.reservationId,
    requestStatus: request.status,
    paymentStatus: payment?.status ?? "not_started",
    reservationStatus: reservation?.status ?? null,
    amount: payment?.amount ?? reservation?.finalTotal ?? null,
    currency: payment?.currency ?? (reservation ? StripeCurrency : null),
    paidAt: payment?.paidAt?.toISOString() ?? null,
    paymentDeadline: request.paymentDeadline?.toISOString() ?? null,
    configured,
    checkoutAvailable,
    verified: payment?.status === "paid" || payment?.status === "partially_refunded" ||
      payment?.status === "refunded" || payment?.status === "disputed" || payment?.status === "chargeback",
  });
});

const RefundBody = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

router.get("/admin/rental/finance", requireAdminAuth, async (req, res): Promise<void> => {
  const reservationId = req.query.reservationId === undefined ? null : validId(String(req.query.reservationId));
  if (req.query.reservationId !== undefined && !reservationId) {
    res.status(400).json({ error: "reservationId must be a positive integer" });
    return;
  }
  const payments = await db.select().from(rentalPaymentsTable)
    .where(reservationId ? eq(rentalPaymentsTable.reservationId, reservationId) : undefined)
    .orderBy(desc(rentalPaymentsTable.createdAt));
  const paymentIds = payments.map((payment) => payment.id);
  const [refunds, disputes, payouts, failures] = paymentIds.length
    ? await Promise.all([
      db.select().from(rentalRefundsTable).where(inArray(rentalRefundsTable.paymentId, paymentIds)),
      db.select().from(rentalDisputesTable).where(inArray(rentalDisputesTable.paymentId, paymentIds)),
      db.select().from(rentalPayoutsTable).where(inArray(rentalPayoutsTable.paymentId, paymentIds)),
      db.select().from(rentalReconciliationFailuresTable).where(inArray(rentalReconciliationFailuresTable.paymentId, paymentIds)),
    ])
    : [[], [], [], []];
  const allFailures = await db.select().from(rentalReconciliationFailuresTable)
    .where(reservationId ? undefined : isNull(rentalReconciliationFailuresTable.resolvedAt))
    .orderBy(desc(rentalReconciliationFailuresTable.createdAt));
  const stripeEvents = reservationId
    ? failures.some((failure) => Boolean(failure.stripeEventId))
      ? await db.select().from(rentalStripeEventsTable).where(and(
        eq(rentalStripeEventsTable.status, "failed"),
        inArray(
          rentalStripeEventsTable.id,
          failures.map((failure) => failure.stripeEventId).filter((id): id is string => Boolean(id)),
        ),
      ))
      : []
    : await db.select().from(rentalStripeEventsTable)
      .where(eq(rentalStripeEventsTable.status, "failed"))
      .orderBy(desc(rentalStripeEventsTable.receivedAt));
  res.set("Cache-Control", "no-store");
  res.json({ payments, refunds, disputes, payouts, reconciliationFailures: reservationId ? failures : allFailures, stripeEvents });
});

router.post("/admin/rental/finance/:paymentId/refund", requireAdminAuth, async (req, res): Promise<void> => {
  const paymentId = validId(req.params.paymentId);
  const parsed = RefundBody.safeParse(req.body);
  if (!paymentId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid payment ID" : parsed.error.message });
    return;
  }
  let stripe: Stripe;
  try {
    stripe = stripeClient();
  } catch (error) {
    res.status(503).json({ error: errorText(error) });
    return;
  }
  const [payment] = await db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.id, paymentId));
  if (!payment || !payment.stripePaymentIntentId) {
    res.status(404).json({ error: "Paid Stripe payment not found" });
    return;
  }
  if (!["paid", "partially_refunded", "refund_pending"].includes(payment.status)) {
    res.status(409).json({ error: "This payment is not eligible for a refund" });
    return;
  }
  const key = createHash("sha256")
    .update(`${payment.id}:${parsed.data.amount}:${parsed.data.reason.trim()}`)
    .digest("hex");
  const refunds = await db.select().from(rentalRefundsTable)
    .where(eq(rentalRefundsTable.paymentId, payment.id));
  const idempotencyKey = `admin-refund:${key}`;
  const [existing] = await db.select().from(rentalRefundsTable)
    .where(eq(rentalRefundsTable.idempotencyKey, idempotencyKey));
  if (existing?.stripeRefundId) {
    res.json({ refund: existing, duplicate: true });
    return;
  }
  const activeRefunds = refunds.filter((refund) => !["failed", "canceled"].includes(refund.status))
    .filter((refund) => refund.id !== existing?.id)
    .reduce((total, refund) => total + refund.amount, 0);
  if (parsed.data.amount + activeRefunds > (payment.chargedAmount ?? payment.amount)) {
    res.status(400).json({ error: "Refund amount exceeds the unrefunded balance" });
    return;
  }
  const [refund] = existing ? [existing] : await db.insert(rentalRefundsTable).values({
    paymentId: payment.id,
    amount: parsed.data.amount,
    currency: payment.currency,
    reason: parsed.data.reason,
    status: "pending",
    idempotencyKey,
    createdBy: `admin:${String((req.session as unknown as Record<string, { username?: string }>).admin?.username ?? "unknown")}`,
  }).returning();
  try {
    const result = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refund.amount,
      reason: "requested_by_customer",
      metadata: { rentalPaymentId: String(payment.id), rentalRefundId: String(refund.id) },
    }, { idempotencyKey: refund.idempotencyKey });
    const [updated] = await db.update(rentalRefundsTable).set({
      stripeRefundId: result.id,
      status: stripeRefundStatus(result),
      updatedAt: new Date(),
    }).where(eq(rentalRefundsTable.id, refund.id)).returning();
    if (result.status === "succeeded") await syncRefund(result, `refund-api:${result.id}`);
    res.status(202).json({ refund: updated, providerStatus: result.status });
  } catch (error) {
    await reconciliationFailure({
      paymentId: payment.id,
      type: "admin_refund_request",
      message: errorText(error),
      details: { refundId: refund.id },
    });
    res.status(503).json({ error: "Stripe refund request failed; the attempt was recorded for reconciliation" });
  }
});

const PayoutBody = z.object({
  reference: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2000).optional(),
}).strict();

router.post("/admin/rental/finance/:paymentId/payout", requireAdminAuth, async (req, res): Promise<void> => {
  const paymentId = validId(req.params.paymentId);
  const parsed = PayoutBody.safeParse(req.body);
  if (!paymentId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid payment ID" : parsed.error.message });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.id, paymentId)).for("update");
    if (!payment) return { status: 404 as const, error: "Payment not found" };
    if (!["paid", "partially_refunded", "refunded"].includes(payment.status)) {
      return { status: 409 as const, error: "Payment is not eligible for a manual payout" };
    }
    const [activeDispute] = await tx.select().from(rentalDisputesTable).where(and(
      eq(rentalDisputesTable.paymentId, paymentId),
      inArray(rentalDisputesTable.status, ["needs_response", "under_review"]),
    ));
    if (activeDispute || payment.status === "refunded") {
      return { status: 409 as const, error: "Active dispute or full refund blocks payout" };
    }
    const [existing] = await tx.select().from(rentalPayoutsTable).where(and(
      eq(rentalPayoutsTable.paymentId, paymentId),
      eq(rentalPayoutsTable.reference, parsed.data.reference),
    ));
    if (existing) return { status: 200 as const, payout: existing, duplicate: true };
    const prior = await tx.select({ total: sum(rentalPayoutsTable.amount) })
      .from(rentalPayoutsTable).where(and(
        eq(rentalPayoutsTable.paymentId, paymentId),
        eq(rentalPayoutsTable.status, "reported_manual"),
      ));
    const refundedOperatorShare = Math.round(
      Math.min(payment.refundedAmount, payment.amount) * payment.operatorShareAmount / payment.amount,
    );
    const available = Math.max(0, payment.operatorShareAmount - refundedOperatorShare - Number(prior[0]?.total ?? 0));
    if (available <= 0) return { status: 409 as const, error: "No operator share remains available to report" };
    const [payout] = await tx.insert(rentalPayoutsTable).values({
      paymentId,
      amount: available,
      currency: payment.currency,
      reference: parsed.data.reference,
      notes: parsed.data.notes,
      reportedBy: `admin:${String((req.session as unknown as Record<string, { username?: string }>).admin?.username ?? "unknown")}`,
    }).returning();
    return { status: 201 as const, payout, availableAfter: 0 };
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(result.status).json({
    payout: result.payout,
    duplicate: "duplicate" in result ? result.duplicate : false,
    transferInitiated: false,
    notice: "This is an admin-reported manual payout record; no Stripe transfer was created or verified.",
  });
});

router.get("/partner/rental/earnings", authenticatePartner, async (req, res): Promise<void> => {
  if (!isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) {
    res.status(404).json({ error: "Rental marketplace is disabled" });
    return;
  }
  const operatorId = partnerIdentity(req).operatorId;
  const payments = await db.select().from(rentalPaymentsTable).where(and(
    eq(rentalPaymentsTable.operatorId, operatorId),
    inArray(rentalPaymentsTable.status, ["paid", "partially_refunded", "refunded", "disputed", "chargeback"]),
  )).orderBy(desc(rentalPaymentsTable.paidAt));
  const paymentIds = payments.map((payment) => payment.id);
  const [refunds, payouts, disputes] = paymentIds.length
    ? await Promise.all([
      db.select().from(rentalRefundsTable).where(inArray(rentalRefundsTable.paymentId, paymentIds)),
      db.select().from(rentalPayoutsTable).where(inArray(rentalPayoutsTable.paymentId, paymentIds)),
      db.select().from(rentalDisputesTable).where(inArray(rentalDisputesTable.paymentId, paymentIds)),
    ])
    : [[], [], []];
  res.set("Cache-Control", "no-store");
  res.json({
    payments: payments.map((payment) => ({
      id: payment.id,
      reservationId: payment.reservationId,
      status: payment.status,
      currency: payment.currency,
      amount: payment.amount,
      commissionAmount: payment.commissionAmount,
      commissionPercent: payment.commissionBasisPoints / 100,
      operatorShareAmount: payment.operatorShareAmount,
      refundedAmount: payment.refundedAmount,
      paidAt: payment.paidAt,
      refunds: refunds.filter((item) => item.paymentId === payment.id),
      payouts: payouts.filter((item) => item.paymentId === payment.id),
      disputes: disputes.filter((item) => item.paymentId === payment.id),
      payoutNotice: "Payout is manual and must be reconciled separately; no automatic transfer is configured.",
    })),
  });
});

export default router;