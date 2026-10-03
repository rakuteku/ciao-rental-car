import { connect as connectNet, type Socket } from "node:net";
import { connect as connectTls, type TLSSocket } from "node:tls";
import {
  db,
  rentalAuditLogTable,
  rentalDriversTable,
  rentalMarketplaceRequestsTable,
  rentalNotificationsTable,
  rentalOperatorsTable,
  rentalReservationsTable,
} from "@workspace/db";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { logger } from "./logger";

type AuditValue = Record<string, unknown> | null | undefined;
type Locale = "en" | "ja" | "zh-TW";
type Template = { subject: string; body: string };
type TemplateFactory = (data: Record<string, unknown>) => Record<"en" | "ja", Template> & Partial<Record<Locale, Template>>;

export async function logRentalAudit(input: {
  adminUser?: string | null;
  action: string;
  recordType: string;
  recordId?: number | null;
  previousValue?: AuditValue;
  newValue?: AuditValue;
}) {
  await db.insert(rentalAuditLogTable).values({
    adminUser: input.adminUser ?? null,
    action: input.action,
    recordType: input.recordType,
    recordId: input.recordId ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
  });
}

const TEMPLATES = {
  request: (data) => ({
    en: { subject: data.message ? `Update for rental request #${data.bookingId}` : `Rental request #${data.bookingId} received`, body: data.message ? String(data.message) : `We received your rental request #${data.bookingId}. The operator will respond by ${data.respondBy ?? "the deadline shown in your request"}.` },
    ja: { subject: data.message ? `レンタルリクエスト #${data.bookingId} のお知らせ` : `レンタルリクエスト #${data.bookingId} を受け付けました`, body: data.message ? String(data.message) : `レンタルリクエスト #${data.bookingId} を受け付けました。事業者からの回答期限は ${data.respondBy ?? "リクエスト画面に表示された日時"} です。` },
  }),
  acceptance: (data) => ({
    en: { subject: `Rental request #${data.bookingId} accepted`, body: `Your rental request #${data.bookingId} was accepted. Complete payment by ${data.paymentDeadline ?? "the payment deadline shown in your booking"}. Sign in to your customer panel: ${data.panelUrl ?? "Open the My bookings page on CIAO Rental Car"}.` },
    ja: { subject: `レンタルリクエスト #${data.bookingId} が承認されました`, body: `レンタルリクエスト #${data.bookingId} が承認されました。${data.paymentDeadline ?? "予約画面に表示された"} 支払期限までにお支払いください。お客様パネルにログイン: ${data.panelUrl ?? "CIAOレンタカーの予約確認ページ"}。` },
    "zh-TW": { subject: `租車申請 #${data.bookingId} 已接受`, body: `您的租車申請 #${data.bookingId} 已接受。請在 ${data.paymentDeadline ?? "預訂頁面顯示的付款期限"} 前完成付款。登入顧客面板: ${data.panelUrl ?? "CIAO 租車的我的預訂頁面"}。` },
  }),
  decline: (data) => ({
    en: { subject: `Rental request #${data.bookingId} declined`, body: `Your rental request #${data.bookingId} was declined.${data.reason ? ` Reason: ${data.reason}` : ""}` },
    ja: { subject: `レンタルリクエスト #${data.bookingId} は承認されませんでした`, body: `レンタルリクエスト #${data.bookingId} は承認されませんでした。${data.reason ? `理由: ${data.reason}` : ""}` },
  }),
  payment: (data) => ({
    en: { subject: `Payment update for rental #${data.bookingId}`, body: `The payment status for rental #${data.bookingId} has been updated${data.paymentStatus ? ` to ${data.paymentStatus}` : ""}.` },
    ja: { subject: `レンタル #${data.bookingId} のお支払い状況`, body: `レンタル #${data.bookingId} のお支払い状況が更新されました${data.paymentStatus ? `（${data.paymentStatus}）` : ""}。` },
  }),
  voucher: (data) => ({
    en: { subject: `Your voucher for rental #${data.bookingId}`, body: `Your voucher for rental #${data.bookingId} is ready.${data.voucherUrl ? ` View it here: ${data.voucherUrl}` : ""}` },
    ja: { subject: `レンタル #${data.bookingId} のバウチャー`, body: `レンタル #${data.bookingId} のバウチャーをご利用いただけます。${data.voucherUrl ? `こちらをご確認ください: ${data.voucherUrl}` : ""}` },
  }),
  reminder: (data) => ({
    en: { subject: `Reminder for rental #${data.bookingId}`, body: `This is a reminder about rental #${data.bookingId}.${data.message ? ` ${data.message}` : ""}` },
    ja: { subject: `レンタル #${data.bookingId} のリマインダー`, body: `レンタル #${data.bookingId} に関するお知らせです。${data.message ?? ""}` },
  }),
  refund: (data) => ({
    en: { subject: `Refund update for rental #${data.bookingId}`, body: `A refund update was recorded for rental #${data.bookingId}.${data.amount ? ` Amount: ${data.amount}` : ""}` },
    ja: { subject: `レンタル #${data.bookingId} の返金状況`, body: `レンタル #${data.bookingId} の返金状況が更新されました。${data.amount ? `金額: ${data.amount}` : ""}` },
  }),
  alert: (data) => ({
    en: { subject: `Action required: rental request #${data.bookingId}`, body: `A rental request #${data.bookingId} needs your attention.${data.message ? ` ${data.message}` : ""}` },
    ja: { subject: `要対応：レンタルリクエスト #${data.bookingId}`, body: `レンタルリクエスト #${data.bookingId} の対応が必要です。${data.message ?? ""}` },
  }),
  new_booking: (data) => ({
    en: { subject: `Booking #${data.bookingId} received`, body: `We received your CIAO Rental Car booking #${data.bookingId}. Sign in to review it: ${data.panelUrl ?? "Open the My bookings page on CIAO Rental Car"}. Your booking access code is: ${data.accessCode ?? "available in your booking confirmation"}.` },
    ja: { subject: `予約 #${data.bookingId} を受け付けました`, body: `CIAOレンタカーの予約 #${data.bookingId} を受け付けました。ログインして予約を確認してください: ${data.panelUrl ?? "CIAOレンタカーの予約確認ページ"}。予約アクセスコード: ${data.accessCode ?? "予約確認画面をご覧ください"}。` },
    "zh-TW": { subject: `已收到預訂 #${data.bookingId}`, body: `我們已收到您的 CIAO 租車預訂 #${data.bookingId}。請登入查看預訂: ${data.panelUrl ?? "CIAO 租車的我的預訂頁面"}。預訂存取碼: ${data.accessCode ?? "請查看預訂確認頁面"}。` },
  }),
  booking_confirmed: (data) => ({
    en: { subject: `Booking #${data.bookingId} confirmed`, body: `Your CIAO Rental Car booking #${data.bookingId} is confirmed.` },
    ja: { subject: `予約 #${data.bookingId} が確定しました`, body: `CIAOレンタカーの予約 #${data.bookingId} が確定しました。` },
  }),
  document_approved: (data) => ({
    en: { subject: `Documents approved for booking #${data.bookingId}`, body: `Your documents for booking #${data.bookingId} were approved.` },
    ja: { subject: `予約 #${data.bookingId} の書類が承認されました`, body: `予約 #${data.bookingId} の書類が承認されました。` },
  }),
  document_rejected: (data) => ({
    en: { subject: `Action needed for booking #${data.bookingId}`, body: `Please review and resubmit documents for booking #${data.bookingId}.` },
    ja: { subject: `予約 #${data.bookingId} の書類をご確認ください`, body: `予約 #${data.bookingId} の書類をご確認のうえ、再提出してください。` },
  }),
  pickup_reminder: (data) => ({
    en: { subject: `Pickup reminder for rental #${data.bookingId}`, body: data.message ? String(data.message) : data.scheduledAt ? `Your CIAO rental #${data.bookingId} pickup is scheduled for ${data.scheduledAt}.` : `Your CIAO rental #${data.bookingId} starts in 24 hours.` },
    ja: { subject: `レンタル #${data.bookingId} の出発リマインダー`, body: data.scheduledAt ? `レンタル #${data.bookingId} の出発予定日時は ${data.scheduledAt} です。` : `レンタル #${data.bookingId} の開始まで24時間です。` },
  }),
  return_reminder: (data) => ({
    en: { subject: `Return reminder for rental #${data.bookingId}`, body: data.message ? String(data.message) : data.scheduledAt ? `Your CIAO rental #${data.bookingId} is due back at ${data.scheduledAt}.` : `Your CIAO rental #${data.bookingId} is due back in 24 hours.` },
    ja: { subject: `レンタル #${data.bookingId} の返却リマインダー`, body: data.scheduledAt ? `レンタル #${data.bookingId} の返却予定日時は ${data.scheduledAt} です。` : `レンタル #${data.bookingId} の返却期限まで24時間です。` },
  }),
  overdue_alert: (data) => ({
    en: { subject: `Rental #${data.bookingId} is overdue`, body: `Your CIAO rental #${data.bookingId} is overdue. Please contact us.` },
    ja: { subject: `レンタル #${data.bookingId} の返却期限超過`, body: `レンタル #${data.bookingId} の返却期限を過ぎています。至急ご連絡ください。` },
  }),
  cancellation_confirmed: (data) => ({
    en: { subject: `Cancellation recorded for booking #${data.bookingId}`, body: `Your cancellation request for booking #${data.bookingId} has been recorded.` },
    ja: { subject: `予約 #${data.bookingId} のキャンセルを受け付けました`, body: `予約 #${data.bookingId} のキャンセル申請を受け付けました。` },
  }),
  refund_processed: (data) => ({
    en: { subject: `Refund update for booking #${data.bookingId}`, body: `A refund was recorded for booking #${data.bookingId}.` },
    ja: { subject: `予約 #${data.bookingId} の返金状況`, body: `予約 #${data.bookingId} の返金が記録されました。` },
  }),
} satisfies Record<string, TemplateFactory>;

export type RentalNotificationEvent = keyof typeof TEMPLATES;
type NotificationStatus = "pending" | "unconfigured" | "failed" | "sent";
type MailSocket = Socket | TLSSocket;
type NotificationRow = typeof rentalNotificationsTable.$inferSelect;
const DELIVERY_LEASE_MS = 10 * 60_000;

function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const username = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535 ||
      ((username && !password) || (!username && password))) return null;
  return {
    host,
    from,
    username,
    password,
    port,
    secure: process.env.SMTP_SECURE?.toLowerCase() === "true" || port === 465,
  };
}

function readSmtpReply(socket: MailSocket): Promise<{ code: number; text: string }> {
  return new Promise((resolve, reject) => {
    let response = "";
    let expectedCode: string | undefined;
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      socket.off("timeout", onTimeout);
    };
    const onData = (chunk: Buffer) => {
      response += chunk.toString("utf8");
      const lines = response.split(/\r?\n/);
      const first = lines.find((line) => line.length > 0);
      if (!expectedCode && first) expectedCode = first.slice(0, 3);
      const finalLine = lines.find((line) => expectedCode && line.startsWith(`${expectedCode} `));
      if (expectedCode && finalLine) {
        cleanup();
        resolve({ code: Number(expectedCode), text: response.trim() });
      }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error("SMTP connection closed before reply")); };
    const onTimeout = () => { cleanup(); reject(new Error("SMTP response timed out")); };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
    socket.once("timeout", onTimeout);
  });
}

async function smtpReply(socket: MailSocket, command?: string): Promise<{ code: number; text: string }> {
  const reply = readSmtpReply(socket);
  if (command !== undefined) socket.write(`${command}\r\n`);
  return reply;
}

class SmtpResponseError extends Error {
  constructor(readonly code: number) {
    super(`SMTP server replied ${code}`);
  }
}

async function expectReply(socket: MailSocket, command: string | undefined, accepted: number[]) {
  const reply = await smtpReply(socket, command);
  if (!accepted.includes(reply.code)) throw new SmtpResponseError(reply.code);
  return reply;
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildMessage(id: number, from: string, to: string, subject: string, body: string) {
  const encodedBody = Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64")
    .match(/.{1,76}/g)?.join("\r\n") ?? "";
  return [
    `From: ${safeHeader(from)}`,
    `To: ${safeHeader(to)}`,
    `Message-ID: <rental-notification-${id}@ciao-rental.local>`,
    `Subject: ${encodeHeader(safeHeader(subject))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
  ].join("\r\n").replace(/(^|\r\n)\./g, "$1..");
}

async function sendSmtpMail(
  id: number,
  to: string,
  subject: string,
  body: string,
  beforeDataTerminator: () => Promise<void>,
) {
  const config = smtpConfiguration();
  if (!config) throw new Error("SMTP is not configured (SMTP_HOST, SMTP_FROM, SMTP_PORT, and matching optional credentials are required)");
  let socket: MailSocket;
  if (config.secure) {
    socket = await new Promise<TLSSocket>((resolve, reject) => {
      const connection = connectTls({ host: config.host, port: config.port, servername: config.host }, () => resolve(connection));
      connection.once("error", reject);
      connection.setTimeout(30_000);
    });
  } else {
    socket = await new Promise<Socket>((resolve, reject) => {
      const connection = connectNet({ host: config.host, port: config.port }, () => resolve(connection));
      connection.once("error", reject);
      connection.setTimeout(30_000);
    });
  }

  try {
    await expectReply(socket, undefined, [220]);
    await expectReply(socket, "EHLO localhost", [250]);
    if (!config.secure) {
      await expectReply(socket, "STARTTLS", [220]);
      socket = await new Promise<TLSSocket>((resolve, reject) => {
        const secured = connectTls({ socket, servername: config.host }, () => resolve(secured));
        secured.once("error", reject);
        secured.setTimeout(30_000);
      });
      await expectReply(socket, "EHLO localhost", [250]);
    }
    if (config.username && config.password) {
      await expectReply(socket, "AUTH LOGIN", [334]);
      await expectReply(socket, Buffer.from(config.username).toString("base64"), [334]);
      await expectReply(socket, Buffer.from(config.password).toString("base64"), [235]);
    }
    const fromAddress = config.from.match(/<([^<>]+)>/)?.[1] ?? config.from;
    await expectReply(socket, `MAIL FROM:<${safeHeader(fromAddress)}>`, [250]);
    await expectReply(socket, `RCPT TO:<${safeHeader(to)}>`, [250, 251]);
    await expectReply(socket, "DATA", [354]);
    await beforeDataTerminator();
    await expectReply(socket, `${buildMessage(id, config.from, to, subject, body)}\r\n.`, [250]);
  } finally {
    socket.destroy();
  }
}

async function claimDueNotifications(limit: number, onlyId?: number): Promise<NotificationRow[]> {
  const now = new Date();
  const retryableStatuses = smtpConfiguration()
    ? ["pending", "unconfigured", "failed"]
    : ["pending", "failed"];
  return db.transaction(async (tx) => {
    const abandonedAfterData = await tx.select().from(rentalNotificationsTable).where(and(
      inArray(rentalNotificationsTable.deliveryStatus, ["pending", "failed"]),
      isNotNull(rentalNotificationsTable.dataSubmittedAt),
      lte(rentalNotificationsTable.deliveryLeaseUntil, now),
      ...(onlyId ? [eq(rentalNotificationsTable.id, onlyId)] : []),
    )).orderBy(asc(rentalNotificationsTable.createdAt)).limit(limit)
      .for("update", { skipLocked: true });
    for (const row of abandonedAfterData) {
      await tx.update(rentalNotificationsTable).set({
        deliveryStatus: "failed",
        deliveryLeaseUntil: null,
        nextAttemptAt: null,
        lastError: "SMTP DATA was submitted but acceptance was not recorded; automatic retry paused to prevent a duplicate. Admin confirmation is required to resend.",
      }).where(eq(rentalNotificationsTable.id, row.id));
    }

    const due = await tx.select().from(rentalNotificationsTable).where(and(
      inArray(rentalNotificationsTable.deliveryStatus, retryableStatuses),
      isNull(rentalNotificationsTable.dataSubmittedAt),
      or(isNull(rentalNotificationsTable.nextAttemptAt), lte(rentalNotificationsTable.nextAttemptAt, now)),
      or(isNull(rentalNotificationsTable.deliveryLeaseUntil), lte(rentalNotificationsTable.deliveryLeaseUntil, now)),
      ...(onlyId ? [eq(rentalNotificationsTable.id, onlyId)] : []),
    )).orderBy(asc(rentalNotificationsTable.createdAt)).limit(limit)
      .for("update", { skipLocked: true });

    const claimed: NotificationRow[] = [];
    for (const row of due) {
      const leaseUntil = new Date(Date.now() + DELIVERY_LEASE_MS);
      const [updated] = await tx.update(rentalNotificationsTable).set({
        deliveryLeaseUntil: leaseUntil,
      }).where(eq(rentalNotificationsTable.id, row.id)).returning();
      if (updated) claimed.push(updated);
    }
    return claimed;
  });
}

async function deliverClaimedNotification(notification: NotificationRow): Promise<NotificationStatus> {
  const id = notification.id;
  const leaseUntil = notification.deliveryLeaseUntil;
  if (!leaseUntil) return notification.deliveryStatus as NotificationStatus;
  const ownsLease = and(
    eq(rentalNotificationsTable.id, id),
    eq(rentalNotificationsTable.deliveryLeaseUntil, leaseUntil),
  );
  const config = smtpConfiguration();
  if (!config) {
    await db.update(rentalNotificationsTable).set({
      deliveryStatus: "unconfigured",
      lastError: "SMTP is not configured; set SMTP_HOST and SMTP_FROM (and matching optional SMTP_USER/SMTP_PASSWORD).",
      nextAttemptAt: null,
      deliveryLeaseUntil: null,
    }).where(ownsLease);
    return "unconfigured";
  }
  if (!notification.email?.trim()) {
    await db.update(rentalNotificationsTable).set({
      deliveryStatus: "failed",
      attemptCount: notification.attemptCount + 1,
      lastAttemptAt: new Date(),
      lastError: "No recipient email address was provided.",
      nextAttemptAt: new Date(Date.now() + 60 * 60_000),
      deliveryLeaseUntil: null,
    }).where(ownsLease);
    return "failed";
  }
  const payload = notification.payload ?? {};
  const locale: Locale = payload.locale === "ja" ? "ja" : payload.locale === "zh-TW" ? "zh-TW" : "en";
  const templates = payload.localeTemplates as Partial<Record<Locale, Template>> | undefined;
  const rendered = templates?.[locale] ?? templates?.en;
  if (!rendered?.subject || !rendered.body) {
    await db.update(rentalNotificationsTable).set({
      deliveryStatus: "failed",
      attemptCount: notification.attemptCount + 1,
      lastAttemptAt: new Date(),
      lastError: "Notification template is missing or invalid.",
      nextAttemptAt: new Date(Date.now() + 60 * 60_000),
      deliveryLeaseUntil: null,
    }).where(ownsLease);
    return "failed";
  }

  const attemptedAt = new Date();
  const [attempt] = await db.update(rentalNotificationsTable).set({
    deliveryStatus: "pending",
    attemptCount: notification.attemptCount + 1,
    lastAttemptAt: attemptedAt,
    lastError: null,
    nextAttemptAt: null,
  }).where(ownsLease).returning();
  if (!attempt) return "pending";
  let dataSubmissionStarted = false;
  try {
    await sendSmtpMail(id, notification.email, rendered.subject, rendered.body, async () => {
      const [marked] = await db.update(rentalNotificationsTable).set({
        dataSubmittedAt: new Date(),
      }).where(and(ownsLease, isNull(rentalNotificationsTable.dataSubmittedAt))).returning();
      if (!marked) throw new Error("Notification delivery lease was lost before SMTP DATA submission.");
      dataSubmissionStarted = true;
    });
    await db.update(rentalNotificationsTable).set({
      deliveryStatus: "sent",
      sentAt: new Date(),
      lastError: null,
      nextAttemptAt: null,
      deliveryLeaseUntil: null,
    }).where(ownsLease);
    return "sent";
  } catch (error) {
    const definitivelyRejected = error instanceof SmtpResponseError;
    const ambiguousSubmission = dataSubmissionStarted && !definitivelyRejected;
    const attempts = notification.attemptCount + 1;
    const retryDelayMs = Math.min(60 * 60_000, 30_000 * (2 ** Math.min(attempts - 1, 7)));
    await db.update(rentalNotificationsTable).set({
      deliveryStatus: "failed",
      ...(definitivelyRejected ? { dataSubmittedAt: null } : {}),
      lastError: definitivelyRejected
        ? error.message.slice(0, 1000)
        : ambiguousSubmission
          ? "SMTP DATA was submitted but acceptance was not recorded; automatic retry paused to prevent a duplicate. Admin confirmation is required to resend."
          : error instanceof Error ? error.message.slice(0, 1000) : "SMTP delivery failed",
      nextAttemptAt: ambiguousSubmission
        ? null
        : definitivelyRejected || !dataSubmissionStarted
        ? new Date(Date.now() + retryDelayMs)
        : null,
      deliveryLeaseUntil: null,
    }).where(ownsLease);
    return "failed";
  }
}

async function processRentalNotificationQueue(limit = 25, onlyId?: number) {
  let processed = 0;
  while (processed < limit) {
    const [notification] = await claimDueNotifications(1, onlyId);
    if (!notification) break;
    await deliverClaimedNotification(notification);
    processed += 1;
    if (onlyId) break;
  }
  return processed;
}

export async function queueRentalNotification(input: {
  email?: string | null;
  eventType: RentalNotificationEvent;
  bookingId: number;
  locale?: Locale;
  dedupeKey?: string;
  dispatch?: boolean;
  extra?: Record<string, unknown>;
}) {
  const data = { bookingId: input.bookingId, ...input.extra };
  const localeTemplates = TEMPLATES[input.eventType](data);
  const [inserted] = await db.insert(rentalNotificationsTable).values({
    email: input.email?.trim() || null,
    eventType: input.eventType,
    payload: {
      locale: input.locale ?? "en",
      localeTemplates,
      bookingId: input.bookingId,
      ...input.extra,
    },
    channel: "smtp",
    deliveryStatus: "pending",
    dedupeKey: input.dedupeKey ?? null,
  }).onConflictDoNothing({ target: rentalNotificationsTable.dedupeKey }).returning();
  const notification = inserted ?? (input.dedupeKey
    ? (await db.select().from(rentalNotificationsTable)
      .where(eq(rentalNotificationsTable.dedupeKey, input.dedupeKey)))[0]
    : undefined);
  if (!notification) throw new Error("Rental notification could not be queued");
  if (inserted && input.dispatch !== false) await processRentalNotificationQueue(1, notification.id);
  return notification;
}

export async function retryRentalNotification(id: number, confirmDuplicateRisk = false) {
  const [notification] = await db.select().from(rentalNotificationsTable)
    .where(eq(rentalNotificationsTable.id, id));
  if (!notification) return null;
  if (notification.deliveryStatus === "sent") return notification;
  if (notification.dataSubmittedAt && !confirmDuplicateRisk) return notification;
  if (notification.deliveryLeaseUntil && notification.deliveryLeaseUntil > new Date()) return notification;
  const [reset] = await db.update(rentalNotificationsTable).set({
    deliveryStatus: "pending",
    dataSubmittedAt: null,
    deliveryLeaseUntil: null,
    nextAttemptAt: null,
    lastError: null,
  }).where(and(
    eq(rentalNotificationsTable.id, id),
    inArray(rentalNotificationsTable.deliveryStatus, ["pending", "unconfigured", "failed"]),
    or(isNull(rentalNotificationsTable.deliveryLeaseUntil), lte(rentalNotificationsTable.deliveryLeaseUntil, new Date())),
  )).returning();
  if (!reset) {
    const [current] = await db.select().from(rentalNotificationsTable)
      .where(eq(rentalNotificationsTable.id, id));
    return current ?? null;
  }
  await processRentalNotificationQueue(1, id);
  const [retried] = await db.select().from(rentalNotificationsTable)
    .where(eq(rentalNotificationsTable.id, id));
  return retried ?? null;
}

async function queueReservationReminders(eventType: "pickup_reminder" | "return_reminder") {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60_000);
  const scheduledAt = eventType === "pickup_reminder"
    ? rentalReservationsTable.pickupAt
    : rentalReservationsTable.returnAt;
  const bookings = await db.select({
    reservation: rentalReservationsTable,
    request: rentalMarketplaceRequestsTable,
    driver: rentalDriversTable,
    operator: rentalOperatorsTable,
  }).from(rentalReservationsTable)
    .innerJoin(rentalMarketplaceRequestsTable, and(
      eq(rentalMarketplaceRequestsTable.reservationId, rentalReservationsTable.id),
      eq(rentalMarketplaceRequestsTable.status, "confirmed"),
    ))
    .innerJoin(rentalDriversTable, eq(rentalDriversTable.id, rentalReservationsTable.primaryDriverId))
    .innerJoin(rentalOperatorsTable, eq(rentalOperatorsTable.id, rentalReservationsTable.operatorId))
    .where(and(
      eq(rentalReservationsTable.status, "confirmed"),
      eq(rentalReservationsTable.source, "marketplace_request"),
      isNull(rentalReservationsTable.deletedAt),
      gt(scheduledAt, now),
      lte(scheduledAt, horizon),
    ));
  for (const { reservation, request, driver, operator } of bookings) {
    const actualScheduledAt = eventType === "pickup_reminder" ? reservation.pickupAt : reservation.returnAt;
    await queueRentalNotification({
      email: driver.email,
      eventType,
      bookingId: reservation.id,
      locale: request.locale === "ja" ? "ja" : "en",
      dedupeKey: `reservation:${reservation.id}:${eventType}`,
      dispatch: false,
      extra: { scheduledAt: actualScheduledAt.toISOString() },
    });
    await queueRentalNotification({
      email: operator.contactEmail,
      eventType,
      bookingId: reservation.id,
      locale: "en",
      dedupeKey: `reservation:${reservation.id}:${eventType}:operator`,
      dispatch: false,
      extra: {
        scheduledAt: actualScheduledAt.toISOString(),
        message: `Reminder for booking #${reservation.id}. Customer: ${driver.fullName}; pickup ${reservation.pickupAt.toISOString()}, return ${reservation.returnAt.toISOString()}. Contact the customer through their confirmed booking details.`,
      },
    });
  }
}

let workerTimer: NodeJS.Timeout | undefined;
let workerRun: Promise<void> | undefined;

export function startRentalNotificationWorker(intervalMs = 30_000) {
  if (workerTimer) return;
  const run = () => {
    if (workerRun) return workerRun;
    workerRun = (async () => {
      try {
        await queueReservationReminders("pickup_reminder");
        await queueReservationReminders("return_reminder");
        await processRentalNotificationQueue();
      } catch (error) {
        logger.error({ err: error, action: "rental_notification_worker_failed" });
      } finally {
        workerRun = undefined;
      }
    })();
    return workerRun;
  };
  void run();
  workerTimer = setInterval(() => void run(), intervalMs);
  workerTimer.unref();
}
