import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import Stripe from "stripe";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  rentalDriversTable,
  rentalPaymentsTable,
  rentalRefundsTable,
  rentalNotificationsTable,
  rentalOperatorsTable,
  rentalReservationExceptionsTable,
  rentalReservationAddonsTable,
  rentalReservationsTable,
  rentalTripLedgerTable,
  rentalVehiclesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { isMarketplaceEnabled } from "../lib/rental-request-policy.mjs";
import {
  canAcceptOperatorCancellationChoice,
  cancellationRefund,
  extensionQuoteMatches,
  isExtensionApproved,
  isQuoteLive,
  savedCancellationPercent,
} from "../lib/rental-exception-policy.mjs";
import { calculatePrice } from "../lib/rental-pricing";
import { queueRentalNotification } from "../lib/rental-events";
import { logger } from "../lib/logger";
import { requireAdminAuth } from "../middlewares/admin-auth";
import { authenticatePartner, partnerIdentity } from "./partner";
import { isVehicleAvailable } from "./rental-vehicles";

const router: IRouter = Router();
const QuoteTtl = 15 * 60_000;
const ConsentBody = z.object({
  quoteId: z.coerce.number().int().positive(),
  accepted: z.literal(true),
  choice: z.enum(["full_refund"]).optional(),
}).strict();
const CancellationReasonText = {
  customer: "The customer requested cancellation.",
  operator: "The operator cannot fulfill the accepted reservation.",
  no_show: "The customer did not arrive for the scheduled pickup.",
  weather: "Weather conditions prevent safe or practical fulfillment.",
} as const;

function id(value: string | string[] | undefined): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe payments are not configured");
  return new Stripe(key);
}
function publicOrigin(): string {
  const configured = process.env.RENTAL_PUBLIC_BASE_URL?.trim();
  if (!configured) throw new Error("Rental public URL is not configured");
  const url = new URL(configured);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Rental public URL is invalid");
  return url.origin;
}
function policyOf(reservation: typeof rentalReservationsTable.$inferSelect): Record<string, unknown> {
  const offer = reservation.marketplaceOfferSnapshot;
  if (!offer || typeof offer !== "object" || Array.isArray(offer)) return {};
  const snapshot = (offer as Record<string, unknown>).policy;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const policy = (snapshot as Record<string, unknown>).marketplace;
  return policy && typeof policy === "object" && !Array.isArray(policy)
    ? policy as Record<string, unknown>
    : snapshot as Record<string, unknown>;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected exception error";
}

async function queueOverdueNotice(input: {
  email: string | null;
  key: string;
  bookingId: number;
  role: "customer" | "operator" | "platform";
  message: string;
}) {
  if (input.email) {
    return queueRentalNotification({
      email: input.email,
      eventType: "overdue_alert",
      bookingId: input.bookingId,
      dedupeKey: input.key,
      extra: { message: input.message, recipientRole: input.role },
    });
  }
  const [inserted] = await db.insert(rentalNotificationsTable).values({
    email: null,
    eventType: "alert",
    channel: "smtp",
    dedupeKey: input.key,
    deliveryStatus: "unconfigured",
    lastError: `${input.role} overdue alert recipient email is not configured.`,
    payload: {
      locale: "en",
      bookingId: input.bookingId,
      recipientRole: input.role,
      localeTemplates: {
        en: { subject: `Overdue rental #${input.bookingId}`, body: input.message },
        ja: { subject: `期限超過のレンタル #${input.bookingId}`, body: input.message },
      },
    },
  }).onConflictDoNothing({ target: rentalNotificationsTable.dedupeKey }).returning();
  if (inserted) return inserted;
  const [existing] = await db.select().from(rentalNotificationsTable)
    .where(eq(rentalNotificationsTable.dedupeKey, input.key));
  return existing;
}

async function reconcileBaseRefund(paymentId: number, reservationId: number) {
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(rentalPaymentsTable)
      .where(eq(rentalPaymentsTable.id, paymentId)).for("update");
    const [reservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservationId)).for("update");
    if (!payment || !reservation) throw new Error("Refund ledger reconciliation target is missing");
    const refunds = await tx.select().from(rentalRefundsTable)
      .where(and(eq(rentalRefundsTable.paymentId, paymentId), eq(rentalRefundsTable.status, "succeeded")));
    const refundedAmount = refunds.reduce((sum, refund) => sum + refund.amount, 0);
    const chargedAmount = payment.chargedAmount ?? payment.amount;
    const status = payment.status === "disputed" || payment.status === "chargeback"
      ? payment.status
      : refundedAmount >= chargedAmount ? "refunded"
        : refundedAmount > 0 ? "partially_refunded" : payment.status;
    const reservationPaymentStatus: typeof rentalReservationsTable.$inferSelect.paymentStatus =
      ["pending", "authorized", "partial_paid", "paid", "refund_pending", "partially_refunded", "refunded", "chargeback", "disputed", "void"]
        .includes(status) ? status as typeof rentalReservationsTable.$inferSelect.paymentStatus : "pending";
    await tx.update(rentalPaymentsTable).set({ refundedAmount, status, updatedAt: new Date() })
      .where(eq(rentalPaymentsTable.id, payment.id));
    await tx.update(rentalReservationsTable).set({
      paymentStatus: reservationPaymentStatus,
      refundAmount: refundedAmount,
      updatedAt: new Date(),
    }).where(eq(rentalReservationsTable.id, reservation.id));
  });
}

export async function dispatchOverdueAlerts(now = new Date()) {
  if (!isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) return { examined: 0, recipientRecords: 0 };
  const overdue = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.source, "marketplace_request"),
    inArray(rentalReservationsTable.status, ["in_rental", "overdue", "return_initiated"]),
    lte(rentalReservationsTable.returnAt, now),
    isNull(rentalReservationsTable.deletedAt),
  ));
  const [platform] = await db.select().from(rentalOperatorsTable)
    .where(eq(rentalOperatorsTable.isPlatform, true));
  const configuredPlatformEmail = process.env.RENTAL_PLATFORM_ALERT_EMAIL?.trim();
  const platformEmail = configuredPlatformEmail && z.string().email().safeParse(configuredPlatformEmail).success
    ? configuredPlatformEmail
    : platform?.contactEmail ?? null;
  const day = now.toISOString().slice(0, 10);
  let recipientRecords = 0;
  for (const reservation of overdue) {
    const [driver] = reservation.primaryDriverId
      ? await db.select().from(rentalDriversTable).where(eq(rentalDriversTable.id, reservation.primaryDriverId))
      : [];
    const [operator] = reservation.operatorId
      ? await db.select().from(rentalOperatorsTable).where(eq(rentalOperatorsTable.id, reservation.operatorId))
      : [];
    const key = `rental-overdue-${reservation.id}-${reservation.returnAt.getTime()}-${day}`;
    const common = `Reservation #${reservation.id} was due back at ${reservation.returnAt.toISOString()}.`;
    await Promise.all([
      queueOverdueNotice({
        email: driver?.email ?? null,
        key: `${key}:customer`,
        bookingId: reservation.id,
        role: "customer",
        message: `Your rental was due back at ${reservation.returnAt.toISOString()}. Please contact the operator immediately.`,
      }),
      queueOverdueNotice({
        email: operator?.contactEmail ?? null,
        key: `${key}:operator`,
        bookingId: reservation.id,
        role: "operator",
        message: `${common} Contact the customer and update the trip status.`,
      }),
      queueOverdueNotice({
        email: platformEmail,
        key: `${key}:platform`,
        bookingId: reservation.id,
        role: "platform",
        message: `${common} This platform alert requires operator follow-up.`,
      }),
    ]);
    recipientRecords += 3;
  }
  return { examined: overdue.length, recipientRecords };
}

// Importing the API router starts one bounded, deduplicated overdue sweep loop.
// A process-level interval is unref'd and catches failures so it cannot hold
// shutdown open or create unhandled promise rejections.
const overdueSweepIntervalMs = 15 * 60_000;
let overdueSweepTimer: NodeJS.Timeout | undefined;
async function scheduleOverdueSweep(): Promise<void> {
  try {
    await dispatchOverdueAlerts();
  } catch (error) {
    logger.error({ err: error, action: "rental_overdue_sweep_failed" });
  } finally {
    overdueSweepTimer = setTimeout(() => void scheduleOverdueSweep(), overdueSweepIntervalMs);
    overdueSweepTimer.unref();
  }
}
void scheduleOverdueSweep();

async function customerReservation(req: Request, res: Response) {
  const reservationId = id(req.params.id);
  const session = req.session as unknown as Record<string, unknown>;
  const email = typeof session.rentalCustomerEmail === "string" ? session.rentalCustomerEmail.trim().toLowerCase() : "";
  if (!reservationId || !email || (session.rentalCustomerBookingId != null && session.rentalCustomerBookingId !== reservationId)) {
    res.status(401).json({ error: "Please look up this booking first" });
    return null;
  }
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId),
    eq(rentalReservationsTable.source, "marketplace_request"),
    isNull(rentalReservationsTable.deletedAt),
  ));
  if (!reservation?.primaryDriverId) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }
  const [driver] = await db.select().from(rentalDriversTable).where(and(
    eq(rentalDriversTable.id, reservation.primaryDriverId),
    eq(rentalDriversTable.email, email),
  ));
  if (!driver) {
    res.status(404).json({ error: "Booking not found" });
    return null;
  }
  return reservation;
}
async function createQuote(input: {
  reservation: typeof rentalReservationsTable.$inferSelect;
  kind: "cancellation" | "extension" | "alternative";
  quotedAmount: number | null;
  quoteSnapshot: Record<string, unknown>;
  policySnapshot: Record<string, unknown>;
  targetVehicleId?: number | null;
}) {
  const [row] = await db.insert(rentalReservationExceptionsTable).values({
    reservationId: input.reservation.id,
    operatorId: input.reservation.operatorId!,
    kind: input.kind,
    status: "quoted",
    quotedAmount: input.quotedAmount,
    quoteSnapshot: input.quoteSnapshot,
    policySnapshot: input.policySnapshot,
    targetVehicleId: input.targetVehicleId ?? null,
    expiresAt: new Date(Date.now() + QuoteTtl),
  }).returning();
  return row;
}
async function createCheckout(row: typeof rentalReservationExceptionsTable.$inferSelect, reservation: typeof rentalReservationsTable.$inferSelect) {
  if (row.kind === "extension" && !isExtensionApproved(row.quoteSnapshot)) {
    throw new Error("Operator approval is required before extension checkout");
  }
  if (row.quotedAmount == null || row.quotedAmount < 50) {
    throw new Error("Stripe JPY Checkout requires an additional payment of at least JPY 50");
  }
  const base = publicOrigin();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    currency: "jpy",
    line_items: [{
      price_data: {
        currency: "jpy",
        unit_amount: row.quotedAmount,
        product_data: {
          name: row.kind === "extension" ? `Rental extension #${reservation.id}` : `Alternate vehicle for rental #${reservation.id}`,
        },
      },
      quantity: 1,
    }],
    metadata: { rentalExceptionId: String(row.id), rentalReservationId: String(reservation.id) },
    success_url: `${base}/rentalcar/payment/return?exceptionId=${row.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/rentalcar/my-bookings/${reservation.id}`,
    // Stripe requires Checkout sessions to live at least 30 minutes. Local quote
    // expiry remains authoritative and late successful charges are refunded.
    expires_at: Math.floor((Date.now() + 30 * 60_000) / 1000),
  }, { idempotencyKey: `rental-exception-checkout-${row.id}` });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  await db.update(rentalReservationExceptionsTable).set({
    status: "checkout_pending",
    stripeCheckoutSessionId: session.id,
    updatedAt: new Date(),
  }).where(eq(rentalReservationExceptionsTable.id, row.id));
  return { checkoutUrl: session.url, expiresAt: new Date(session.expires_at * 1000).toISOString() };
}
function reservationLiveForException(status: string) {
  return ["confirmed", "awaiting_pickup", "vehicle_dispatched", "in_rental", "overdue", "return_initiated"].includes(status);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function priceExtension(tx: any, reservation: typeof rentalReservationsTable.$inferSelect, newReturnAt: Date) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${reservation.vehicleId})`);
  if (!await isVehicleAvailable(reservation.vehicleId, reservation.pickupAt, newReturnAt, undefined, reservation.id, tx)) {
    return null;
  }
  const savedAddons = await tx.select().from(rentalReservationAddonsTable)
    .where(eq(rentalReservationAddonsTable.reservationId, reservation.id));
  const pricing = await calculatePrice({
    vehicleId: reservation.vehicleId,
    pickupAt: reservation.pickupAt,
    returnAt: newReturnAt,
    pickupLocation: reservation.pickupLocation,
    returnLocation: reservation.returnLocation,
    addons: savedAddons.map((addon: { addonId: number; qty: number }) => ({ addonId: addon.addonId, qty: addon.qty })),
  }, tx);
  const newTotal = Math.max(Math.round(reservation.finalTotal), Math.round(pricing.finalTotal));
  return {
    pricing,
    newTotal,
    additionalAmount: newTotal - Math.round(reservation.finalTotal),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function extensionQuoteMatchesCurrent(tx: any, row: typeof rentalReservationExceptionsTable.$inferSelect, reservation: typeof rentalReservationsTable.$inferSelect) {
  if (row.kind !== "extension" || !isQuoteLive(row.expiresAt)) return false;
  const newReturnAt = new Date(String(row.quoteSnapshot.newReturnAt));
  if (!Number.isFinite(newReturnAt.getTime()) || newReturnAt <= reservation.returnAt) return false;
  const current = await priceExtension(tx, reservation, newReturnAt);
  if (!current) return false;
  return extensionQuoteMatches(row.quoteSnapshot, {
    vehicleId: reservation.vehicleId,
    returnAt: reservation.returnAt.toISOString(),
    finalTotal: reservation.finalTotal,
    newTotal: current.newTotal,
    additionalAmount: current.additionalAmount,
  }) && row.quotedAmount === current.additionalAmount;
}

async function applyNoCharge(rowId: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(rentalReservationExceptionsTable)
      .where(eq(rentalReservationExceptionsTable.id, rowId)).for("update");
    const [reservation] = row
      ? await tx.select().from(rentalReservationsTable).where(eq(rentalReservationsTable.id, row.reservationId)).for("update")
      : [];
    if (!row || !reservation || row.status !== "checkout_pending" || !row.consentAt || !isQuoteLive(row.expiresAt)) {
      throw Object.assign(new Error("Quote is expired or not accepted"), { status: 409 });
    }
    if (!reservationLiveForException(reservation.status)) {
      throw Object.assign(new Error("Reservation is no longer eligible for this exception"), { status: 409 });
    }
    const newReturnAt = row.kind === "extension" ? new Date(String(row.quoteSnapshot.newReturnAt)) : reservation.returnAt;
    const targetVehicleId = row.kind === "alternative" ? row.targetVehicleId : reservation.vehicleId;
    if (targetVehicleId == null) throw Object.assign(new Error("Alternative quote has no vehicle"), { status: 409 });
    for (const vehicleId of [...new Set([reservation.vehicleId, targetVehicleId])].sort((a, b) => a - b)) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);
    }
    const exceptionStillValid = row.kind === "extension"
      ? isExtensionApproved(row.quoteSnapshot) && await extensionQuoteMatchesCurrent(tx, row, reservation)
      : await isVehicleAvailable(targetVehicleId, reservation.pickupAt, newReturnAt, undefined, reservation.id, tx);
    if (!exceptionStillValid) {
      throw Object.assign(new Error("Vehicle is no longer available, including its turnaround buffer"), { status: 409 });
    }
    const total = row.kind === "alternative"
      ? Number(row.quoteSnapshot.alternativeTotal)
      : Number(row.quoteSnapshot.newTotal);
    await tx.update(rentalReservationsTable).set({
      vehicleId: targetVehicleId,
      returnAt: newReturnAt,
      finalTotal: total,
      updatedAt: new Date(),
    }).where(eq(rentalReservationsTable.id, reservation.id));
    await tx.update(rentalReservationExceptionsTable).set({
      status: "applied", providerStatus: "no_payment_due", completedAt: new Date(), updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, row.id));
    const parentOfferId = Number(row.quoteSnapshot.operatorCancellationQuoteId);
    if (Number.isSafeInteger(parentOfferId) && parentOfferId > 0) {
      await tx.update(rentalReservationExceptionsTable).set({
        status: "declined",
        providerStatus: "customer_accepted_alternative",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(rentalReservationExceptionsTable.id, parentOfferId));
    }
    return { status: "applied", reservationId: reservation.id };
  });
}
async function refundPaidException(row: typeof rentalReservationExceptionsTable.$inferSelect, paymentIntentId: string, amount: number) {
  const refund = await stripe().refunds.create({
    payment_intent: paymentIntentId,
    amount,
    reason: "requested_by_customer",
    metadata: { rentalExceptionId: String(row.id), rentalReservationId: String(row.reservationId) },
  }, { idempotencyKey: `rental-exception-refund-${row.id}` });
  await db.update(rentalReservationExceptionsTable).set({
    stripePaymentIntentId: paymentIntentId,
    stripeRefundId: refund.id,
    refundAmount: amount,
    providerStatus: refund.status ?? "pending",
    status: refund.status === "succeeded" ? "cancelled"
      : refund.status === "failed" || refund.status === "canceled" ? "refund_failed" : "refund_pending",
    completedAt: refund.status === "succeeded" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(rentalReservationExceptionsTable.id, row.id));
  return refund.status ?? "pending";
}
async function verifyAndApply(row: typeof rentalReservationExceptionsTable.$inferSelect, session: Stripe.Checkout.Session) {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId || session.payment_status !== "paid" || session.currency?.toLowerCase() !== "jpy" ||
      session.metadata?.rentalExceptionId !== String(row.id) || session.id !== row.stripeCheckoutSessionId ||
      session.amount_total !== row.quotedAmount) {
    throw Object.assign(new Error("Stripe has not verified the exact quoted payment"), { status: 409 });
  }
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(rentalReservationExceptionsTable)
      .where(eq(rentalReservationExceptionsTable.id, row.id)).for("update");
    if (!locked) throw Object.assign(new Error("Exception quote not found"), { status: 404 });
    if (locked.status === "applied") return { applied: true, refund: false, row: locked };
    if (locked.status === "expired" && locked.consentAt) {
      return { applied: false, refund: true, row: locked };
    }
    if (locked.status !== "checkout_pending" || !locked.consentAt) {
      throw Object.assign(new Error("Exception quote has not been accepted"), { status: 409 });
    }
    const [reservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, locked.reservationId)).for("update");
    if (!reservation || reservation.operatorId !== locked.operatorId) {
      throw Object.assign(new Error("Reservation not found"), { status: 404 });
    }
    if (!isQuoteLive(locked.expiresAt) || !reservationLiveForException(reservation.status)) {
      return { applied: false, refund: true, row: locked };
    }
    if (locked.kind === "extension" &&
        (!isExtensionApproved(locked.quoteSnapshot) || !await extensionQuoteMatchesCurrent(tx, locked, reservation))) {
      return { applied: false, refund: true, row: locked };
    }
    const newReturnAt = locked.kind === "extension" ? new Date(String(locked.quoteSnapshot.newReturnAt)) : reservation.returnAt;
    const targetVehicleId = locked.kind === "alternative" ? locked.targetVehicleId : reservation.vehicleId;
    if (targetVehicleId == null) throw Object.assign(new Error("Alternative quote has no vehicle"), { status: 409 });
    for (const vehicleId of [...new Set([reservation.vehicleId, targetVehicleId])].sort((a, b) => a - b)) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);
    }
    if (!await isVehicleAvailable(targetVehicleId, reservation.pickupAt, newReturnAt, undefined, reservation.id, tx)) {
      return { applied: false, refund: true, row: locked };
    }
    const total = locked.kind === "alternative"
      ? Number(locked.quoteSnapshot.alternativeTotal)
      : Number(locked.quoteSnapshot.newTotal);
    if (!Number.isSafeInteger(total) || total < reservation.finalTotal) {
      throw Object.assign(new Error("Accepted quote total is invalid"), { status: 409 });
    }
    await tx.update(rentalReservationsTable).set({
      vehicleId: targetVehicleId,
      returnAt: newReturnAt,
      finalTotal: total,
      paidAmount: reservation.paidAmount + (locked.quotedAmount ?? 0),
      updatedAt: new Date(),
    }).where(eq(rentalReservationsTable.id, reservation.id));
    await tx.insert(rentalTripLedgerTable).values({
      reservationId: reservation.id,
      operatorId: locked.operatorId,
      entryType: locked.kind === "extension" ? "extension_payment" : "alternative_vehicle_payment",
      amount: locked.quotedAmount ?? 0,
      currency: "jpy",
      status: "posted",
      description: locked.kind === "extension" ? "Verified payment for rental extension" : "Verified payment for operator alternate vehicle",
      savedTerms: {
        exceptionId: locked.id,
        quoteSnapshot: locked.quoteSnapshot,
        policySnapshot: locked.policySnapshot,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      },
    });
    const [applied] = await tx.update(rentalReservationExceptionsTable).set({
      status: "applied",
      stripePaymentIntentId: paymentIntentId,
      providerStatus: "paid",
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, locked.id)).returning();
    const parentOfferId = Number(locked.quoteSnapshot.operatorCancellationQuoteId);
    if (Number.isSafeInteger(parentOfferId) && parentOfferId > 0) {
      await tx.update(rentalReservationExceptionsTable).set({
        status: "declined",
        providerStatus: "customer_accepted_alternative",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(rentalReservationExceptionsTable.id, parentOfferId));
    }
    return { applied: true, refund: false, row: applied };
  });
  if (result.refund) {
    const refundStatus = await refundPaidException(result.row, paymentIntentId, session.amount_total ?? 0);
    return { status: refundStatus === "succeeded" ? "refunded" : "refund_pending", applied: false, refundStatus };
  }
  return { status: result.row.status, applied: result.applied };
}

/** Called by the signed existing Stripe webhook before unmatched-session reconciliation. */
export async function reconcileRentalExceptionCheckout(
  session: Stripe.Checkout.Session,
  eventType: string,
): Promise<boolean> {
  const exceptionId = Number(session.metadata?.rentalExceptionId);
  if (!Number.isSafeInteger(exceptionId) || exceptionId < 1) return false;
  const [row] = await db.select().from(rentalReservationExceptionsTable)
    .where(eq(rentalReservationExceptionsTable.id, exceptionId));
  if (!row || row.stripeCheckoutSessionId !== session.id ||
      session.metadata?.rentalReservationId !== String(row.reservationId)) {
    throw new Error("Signed Stripe Checkout does not match its rental exception quote");
  }
  if (eventType === "checkout.session.expired" || eventType === "checkout.session.async_payment_failed") {
    if (row.status === "checkout_pending") {
      await db.transaction(async (tx) => {
        const now = new Date();
        await tx.update(rentalReservationExceptionsTable).set({
          status: "expired",
          providerStatus: eventType === "checkout.session.expired" ? "expired" : "payment_failed",
          updatedAt: now,
        }).where(eq(rentalReservationExceptionsTable.id, row.id));
        const parentId = Number(row.quoteSnapshot.operatorCancellationQuoteId);
        if (row.kind === "alternative" && Number.isSafeInteger(parentId) && parentId > 0) {
          const [parent] = await tx.select().from(rentalReservationExceptionsTable)
            .where(eq(rentalReservationExceptionsTable.id, parentId)).for("update");
          if (parent?.status === "quoted" && parent.quoteSnapshot.selectedChoice === "alternative") {
            const { selectedChoice: _selectedChoice, customerAcceptedAt: _acceptedAt, ...snapshot } = parent.quoteSnapshot;
            await tx.update(rentalReservationExceptionsTable).set({
              quoteSnapshot: snapshot,
              consentAt: null,
              updatedAt: now,
            }).where(eq(rentalReservationExceptionsTable.id, parent.id));
          }
        }
      });
    }
    return true;
  }
  if (session.payment_status !== "paid") return true;
  await verifyAndApply(row, session);
  return true;
}

/** Reconcile extension/alternate refunds that intentionally have no base booking payment row. */
export async function reconcileRentalExceptionRefund(refund: Stripe.Refund): Promise<boolean> {
  const exceptionId = Number(refund.metadata?.rentalExceptionId);
  if (!Number.isSafeInteger(exceptionId) || exceptionId < 1) return false;
  const paymentIntentId = typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : refund.payment_intent?.id;
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(rentalReservationExceptionsTable)
      .where(eq(rentalReservationExceptionsTable.id, exceptionId)).for("update");
    if (!row || !["extension", "alternative"].includes(row.kind) ||
        !paymentIntentId || row.stripePaymentIntentId !== paymentIntentId ||
        (row.stripeRefundId && row.stripeRefundId !== refund.id) ||
        (refund.metadata?.rentalReservationId && refund.metadata.rentalReservationId !== String(row.reservationId)) ||
        refund.currency.toLowerCase() !== "jpy" ||
        !Number.isSafeInteger(refund.amount) || refund.amount <= 0 ||
        (row.refundAmount != null && row.refundAmount !== refund.amount) ||
        row.quotedAmount !== refund.amount ||
        !["checkout_pending", "refund_pending", "refund_failed", "cancelled"].includes(row.status)) {
      throw new Error("Stripe refund does not match an outstanding rental exception payment");
    }
    // Webhooks can be delivered out of order. A pending event must never
    // reopen an already settled refund or clear its completion timestamp.
    const incoming = refund.status === "succeeded" ? "succeeded"
      : refund.status === "failed" || refund.status === "canceled" ? refund.status : "pending";
    const settled = row.providerStatus === "succeeded" ? "succeeded"
      : incoming === "pending" && ["failed", "canceled"].includes(row.providerStatus ?? "")
        ? row.providerStatus! : incoming;
    await tx.update(rentalReservationExceptionsTable).set({
      stripeRefundId: refund.id,
      refundAmount: refund.amount,
      providerStatus: settled,
      status: settled === "succeeded" ? "cancelled"
        : settled === "failed" || settled === "canceled" ? "refund_failed" : "refund_pending",
      completedAt: settled === "succeeded" ? row.completedAt ?? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, row.id));
  });
  return true;
}

router.use((_req, res, next) => {
  if (!isMarketplaceEnabled(process.env.RENTAL_MARKETPLACE_ENABLED)) {
    next("router");
    return;
  }
  next();
});

router.post("/rental/exceptions/reservations/:id/cancellation/quote", async (req, res): Promise<void> => {
  const parsed = z.object({
    reason: z.enum(["customer", "no_show", "weather"]).default("customer"),
  }).strict().safeParse(req.body ?? {});
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (reservation.operatorId == null || !["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(reservation.status)) {
    res.status(409).json({ error: "This reservation is not eligible for online cancellation" }); return;
  }
  const [payment] = await db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.reservationId, reservation.id));
  if (!payment || !["paid", "partially_refunded"].includes(payment.status)) {
    res.status(409).json({ error: "A verified payment is required for a cancellation quote" }); return;
  }
  const policy = policyOf(reservation);
  const cancellationPolicy = policy.marketplaceCancellationPolicy ?? policy.cancellationPolicy;
  const percent = savedCancellationPercent(cancellationPolicy, reservation.pickupAt);
  const reason = parsed.data.reason;
  const policyReason = percent == null
    ? "The saved offer does not contain a complete, machine-readable cancellation schedule; operator review is required."
    : `Saved cancellation schedule allows a ${percent}% refund for this cancellation at the quoted time.`;
  const refunds = await db.select().from(rentalRefundsTable).where(eq(rentalRefundsTable.paymentId, payment.id));
  const paid = payment.chargedAmount ?? payment.amount;
  const alreadyRefunded = refunds.filter((refund) => refund.status === "succeeded").reduce((sum, refund) => sum + refund.amount, 0);
  const refundFundsReserved = refunds.filter((refund) => !["failed", "canceled"].includes(refund.status))
    .reduce((sum, refund) => sum + refund.amount, 0);
  const remainingRefundable = Math.max(0, paid - refundFundsReserved);
  const amount = percent == null ? null : cancellationRefund(remainingRefundable, percent);
  const row = await createQuote({
    reservation,
    kind: "cancellation",
    quotedAmount: amount,
    quoteSnapshot: {
      pickupAt: reservation.pickupAt.toISOString(), reservationStatus: reservation.status,
      paymentId: payment.id, totalPaid: paid, alreadyRefunded, refundFundsReserved, refundAmount: amount,
      refundPercent: percent, manualReviewRequired: percent == null,
      reason, reasonText: CancellationReasonText[reason], policyReason,
      capturedAt: new Date().toISOString(),
    },
    policySnapshot: { policy: reservation.marketplaceOfferSnapshot, cancellationPolicy: cancellationPolicy ?? null },
  });
  res.status(201).json({
    quoteId: row.id, refundableAmount: amount,
    retainedAmount: amount == null ? null : Math.max(0, paid - alreadyRefunded - amount),
    reason, reasonText: CancellationReasonText[reason], policyReason,
    manualReviewRequired: percent == null,
    policySnapshot: row.policySnapshot, expiresAt: row.expiresAt.toISOString(),
  });
});

router.post("/partner/rental/exceptions/reservations/:id/cancellation/offer", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = id(req.params.id);
  const parsed = z.object({
    reason: z.enum(["operator", "no_show", "weather"]),
    alternativeVehicleId: z.coerce.number().int().positive(),
  }).strict().safeParse(req.body);
  const partner = partnerIdentity(req);
  if (!reservationId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return;
  }
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId),
    eq(rentalReservationsTable.operatorId, partner.operatorId),
    eq(rentalReservationsTable.source, "marketplace_request"),
    isNull(rentalReservationsTable.deletedAt),
  ));
  if (!reservation || !["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(reservation.status)) {
    res.status(404).json({ error: "Operator-scoped active reservation not found" }); return;
  }
  const [payment] = await db.select().from(rentalPaymentsTable)
    .where(eq(rentalPaymentsTable.reservationId, reservation.id));
  if (!payment || !["paid", "partially_refunded"].includes(payment.status)) {
    res.status(409).json({ error: "Verified payment is required before offering a full refund" }); return;
  }
  const refunds = await db.select().from(rentalRefundsTable)
    .where(eq(rentalRefundsTable.paymentId, payment.id));
  const remainingRefundable = Math.max(0, (payment.chargedAmount ?? payment.amount) -
    refunds.filter((refund) => !["failed", "canceled"].includes(refund.status))
      .reduce((sum, refund) => sum + refund.amount, 0));
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, parsed.data.alternativeVehicleId),
    eq(rentalVehiclesTable.operatorId, partner.operatorId),
    eq(rentalVehiclesTable.status, "published"),
    isNull(rentalVehiclesTable.deletedAt),
  ));
  if (!vehicle || vehicle.id === reservation.vehicleId) {
    res.status(404).json({ error: "Alternative vehicle not found for this operator" }); return;
  }
  const quote = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservation.id)).for("update");
    if (!current || !["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(current.status)) {
      return { ineligible: true as const };
    }
    const activeOffers = await tx.select().from(rentalReservationExceptionsTable).where(and(
      eq(rentalReservationExceptionsTable.reservationId, reservation.id),
      eq(rentalReservationExceptionsTable.kind, "cancellation"),
      eq(rentalReservationExceptionsTable.status, "quoted"),
    ));
    const priorOffer = activeOffers.find((offer) =>
      offer.quoteSnapshot.operatorInitiated === true && isQuoteLive(offer.expiresAt));
    if (priorOffer) return { existingOfferId: priorOffer.id };
    for (const vehicleId of [...new Set([reservation.vehicleId, vehicle.id])].sort((left, right) => left - right)) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${vehicleId})`);
    }
    if (!await isVehicleAvailable(vehicle.id, reservation.pickupAt, reservation.returnAt, undefined, reservation.id, tx)) {
      return null;
    }
    const addons = await tx.select().from(rentalReservationAddonsTable)
      .where(eq(rentalReservationAddonsTable.reservationId, reservation.id));
    const pricing = await calculatePrice({
      vehicleId: vehicle.id, pickupAt: reservation.pickupAt, returnAt: reservation.returnAt,
      pickupLocation: reservation.pickupLocation, returnLocation: reservation.returnLocation,
      addons: addons.map((addon) => ({ addonId: addon.addonId, qty: addon.qty })),
    }, tx);
    const alternativeTotal = Math.round(pricing.finalTotal);
    if (alternativeTotal < Math.round(reservation.finalTotal)) return { lowerPriced: true as const };
    const additionalAmount = alternativeTotal - Math.round(reservation.finalTotal);
    if (additionalAmount > 0 && additionalAmount < 50) return { minimumPayment: true as const };
    const now = new Date();
    const expiresAt = new Date(now.getTime() + QuoteTtl);
    const reason = parsed.data.reason;
    const reasonText = CancellationReasonText[reason];
    const policyReason = "Operator-initiated resolution offer: the customer may explicitly accept the offered alternate vehicle or the quoted full refund. No refund is submitted without customer acceptance.";
    const policySnapshot = {
      policy: reservation.marketplaceOfferSnapshot,
      operatorCancellationReason: reason,
      savedCancellationPolicy: policyOf(reservation).marketplaceCancellationPolicy ?? policyOf(reservation).cancellationPolicy ?? null,
    };
    const [cancellationOffer] = await tx.insert(rentalReservationExceptionsTable).values({
      reservationId: reservation.id,
      operatorId: partner.operatorId,
      kind: "cancellation",
      status: "quoted",
      quotedAmount: remainingRefundable,
      quoteSnapshot: {
        operatorInitiated: true,
        reason,
        reasonText,
        policyReason,
        manualReviewRequired: false,
        paymentId: payment.id,
        totalPaid: payment.chargedAmount ?? payment.amount,
        alreadyRefunded: (payment.chargedAmount ?? payment.amount) - remainingRefundable,
        refundAmount: remainingRefundable,
        alternativeVehicleId: vehicle.id,
        operatorStaffId: partner.staffId,
        capturedAt: now.toISOString(),
      },
      policySnapshot,
      expiresAt,
    }).returning();
    const [alternativeOffer] = await tx.insert(rentalReservationExceptionsTable).values({
      reservationId: reservation.id,
      operatorId: partner.operatorId,
      kind: "alternative",
      status: "quoted",
      quotedAmount: additionalAmount,
      targetVehicleId: vehicle.id,
      quoteSnapshot: {
        oldVehicleId: reservation.vehicleId,
        targetVehicleId: vehicle.id,
        vehicleName: vehicle.publicTitle,
        oldTotal: reservation.finalTotal,
        alternativeTotal,
        additionalAmount,
        pricing,
        operatorCancellationQuoteId: cancellationOffer.id,
        reason,
        reasonText,
        capturedAt: now.toISOString(),
      },
      policySnapshot: { ...policySnapshot, alternateVehicleConsent: true },
      expiresAt,
    }).returning();
    const snapshot = {
      ...cancellationOffer.quoteSnapshot,
      alternativeQuoteId: alternativeOffer.id,
      alternativeVehicleName: vehicle.publicTitle,
      alternativeAdditionalAmount: additionalAmount,
    };
    const [updatedOffer] = await tx.update(rentalReservationExceptionsTable).set({
      quoteSnapshot: snapshot,
      updatedAt: now,
    }).where(eq(rentalReservationExceptionsTable.id, cancellationOffer.id)).returning();
    return { cancellationOffer: updatedOffer, alternativeOffer, alternativeTotal };
  });
  if (!quote) { res.status(409).json({ error: "Alternative vehicle is unavailable for this reservation" }); return; }
  if ("ineligible" in quote) { res.status(409).json({ error: "Reservation is no longer eligible for an operator cancellation offer" }); return; }
  if ("existingOfferId" in quote) {
    res.status(409).json({ error: "An active operator cancellation offer already exists", quoteId: quote.existingOfferId }); return;
  }
  if ("lowerPriced" in quote) {
    res.status(409).json({ error: "Lower-priced alternatives require a separately approved refund quote" }); return;
  }
  if ("minimumPayment" in quote) {
    res.status(409).json({ error: "Alternative additional payment is below Stripe's minimum JPY Checkout amount" }); return;
  }
  res.status(201).json({
    quoteId: quote.cancellationOffer.id,
    alternativeQuoteId: quote.alternativeOffer.id,
    reason: parsed.data.reason,
    reasonText: CancellationReasonText[parsed.data.reason],
    policyReason: quote.cancellationOffer.quoteSnapshot.policyReason,
    fullRefundAmount: quote.cancellationOffer.quotedAmount,
    alternative: {
      vehicleId: vehicle.id,
      vehicleName: vehicle.publicTitle,
      total: quote.alternativeTotal,
      additionalAmount: quote.alternativeOffer.quotedAmount,
    },
    customerConsentRequired: true,
    policySnapshot: quote.cancellationOffer.policySnapshot,
    expiresAt: quote.cancellationOffer.expiresAt.toISOString(),
  });
});

router.get("/rental/exceptions/reservations/:id/cancellation/offers", async (req, res): Promise<void> => {
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  const offers = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "cancellation"),
    eq(rentalReservationExceptionsTable.status, "quoted"),
  ));
  res.json(offers.filter((offer) => offer.quoteSnapshot.operatorInitiated === true && isQuoteLive(offer.expiresAt))
    .map((offer) => ({
      quoteId: offer.id,
      reason: offer.quoteSnapshot.reason,
      reasonText: offer.quoteSnapshot.reasonText,
      policyReason: offer.quoteSnapshot.policyReason,
      selectedChoice: offer.quoteSnapshot.selectedChoice ?? null,
      fullRefundAmount: offer.quotedAmount,
      alternativeQuoteId: offer.quoteSnapshot.alternativeQuoteId,
      alternativeVehicleId: offer.quoteSnapshot.alternativeVehicleId,
      alternativeVehicleName: offer.quoteSnapshot.alternativeVehicleName,
      alternativeAdditionalAmount: offer.quoteSnapshot.alternativeAdditionalAmount,
      customerConsentRequired: true,
      policySnapshot: offer.policySnapshot,
      expiresAt: offer.expiresAt.toISOString(),
    })));
});

router.post("/rental/exceptions/reservations/:id/cancellation/accept-alternative", async (req, res): Promise<void> => {
  const parsed = ConsentBody.safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [cancellationOffer] = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId),
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "cancellation"),
  ));
  const alternativeQuoteId = Number(cancellationOffer?.quoteSnapshot.alternativeQuoteId);
  if (!cancellationOffer || cancellationOffer.quoteSnapshot.operatorInitiated !== true ||
      !Number.isSafeInteger(alternativeQuoteId) || alternativeQuoteId < 1) {
    res.status(404).json({ error: "Operator cancellation offer with an alternative was not found" }); return;
  }
  const prepared = await db.transaction(async (tx) => {
    const [lockedParent] = await tx.select().from(rentalReservationExceptionsTable)
      .where(eq(rentalReservationExceptionsTable.id, cancellationOffer.id)).for("update");
    const [lockedAlternative] = await tx.select().from(rentalReservationExceptionsTable)
      .where(eq(rentalReservationExceptionsTable.id, alternativeQuoteId)).for("update");
    if (lockedParent?.status === "declined" && lockedAlternative?.status === "applied") {
      return { alreadyApplied: true, row: lockedAlternative };
    }
    const chosen = lockedParent?.quoteSnapshot.selectedChoice;
    if (!lockedParent || !lockedAlternative || lockedParent.status !== "quoted" ||
        !isQuoteLive(lockedParent.expiresAt) || !isQuoteLive(lockedAlternative.expiresAt) ||
        !canAcceptOperatorCancellationChoice({
          accepted: parsed.data.accepted,
          choice: "alternative",
          selectedChoice: typeof chosen === "string" ? chosen : null,
        }) ||
        !["quoted", "checkout_pending"].includes(lockedAlternative.status)) {
      return { conflict: true };
    }
    const now = new Date();
    await tx.update(rentalReservationExceptionsTable).set({
      quoteSnapshot: {
        ...lockedParent.quoteSnapshot,
        selectedChoice: "alternative",
        customerAcceptedAt: lockedParent.quoteSnapshot.customerAcceptedAt ?? now.toISOString(),
      },
      consentAt: lockedParent.consentAt ?? now,
      updatedAt: now,
    }).where(eq(rentalReservationExceptionsTable.id, lockedParent.id));
    const [accepted] = await tx.update(rentalReservationExceptionsTable).set({
      consentAt: lockedAlternative.consentAt ?? now,
      status: lockedAlternative.quotedAmount === 0 ? "checkout_pending" : lockedAlternative.status,
      updatedAt: now,
    }).where(eq(rentalReservationExceptionsTable.id, lockedAlternative.id)).returning();
    return { row: accepted, alreadyApplied: false };
  });
  if ("conflict" in prepared) {
    res.status(409).json({ error: "The operator cancellation offer expired or another choice was already selected" }); return;
  }
  if (prepared.alreadyApplied) { res.json({ status: "applied", reservationId: reservation.id }); return; }
  if (prepared.row.quotedAmount === 0) {
    try { res.json(await applyNoCharge(prepared.row.id)); }
    catch (error) { res.status(409).json({ error: errorMessage(error) }); }
    return;
  }
  try { res.json({ quoteId: prepared.row.id, ...(await createCheckout(prepared.row, reservation)) }); }
  catch (error) { res.status(503).json({ error: errorMessage(error) }); }
});

router.post("/rental/exceptions/reservations/:id/cancellation/confirm", async (req, res): Promise<void> => {
  const parsed = ConsentBody.safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId),
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "cancellation"),
  ));
  if (!row || row.status !== "quoted" || !isQuoteLive(row.expiresAt)) {
    res.status(409).json({ error: "Cancellation quote is missing or expired" }); return;
  }
  const operatorInitiated = row.quoteSnapshot.operatorInitiated === true;
  const savedChoice = typeof row.quoteSnapshot.selectedChoice === "string" ? row.quoteSnapshot.selectedChoice : null;
  if (operatorInitiated && !canAcceptOperatorCancellationChoice({
    accepted: parsed.data.accepted,
    choice: parsed.data.choice,
    selectedChoice: savedChoice,
  })) {
    res.status(409).json({ error: "Choose and explicitly accept either the offered alternate vehicle or full refund" }); return;
  }
  if (row.quoteSnapshot.manualReviewRequired === true || row.quotedAmount == null) {
    await db.update(rentalReservationExceptionsTable).set({
      status: "operator_review",
      consentAt: new Date(),
      quoteSnapshot: { ...row.quoteSnapshot, customerAcceptedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, row.id));
    res.status(202).json({
      status: "operator_review",
      refundAmount: null,
      reason: row.quoteSnapshot.reason,
      reasonText: row.quoteSnapshot.reasonText,
      policyReason: row.quoteSnapshot.policyReason,
    }); return;
  }
  const [payment] = await db.select().from(rentalPaymentsTable).where(eq(rentalPaymentsTable.reservationId, reservation.id));
  if (!payment?.stripePaymentIntentId) {
    res.status(409).json({ error: "Original Stripe payment is unavailable for a provider refund" }); return;
  }
  const key = `rental-cancellation-exception-${row.id}`;
  const [existing] = await db.select().from(rentalRefundsTable).where(eq(rentalRefundsTable.idempotencyKey, key));
  if (existing) {
    res.status(202).json({ status: "cancelled", refundAmount: existing.amount, refundStatus: existing.status }); return;
  }
  const selectedChoice = operatorInitiated ? "full_refund" : "policy_refund";
  if (row.quotedAmount === 0) {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(rentalReservationExceptionsTable)
        .where(eq(rentalReservationExceptionsTable.id, row.id)).for("update");
      const [current] = await tx.select().from(rentalReservationsTable)
        .where(eq(rentalReservationsTable.id, reservation.id)).for("update");
      if (!locked || !current || !["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(current.status) ||
          locked.status !== "quoted" || !isQuoteLive(locked.expiresAt) ||
          (operatorInitiated && locked.quoteSnapshot.selectedChoice === "alternative")) {
        throw Object.assign(new Error("Cancellation choice is no longer available"), { status: 409 });
      }
      await tx.update(rentalReservationsTable).set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(rentalReservationsTable.id, reservation.id));
      await tx.update(rentalReservationExceptionsTable).set({
        status: "cancelled",
        consentAt: new Date(),
        refundAmount: 0,
        completedAt: new Date(),
        providerStatus: "no_refund_due",
        quoteSnapshot: { ...locked.quoteSnapshot, selectedChoice, customerAcceptedAt: new Date().toISOString() },
        updatedAt: new Date(),
      }).where(eq(rentalReservationExceptionsTable.id, row.id));
    });
    await reconcileBaseRefund(payment.id, reservation.id);
    res.json({ status: "cancelled", refundAmount: 0, refundStatus: "not_required" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(rentalReservationExceptionsTable).where(eq(rentalReservationExceptionsTable.id, row.id)).for("update");
    const [current] = await tx.select().from(rentalReservationsTable).where(eq(rentalReservationsTable.id, reservation.id)).for("update");
    if (!locked || !current || !["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(current.status) ||
        locked.status !== "quoted" || !isQuoteLive(locked.expiresAt)) {
      throw Object.assign(new Error("Cancellation quote is no longer valid"), { status: 409 });
    }
    await tx.update(rentalReservationsTable).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(rentalReservationsTable.id, reservation.id));
    await tx.update(rentalReservationExceptionsTable).set({
      status: "refund_pending",
      consentAt: new Date(),
      refundAmount: locked.quotedAmount,
      quoteSnapshot: { ...locked.quoteSnapshot, selectedChoice, customerAcceptedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, row.id));
    const [refund] = await tx.insert(rentalRefundsTable).values({
      paymentId: payment.id, amount: locked.quotedAmount!, currency: payment.currency,
      reason: "Customer accepted saved reservation cancellation policy",
      idempotencyKey: key, createdBy: `customer:reservation-${reservation.id}`,
    }).returning();
    return refund;
  });
  let providerRefund: Stripe.Refund;
  try {
    providerRefund = await stripe().refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: result.amount,
      reason: "requested_by_customer",
      metadata: { rentalPaymentId: String(payment.id), rentalRefundId: String(result.id), rentalExceptionId: String(row.id) },
    }, { idempotencyKey: key });
  } catch (error) {
    logger.error({ err: error, action: "rental_cancellation_refund_provider_failed", exceptionId: row.id });
    await db.update(rentalRefundsTable).set({ status: "pending", updatedAt: new Date() }).where(eq(rentalRefundsTable.id, result.id));
    await db.update(rentalReservationExceptionsTable).set({
      status: "refund_pending", providerStatus: `provider_request_unconfirmed: ${errorMessage(error)}`, updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, row.id));
    res.status(503).json({ error: "Cancellation was recorded; the Stripe refund failed and requires reconciliation" });
    return;
  }
  try {
    await db.update(rentalRefundsTable).set({
      stripeRefundId: providerRefund.id,
      status: providerRefund.status === "succeeded" ? "succeeded" : "pending",
      updatedAt: new Date(),
    }).where(eq(rentalRefundsTable.id, result.id));
    await db.update(rentalReservationExceptionsTable).set({
      status: providerRefund.status === "succeeded" ? "cancelled" : "refund_pending",
      stripeRefundId: providerRefund.id, providerStatus: providerRefund.status ?? "pending",
      completedAt: providerRefund.status === "succeeded" ? new Date() : null, updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, row.id));
  } catch (error) {
    logger.error({ err: error, action: "rental_cancellation_refund_provider_ledger_save_failed", exceptionId: row.id });
    res.status(503).json({ error: "Stripe refund was submitted; provider ledger reconciliation is pending" });
    return;
  }
  if (providerRefund.status === "succeeded") {
    try { await reconcileBaseRefund(payment.id, reservation.id); }
    catch (error) {
      logger.error({ err: error, action: "rental_cancellation_refund_ledger_reconciliation_failed", exceptionId: row.id });
      res.status(503).json({ error: "Stripe refund succeeded; payment ledger reconciliation is pending" });
      return;
    }
  }
  res.status(202).json({ status: "cancelled", refundAmount: result.amount, refundStatus: providerRefund.status ?? "pending" });
});

router.post("/rental/exceptions/reservations/:id/extension/quote", async (req, res): Promise<void> => {
  const parsed = z.object({
    returnAt: z.string().datetime({ offset: true }).optional(),
    newReturnAt: z.string().datetime({ offset: true }).optional(),
  }).strict().refine((body) => Boolean(body.returnAt || body.newReturnAt), {
    message: "A new return time is required",
  }).safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const returnAt = new Date(parsed.data.returnAt ?? parsed.data.newReturnAt!);
  if (reservation.operatorId == null || returnAt <= reservation.returnAt || !reservationLiveForException(reservation.status)) {
    res.status(409).json({ error: "The requested extension is not valid for this reservation" }); return;
  }
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservation.id)).for("update");
    if (!current || current.operatorId == null || !reservationLiveForException(current.status) || returnAt <= current.returnAt) {
      return { ineligible: true as const };
    }
    const priced = await priceExtension(tx, current, returnAt);
    if (!priced) return { unavailable: true as const };
    if (priced.additionalAmount > 0 && priced.additionalAmount < 50) return { minimumPayment: true as const };
    const now = new Date();
    const [row] = await tx.insert(rentalReservationExceptionsTable).values({
      reservationId: current.id,
      operatorId: current.operatorId,
      kind: "extension",
      status: "quoted",
      quotedAmount: priced.additionalAmount,
      quoteSnapshot: {
        quoteVersion: randomUUID(),
        oldReturnAt: current.returnAt.toISOString(),
        newReturnAt: returnAt.toISOString(),
        oldTotal: current.finalTotal,
        newTotal: priced.newTotal,
        additionalAmount: priced.additionalAmount,
        vehicleId: current.vehicleId,
        pricing: priced.pricing,
        capturedAt: now.toISOString(),
      },
      policySnapshot: { policy: current.marketplaceOfferSnapshot, extensionTerms: policyOf(current) },
      expiresAt: new Date(now.getTime() + QuoteTtl),
    }).returning();
    return { row, current, amount: priced.additionalAmount };
  });
  if ("ineligible" in result) { res.status(409).json({ error: "The reservation changed and can no longer be extended" }); return; }
  if ("unavailable" in result) { res.status(409).json({ error: "Vehicle is unavailable for the extension including its turnaround buffer" }); return; }
  if ("minimumPayment" in result) {
    res.status(409).json({ error: "Extension additional payment is below Stripe's minimum JPY Checkout amount" }); return;
  }
  const { row, current, amount } = result;
  res.status(201).json({
    quoteId: row.id, quoteVersion: row.quoteSnapshot.quoteVersion,
    oldReturnAt: current.returnAt.toISOString(), newReturnAt: returnAt.toISOString(),
    additionalAmount: amount, currency: "jpy", approvalStatus: "pending",
    policySnapshot: row.policySnapshot, expiresAt: row.expiresAt.toISOString(),
  });
});

router.get("/partner/rental/exceptions/reservations/:id/extensions", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = id(req.params.id);
  const partner = partnerIdentity(req);
  const [reservation] = reservationId ? await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId),
    eq(rentalReservationsTable.operatorId, partner.operatorId),
    eq(rentalReservationsTable.source, "marketplace_request"),
    isNull(rentalReservationsTable.deletedAt),
  )) : [];
  if (!reservation) { res.status(404).json({ error: "Reservation not found" }); return; }
  const quotes = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.operatorId, partner.operatorId),
    eq(rentalReservationExceptionsTable.kind, "extension"),
  ));
  res.json(quotes.map((quote) => ({
    quoteId: quote.id,
    quoteVersion: quote.quoteSnapshot.quoteVersion ?? null,
    status: quote.status,
    approvalStatus: quote.status === "expired" ? "stale" : isExtensionApproved(quote.quoteSnapshot) ? "approved" : "pending",
    approvedAt: quote.status !== "expired" && isExtensionApproved(quote.quoteSnapshot)
      ? (quote.quoteSnapshot.operatorApproval as Record<string, unknown>).approvedAt
      : null,
    oldReturnAt: quote.quoteSnapshot.oldReturnAt,
    newReturnAt: quote.quoteSnapshot.newReturnAt,
    oldTotal: quote.quoteSnapshot.oldTotal,
    newTotal: quote.quoteSnapshot.newTotal,
    additionalAmount: quote.quotedAmount,
    expiresAt: quote.expiresAt.toISOString(),
  })));
});

router.post("/partner/rental/exceptions/reservations/:id/extensions/:quoteId/approve", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = id(req.params.id);
  const quoteId = id(req.params.quoteId);
  const parsed = z.object({ quoteVersion: z.string().min(1).max(100) }).strict().safeParse(req.body);
  const partner = partnerIdentity(req);
  if (!reservationId || !quoteId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation or extension quote ID" : parsed.error.message });
    return;
  }
  if (!["owner", "manager", "operations"].includes(partner.role)) {
    res.status(403).json({ error: "Partner owner, manager, or operations staff approval is required" });
    return;
  }
  const outcome = await db.transaction(async (tx) => {
    const [quote] = await tx.select().from(rentalReservationExceptionsTable).where(and(
      eq(rentalReservationExceptionsTable.id, quoteId),
      eq(rentalReservationExceptionsTable.reservationId, reservationId),
      eq(rentalReservationExceptionsTable.operatorId, partner.operatorId),
      eq(rentalReservationExceptionsTable.kind, "extension"),
    )).for("update");
    if (!quote) return { missing: true as const };
    const [reservation] = await tx.select().from(rentalReservationsTable).where(and(
      eq(rentalReservationsTable.id, reservationId),
      eq(rentalReservationsTable.operatorId, partner.operatorId),
      eq(rentalReservationsTable.source, "marketplace_request"),
      isNull(rentalReservationsTable.deletedAt),
    )).for("update");
    if (!reservation) return { missing: true as const };
    if (quote.status !== "quoted" || !isQuoteLive(quote.expiresAt)) return { expired: true as const };
    if (quote.quoteSnapshot.quoteVersion !== parsed.data.quoteVersion) return { versionMismatch: true as const };
    if (!reservationLiveForException(reservation.status) ||
        !await extensionQuoteMatchesCurrent(tx, quote, reservation)) {
      await tx.update(rentalReservationExceptionsTable).set({
        status: "expired",
        providerStatus: "quote_changed_or_unavailable",
        updatedAt: new Date(),
      }).where(eq(rentalReservationExceptionsTable.id, quote.id));
      return { stale: true as const };
    }
    const approvedAt = new Date().toISOString();
    const quoteSnapshot = {
      ...quote.quoteSnapshot,
      operatorApproval: {
        approved: true,
        quoteVersion: parsed.data.quoteVersion,
        approvedAt,
        staffId: partner.staffId,
      },
    };
    const [approved] = await tx.update(rentalReservationExceptionsTable).set({
      quoteSnapshot,
      updatedAt: new Date(approvedAt),
    }).where(eq(rentalReservationExceptionsTable.id, quote.id)).returning();
    return { approved };
  });
  if ("missing" in outcome) { res.status(404).json({ error: "Extension quote not found for this operator" }); return; }
  if ("expired" in outcome) { res.status(409).json({ error: "Extension quote is no longer pending or has expired" }); return; }
  if ("versionMismatch" in outcome) { res.status(409).json({ error: "Extension quote version changed; refresh before approving" }); return; }
  if ("stale" in outcome) {
    res.status(409).json({ error: "Extension quote is stale or unavailable; request a fresh quote", requoteRequired: true });
    return;
  }
  res.json({
    quoteId: outcome.approved.id,
    quoteVersion: outcome.approved.quoteSnapshot.quoteVersion,
    approvalStatus: "approved",
    approvedAt: (outcome.approved.quoteSnapshot.operatorApproval as Record<string, unknown>).approvedAt,
    expiresAt: outcome.approved.expiresAt.toISOString(),
  });
});

router.get("/rental/exceptions/reservations/:id/extension/status", async (req, res): Promise<void> => {
  const parsed = z.object({ quoteId: z.coerce.number().int().positive() }).strict().safeParse(req.query);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [quote] = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId),
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "extension"),
  ));
  if (!quote) { res.status(404).json({ error: "Extension quote not found" }); return; }
  const approved = isExtensionApproved(quote.quoteSnapshot);
  res.json({
    quoteId: quote.id,
    quoteVersion: quote.quoteSnapshot.quoteVersion ?? null,
    status: quote.status,
    approvalStatus: quote.status === "expired" ? "stale" : approved ? "approved" : "pending",
    approvedAt: quote.status !== "expired" && approved
      ? (quote.quoteSnapshot.operatorApproval as Record<string, unknown>).approvedAt
      : null,
    oldReturnAt: quote.quoteSnapshot.oldReturnAt,
    newReturnAt: quote.quoteSnapshot.newReturnAt,
    additionalAmount: quote.quotedAmount,
    expiresAt: quote.expiresAt.toISOString(),
  });
});

router.post("/rental/exceptions/reservations/:id/extension/checkout", async (req, res): Promise<void> => {
  const parsed = ConsentBody.safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(rentalReservationExceptionsTable).where(and(
      eq(rentalReservationExceptionsTable.id, parsed.data.quoteId),
      eq(rentalReservationExceptionsTable.reservationId, reservation.id),
      eq(rentalReservationExceptionsTable.kind, "extension"),
    )).for("update");
    if (!row) return { missing: true as const };
    if (row.status !== "quoted" || !isQuoteLive(row.expiresAt)) return { expired: true as const };
    if (!isExtensionApproved(row.quoteSnapshot)) return { approvalRequired: true as const };
    const [current] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservation.id)).for("update");
    if (!current || !reservationLiveForException(current.status) ||
        !await extensionQuoteMatchesCurrent(tx, row, current)) {
      await tx.update(rentalReservationExceptionsTable).set({
        status: "expired",
        providerStatus: "quote_changed_or_unavailable",
        updatedAt: new Date(),
      }).where(eq(rentalReservationExceptionsTable.id, row.id));
      return { stale: true as const };
    }
    const now = new Date();
    const [accepted] = await tx.update(rentalReservationExceptionsTable).set({
      status: "checkout_pending",
      consentAt: now,
      updatedAt: now,
    }).where(eq(rentalReservationExceptionsTable.id, row.id)).returning();
    return { accepted, current };
  });
  if ("missing" in outcome) { res.status(404).json({ error: "Extension quote not found" }); return; }
  if ("expired" in outcome) { res.status(409).json({ error: "Extension quote is missing or expired" }); return; }
  if ("approvalRequired" in outcome) {
    res.status(409).json({ error: "Operator approval is required before extension checkout", approvalStatus: "pending" });
    return;
  }
  if ("stale" in outcome) {
    res.status(409).json({ error: "Extension quote changed or is no longer available; request a fresh quote", requoteRequired: true });
    return;
  }
  const { accepted, current } = outcome;
  if (accepted.quotedAmount === 0) {
    try { res.json(await applyNoCharge(accepted.id)); }
    catch (error) {
      const code = typeof error === "object" && error != null && "status" in error ? Number((error as { status: unknown }).status) : 409;
      await db.update(rentalReservationExceptionsTable).set({
        status: "expired",
        providerStatus: "quote_revalidation_failed",
        consentAt: null,
        updatedAt: new Date(),
      }).where(eq(rentalReservationExceptionsTable.id, accepted.id));
      res.status(code).json({ error: errorMessage(error) });
    }
    return;
  }
  try {
    res.json({
      quoteId: accepted.id,
      quoteVersion: accepted.quoteSnapshot.quoteVersion,
      approvalStatus: "approved",
      ...(await createCheckout(accepted, current)),
    });
  } catch (error) {
    await db.update(rentalReservationExceptionsTable).set({
      status: "quoted",
      consentAt: null,
      updatedAt: new Date(),
    }).where(and(
      eq(rentalReservationExceptionsTable.id, accepted.id),
      eq(rentalReservationExceptionsTable.status, "checkout_pending"),
      isNull(rentalReservationExceptionsTable.stripeCheckoutSessionId),
    ));
    res.status(503).json({ error: errorMessage(error) });
  }
});

router.post("/rental/exceptions/reservations/:id/extension/verify-payment", async (req, res): Promise<void> => {
  const parsed = z.object({ quoteId: z.coerce.number().int().positive() }).strict().safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId),
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "extension"),
  ));
  if (!row?.stripeCheckoutSessionId) { res.status(404).json({ error: "Extension Checkout was not found" }); return; }
  try {
    const session = await stripe().checkout.sessions.retrieve(row.stripeCheckoutSessionId);
    res.json(await verifyAndApply(row, session));
  } catch (error) {
    const code = typeof error === "object" && error != null && "status" in error ? Number((error as { status: unknown }).status) : 503;
    res.status(code).json({ error: errorMessage(error) });
  }
});

router.get("/partner/rental/exceptions/reservations/:id/alternatives", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = id(req.params.id);
  const operatorId = partnerIdentity(req).operatorId;
  const [reservation] = reservationId ? await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId), eq(rentalReservationsTable.operatorId, operatorId),
    eq(rentalReservationsTable.source, "marketplace_request"), isNull(rentalReservationsTable.deletedAt),
  )) : [];
  if (!reservation) { res.status(404).json({ error: "Reservation not found" }); return; }
  const fleet = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.operatorId, operatorId), eq(rentalVehiclesTable.status, "published"),
    isNull(rentalVehiclesTable.deletedAt),
  ));
  const alternatives = [];
  for (const vehicle of fleet) {
    if (vehicle.id === reservation.vehicleId ||
        !await isVehicleAvailable(vehicle.id, reservation.pickupAt, reservation.returnAt, undefined, reservation.id)) continue;
    const savedAddons = await db.select().from(rentalReservationAddonsTable)
      .where(eq(rentalReservationAddonsTable.reservationId, reservation.id));
    const price = await calculatePrice({
      vehicleId: vehicle.id, pickupAt: reservation.pickupAt, returnAt: reservation.returnAt,
      pickupLocation: reservation.pickupLocation, returnLocation: reservation.returnLocation,
      addons: savedAddons.map((addon) => ({ addonId: addon.addonId, qty: addon.qty })),
    });
    const total = Math.round(price.finalTotal);
    if (total >= reservation.finalTotal) alternatives.push({ vehicleId: vehicle.id, name: vehicle.publicTitle, total, additionalAmount: total - reservation.finalTotal });
  }
  res.json(alternatives);
});

router.post("/partner/rental/exceptions/reservations/:id/alternatives", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = id(req.params.id);
  const parsed = z.object({ vehicleId: z.coerce.number().int().positive() }).strict().safeParse(req.body);
  const operatorId = partnerIdentity(req).operatorId;
  if (!reservationId || !parsed.success) { res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return; }
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId), eq(rentalReservationsTable.operatorId, operatorId),
    eq(rentalReservationsTable.source, "marketplace_request"), isNull(rentalReservationsTable.deletedAt),
  ));
  const [vehicle] = await db.select().from(rentalVehiclesTable).where(and(
    eq(rentalVehiclesTable.id, parsed.data.vehicleId), eq(rentalVehiclesTable.operatorId, operatorId),
    eq(rentalVehiclesTable.status, "published"), isNull(rentalVehiclesTable.deletedAt),
  ));
  if (!reservation || !vehicle) { res.status(404).json({ error: "Reservation or alternate vehicle not found" }); return; }
  if (vehicle.id === reservation.vehicleId || !await isVehicleAvailable(vehicle.id, reservation.pickupAt, reservation.returnAt, undefined, reservation.id)) {
    res.status(409).json({ error: "Alternate vehicle is unavailable for this operator and interval" }); return;
  }
  const savedAddons = await db.select().from(rentalReservationAddonsTable)
    .where(eq(rentalReservationAddonsTable.reservationId, reservation.id));
  const pricing = await calculatePrice({
    vehicleId: vehicle.id, pickupAt: reservation.pickupAt, returnAt: reservation.returnAt,
    pickupLocation: reservation.pickupLocation, returnLocation: reservation.returnLocation,
    addons: savedAddons.map((addon) => ({ addonId: addon.addonId, qty: addon.qty })),
  });
  const total = Math.round(pricing.finalTotal);
  if (total < reservation.finalTotal) {
    res.status(409).json({ error: "Lower-priced alternatives require a separately approved provider refund quote" }); return;
  }
  if (total - Math.round(reservation.finalTotal) > 0 && total - Math.round(reservation.finalTotal) < 50) {
    res.status(409).json({ error: "Alternative vehicle additional payment is below Stripe's minimum JPY Checkout amount" }); return;
  }
  const row = await createQuote({
    reservation, kind: "alternative", targetVehicleId: vehicle.id,
    quotedAmount: total - Math.round(reservation.finalTotal),
    quoteSnapshot: {
      oldVehicleId: reservation.vehicleId, targetVehicleId: vehicle.id, vehicleName: vehicle.publicTitle,
      oldTotal: reservation.finalTotal, alternativeTotal: total, additionalAmount: total - Math.round(reservation.finalTotal),
      pricing, capturedAt: new Date().toISOString(),
    },
    policySnapshot: { policy: reservation.marketplaceOfferSnapshot, alternateVehicleConsent: true },
  });
  res.status(201).json({
    quoteId: row.id, vehicleId: vehicle.id, vehicleName: vehicle.publicTitle, total,
    additionalAmount: row.quotedAmount, expiresAt: row.expiresAt.toISOString(), policySnapshot: row.policySnapshot,
  });
});

router.get("/rental/exceptions/reservations/:id/alternatives", async (req, res): Promise<void> => {
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  const offers = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "alternative"),
    eq(rentalReservationExceptionsTable.status, "quoted"),
  ));
  res.json(offers.filter((offer) =>
    isQuoteLive(offer.expiresAt) && offer.quoteSnapshot.operatorCancellationQuoteId == null,
  ).map((offer) => ({
    quoteId: offer.id, vehicleId: offer.targetVehicleId, vehicleName: offer.quoteSnapshot.vehicleName,
    total: offer.quoteSnapshot.alternativeTotal, additionalAmount: offer.quotedAmount,
    expiresAt: offer.expiresAt.toISOString(), policySnapshot: offer.policySnapshot,
  })));
});

router.post("/rental/exceptions/reservations/:id/alternatives/accept", async (req, res): Promise<void> => {
  const parsed = ConsentBody.safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId), eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "alternative"),
  ));
  if (!row || row.status !== "quoted" || !isQuoteLive(row.expiresAt)) { res.status(409).json({ error: "Alternative quote is missing or expired" }); return; }
  if (row.quoteSnapshot.operatorCancellationQuoteId != null) {
    res.status(409).json({ error: "This alternative is part of an operator cancellation offer; accept it through cancellation/accept-alternative" });
    return;
  }
  await db.update(rentalReservationExceptionsTable).set({ consentAt: new Date(), updatedAt: new Date() })
    .where(eq(rentalReservationExceptionsTable.id, row.id));
  if (row.quotedAmount === 0) {
    await db.update(rentalReservationExceptionsTable).set({ status: "checkout_pending", updatedAt: new Date() })
      .where(eq(rentalReservationExceptionsTable.id, row.id));
    try { res.json(await applyNoCharge(row.id)); }
    catch (error) { res.status(409).json({ error: errorMessage(error) }); }
    return;
  }
  try { res.json({ quoteId: row.id, ...(await createCheckout(row, reservation)) }); }
  catch (error) { res.status(503).json({ error: errorMessage(error) }); }
});

router.post("/rental/exceptions/reservations/:id/alternatives/verify-payment", async (req, res): Promise<void> => {
  const parsed = z.object({ quoteId: z.coerce.number().int().positive() }).strict().safeParse(req.body);
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId), eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.kind, "alternative"),
  ));
  if (!row?.stripeCheckoutSessionId) { res.status(404).json({ error: "Alternate vehicle Checkout was not found" }); return; }
  try { res.json(await verifyAndApply(row, await stripe().checkout.sessions.retrieve(row.stripeCheckoutSessionId))); }
  catch (error) {
    const code = typeof error === "object" && error != null && "status" in error ? Number((error as { status: unknown }).status) : 503;
    res.status(code).json({ error: errorMessage(error) });
  }
});

router.post("/partner/rental/exceptions/reservations/:id/cancellation/resolve", authenticatePartner, async (req, res): Promise<void> => {
  const reservationId = id(req.params.id);
  const parsed = z.object({
    quoteId: z.coerce.number().int().positive(),
    refundAmount: z.number().int().nonnegative(),
    decisionNote: z.string().trim().min(3).max(500),
  }).strict().safeParse(req.body);
  const partner = partnerIdentity(req);
  const operatorId = partner.operatorId;
  if (!reservationId || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid reservation ID" : parsed.error.message }); return;
  }
  const [reservation] = await db.select().from(rentalReservationsTable).where(and(
    eq(rentalReservationsTable.id, reservationId),
    eq(rentalReservationsTable.operatorId, operatorId),
    eq(rentalReservationsTable.source, "marketplace_request"),
    isNull(rentalReservationsTable.deletedAt),
  ));
  const [quote] = reservation ? await db.select().from(rentalReservationExceptionsTable).where(and(
    eq(rentalReservationExceptionsTable.id, parsed.data.quoteId),
    eq(rentalReservationExceptionsTable.reservationId, reservation.id),
    eq(rentalReservationExceptionsTable.operatorId, operatorId),
    eq(rentalReservationExceptionsTable.kind, "cancellation"),
    eq(rentalReservationExceptionsTable.status, "operator_review"),
  )) : [];
  if (!reservation || !quote || !quote.consentAt) {
    res.status(404).json({ error: "Consented cancellation request not found" }); return;
  }
  const [payment] = await db.select().from(rentalPaymentsTable)
    .where(eq(rentalPaymentsTable.reservationId, reservation.id));
  if (!payment?.stripePaymentIntentId || !["paid", "partially_refunded"].includes(payment.status)) {
    res.status(409).json({ error: "Verified payment is unavailable for operator cancellation resolution" }); return;
  }
  const previousRefunds = await db.select().from(rentalRefundsTable).where(eq(rentalRefundsTable.paymentId, payment.id));
  const refundableBalance = Math.max(0, (payment.chargedAmount ?? payment.amount) -
    previousRefunds.filter((refund) => !["failed", "canceled"].includes(refund.status)).reduce((sum, refund) => sum + refund.amount, 0));
  if (parsed.data.refundAmount > refundableBalance) {
    res.status(400).json({ error: "Refund exceeds the remaining verified payment balance" }); return;
  }
  const key = `rental-cancellation-operator-${quote.id}`;
  const [existing] = await db.select().from(rentalRefundsTable).where(eq(rentalRefundsTable.idempotencyKey, key));
  if (existing) {
    res.status(202).json({ status: "cancelled", refundAmount: existing.amount, refundStatus: existing.status }); return;
  }
  const decisionAt = new Date();
  const decisionSnapshot = {
    ...quote.quoteSnapshot,
    operatorDecision: {
      decidedBy: `partner_staff:${partner.staffId}`,
      decisionNote: parsed.data.decisionNote,
      refundAmount: parsed.data.refundAmount,
      refundWaived: parsed.data.refundAmount === 0,
      decidedAt: decisionAt.toISOString(),
    },
  };
  const prepared = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(rentalReservationExceptionsTable)
      .where(eq(rentalReservationExceptionsTable.id, quote.id)).for("update");
    const [currentReservation] = await tx.select().from(rentalReservationsTable)
      .where(eq(rentalReservationsTable.id, reservation.id)).for("update");
    if (!locked || !currentReservation || !["pending_payment", "confirmed", "awaiting_pickup", "vehicle_dispatched"].includes(currentReservation.status) ||
        locked.status !== "operator_review" || !locked.consentAt) {
      const [alreadyCreated] = await tx.select().from(rentalRefundsTable)
        .where(eq(rentalRefundsTable.idempotencyKey, key));
      return alreadyCreated ? { refund: alreadyCreated, duplicate: true } : { conflict: true };
    }
    await tx.update(rentalReservationsTable).set({ status: "cancelled", updatedAt: decisionAt })
      .where(eq(rentalReservationsTable.id, reservation.id));
    if (parsed.data.refundAmount === 0) {
      await tx.update(rentalReservationExceptionsTable).set({
        status: "cancelled", refundAmount: 0, completedAt: decisionAt,
        providerStatus: "operator_waived_refund", quoteSnapshot: decisionSnapshot, updatedAt: decisionAt,
      }).where(eq(rentalReservationExceptionsTable.id, quote.id));
      return { waived: true };
    }
    const [created] = await tx.insert(rentalRefundsTable).values({
      paymentId: payment.id,
      amount: parsed.data.refundAmount,
      currency: payment.currency,
      reason: `Operator-approved resolution of cancellation quote #${quote.id}: ${parsed.data.decisionNote}`,
      idempotencyKey: key,
      createdBy: `partner_staff:${partner.staffId}`,
    }).onConflictDoNothing({ target: rentalRefundsTable.idempotencyKey }).returning();
    const [storedRefund] = created ? [created] : await tx.select().from(rentalRefundsTable)
      .where(eq(rentalRefundsTable.idempotencyKey, key));
    if (!storedRefund) throw new Error("Could not store operator cancellation refund decision");
    await tx.update(rentalReservationExceptionsTable).set({
      status: "refund_pending", refundAmount: storedRefund.amount,
      quoteSnapshot: decisionSnapshot, updatedAt: decisionAt,
    }).where(eq(rentalReservationExceptionsTable.id, quote.id));
    return { refund: storedRefund, duplicate: !created };
  });
  if ("conflict" in prepared) {
    res.status(409).json({ error: "Cancellation request was already resolved" }); return;
  }
  if ("waived" in prepared) {
    res.json({ status: "cancelled", refundAmount: 0, refundStatus: "not_required" }); return;
  }
  const refund = prepared.refund;
  if (prepared.duplicate) {
    res.status(202).json({ status: "cancelled", refundAmount: refund.amount, refundStatus: refund.status }); return;
  }
  let providerRefund: Stripe.Refund;
  try {
    providerRefund = await stripe().refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refund.amount,
      reason: "requested_by_customer",
      metadata: { rentalPaymentId: String(payment.id), rentalRefundId: String(refund.id), rentalExceptionId: String(quote.id) },
    }, { idempotencyKey: key });
  } catch (error) {
    logger.error({ err: error, action: "rental_operator_cancellation_refund_provider_failed", exceptionId: quote.id });
    await db.update(rentalRefundsTable).set({ status: "pending", updatedAt: new Date() }).where(eq(rentalRefundsTable.id, refund.id));
    await db.update(rentalReservationExceptionsTable).set({
      status: "refund_pending", providerStatus: `provider_request_unconfirmed: ${errorMessage(error)}`, updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, quote.id));
    res.status(503).json({ error: "Cancellation recorded but provider refund failed; reconciliation is required" });
    return;
  }
  try {
    await db.update(rentalRefundsTable).set({
      stripeRefundId: providerRefund.id,
      status: providerRefund.status === "succeeded" ? "succeeded" : "pending",
      updatedAt: new Date(),
    }).where(eq(rentalRefundsTable.id, refund.id));
    await db.update(rentalReservationExceptionsTable).set({
      status: providerRefund.status === "succeeded" ? "cancelled" : "refund_pending",
      stripeRefundId: providerRefund.id, providerStatus: providerRefund.status ?? "pending",
      completedAt: providerRefund.status === "succeeded" ? new Date() : null, updatedAt: new Date(),
    }).where(eq(rentalReservationExceptionsTable.id, quote.id));
  } catch (error) {
    logger.error({ err: error, action: "rental_operator_cancellation_refund_ledger_save_failed", exceptionId: quote.id });
    res.status(503).json({ error: "Stripe refund was submitted; provider ledger reconciliation is pending" });
    return;
  }
  if (providerRefund.status === "succeeded") {
    try { await reconcileBaseRefund(payment.id, reservation.id); }
    catch (error) {
      logger.error({ err: error, action: "rental_operator_cancellation_refund_reconciliation_failed", exceptionId: quote.id });
      res.status(503).json({ error: "Stripe refund succeeded; payment ledger reconciliation is pending" });
      return;
    }
  }
  res.status(202).json({ status: "cancelled", refundAmount: refund.amount, refundStatus: providerRefund.status ?? "pending" });
});

router.post("/admin/rental/exceptions/overdue-alerts/dispatch", requireAdminAuth, async (_req, res): Promise<void> => {
  res.json(await dispatchOverdueAlerts());
});

router.post("/rental/exceptions/reservations/:id/overdue-alert", async (req, res): Promise<void> => {
  const reservation = await customerReservation(req, res);
  if (!reservation) return;
  if (!["overdue", "in_rental", "return_initiated"].includes(reservation.status) || reservation.returnAt > new Date()) {
    res.status(409).json({ error: "This reservation is not overdue" }); return;
  }
  const session = req.session as unknown as Record<string, unknown>;
  const notice = await queueRentalNotification({
    email: String(session.rentalCustomerEmail ?? ""),
    eventType: "overdue_alert",
    bookingId: reservation.id,
    dedupeKey: `rental-overdue-${reservation.id}-${reservation.returnAt.getTime()}-${new Date().toISOString().slice(0, 10)}:customer`,
    extra: { message: `Your rental was due back at ${reservation.returnAt.toISOString()}. Contact the operator immediately.` },
  });
  res.status(202).json({ alerted: true, notificationStatus: notice.deliveryStatus });
});

export default router;