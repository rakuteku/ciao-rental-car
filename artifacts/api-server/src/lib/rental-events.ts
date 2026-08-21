import { db, rentalAuditLogTable, rentalNotificationsTable } from "@workspace/db";

type AuditValue = Record<string, unknown> | null | undefined;

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

const EN_TEMPLATES: Record<string, (data: Record<string, unknown>) => string> = {
  new_booking: ({ bookingId, accessCode }) => `We received your CIAO Rental Car booking #${bookingId}. Your booking access code is: ${accessCode ?? "available in your booking confirmation"}.`,
  booking_confirmed: ({ bookingId }) => `Your CIAO Rental Car booking #${bookingId} is confirmed.`,
  document_approved: ({ bookingId }) => `Your documents for booking #${bookingId} were approved.`,
  document_rejected: ({ bookingId }) => `Please review and resubmit documents for booking #${bookingId}.`,
  pickup_reminder: ({ bookingId }) => `Your CIAO rental #${bookingId} starts in 24 hours.`,
  return_reminder: ({ bookingId }) => `Your CIAO rental #${bookingId} is due back in 24 hours.`,
  overdue_alert: ({ bookingId }) => `Your CIAO rental #${bookingId} is overdue. Please contact us.`,
  cancellation_confirmed: ({ bookingId }) => `Your cancellation request for booking #${bookingId} has been recorded.`,
  refund_processed: ({ bookingId }) => `A refund was recorded for booking #${bookingId}.`,
};

/**
 * Persists delivery-ready notifications. SMTP is intentionally optional: when
 * no mail transport is configured this is a reliable, inspectable log-only
 * delivery stub rather than pretending an email was sent.
 */
export async function queueRentalNotification(input: {
  email?: string | null;
  eventType: keyof typeof EN_TEMPLATES;
  bookingId: number;
  extra?: Record<string, unknown>;
}) {
  const payload = {
    localeTemplates: {
      en: EN_TEMPLATES[input.eventType]({ bookingId: input.bookingId, ...input.extra }),
      ja: null,
      zh: null,
    },
    bookingId: input.bookingId,
    ...input.extra,
  };
  await db.insert(rentalNotificationsTable).values({
    email: input.email ?? null,
    eventType: input.eventType,
    payload,
    channel: process.env.SMTP_HOST ? "smtp_pending" : "log_only",
  });
}