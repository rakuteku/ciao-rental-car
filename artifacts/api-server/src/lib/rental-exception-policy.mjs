/**
 * Cancellation percentages are accepted only when the saved reservation policy
 * contains an explicit machine-readable schedule. Free-form wording is retained
 * as evidence but never guessed into a money amount.
 */
export function savedCancellationPercent(policy, pickupAt, now = new Date()) {
  let value = policy;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(value) || value.length === 0 ||
      !(pickupAt instanceof Date) || !Number.isFinite(pickupAt.getTime())) return null;
  if (!value.every((rule) =>
    rule && Number.isFinite(Number(rule.daysBefore)) &&
    Number.isFinite(Number(rule.refundPercent)) &&
    Number(rule.daysBefore) >= 0 &&
    Number(rule.refundPercent) >= 0 &&
    Number(rule.refundPercent) <= 100
  ) || !value.some((rule) => Number(rule.daysBefore) === 0)) return null;
  const daysBefore = Math.max(0, (pickupAt.getTime() - now.getTime()) / 86_400_000);
  const rules = value.filter((rule) =>
    rule && Number.isFinite(Number(rule.daysBefore)) &&
    Number.isFinite(Number(rule.refundPercent)) &&
    Number(rule.daysBefore) >= 0 &&
    Number(rule.refundPercent) >= 0 &&
    Number(rule.refundPercent) <= 100
  ).sort((left, right) => Number(right.daysBefore) - Number(left.daysBefore));
  const applicable = rules.find((rule) => daysBefore >= Number(rule.daysBefore));
  return applicable ? Number(applicable.refundPercent) : null;
}

export function cancellationRefund(totalPaid, percent) {
  if (!Number.isSafeInteger(totalPaid) || totalPaid < 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("Cancellation refund inputs are invalid");
  }
  return Math.floor(totalPaid * percent / 100);
}

export function canAcceptOperatorCancellationChoice({ accepted, choice, selectedChoice = null }) {
  if (accepted !== true || !["full_refund", "alternative"].includes(choice)) return false;
  return selectedChoice == null || selectedChoice === choice;
}

export function isQuoteLive(expiresAt, now = new Date()) {
  return expiresAt instanceof Date && expiresAt.getTime() > now.getTime();
}

export function isExtensionApproved(snapshot) {
  const approval = snapshot?.operatorApproval;
  return typeof snapshot?.quoteVersion === "string" && snapshot.quoteVersion.length > 0 &&
    approval?.approved === true && approval.quoteVersion === snapshot.quoteVersion &&
    typeof approval.approvedAt === "string" && Number.isSafeInteger(approval.staffId) && approval.staffId > 0;
}

export function extensionQuoteMatches(snapshot, current) {
  return snapshot?.vehicleId === current?.vehicleId &&
    snapshot?.oldReturnAt === current?.returnAt &&
    Math.round(Number(snapshot?.oldTotal)) === Math.round(Number(current?.finalTotal)) &&
    Math.round(Number(snapshot?.newTotal)) === Math.round(Number(current?.newTotal)) &&
    Math.round(Number(snapshot?.additionalAmount)) === Math.round(Number(current?.additionalAmount));
}