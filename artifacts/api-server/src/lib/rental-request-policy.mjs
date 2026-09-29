export function hasExplicitUtcOffset(value) {
  return typeof value === "string" && /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value);
}

export function marketplaceBillablePeriodCount(start, end, periodHours) {
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const periodMs = Math.max(1, periodHours) * 60 * 60 * 1000;
  return Math.max(1, Math.ceil(duration / periodMs));
}

export function tokyoRentalDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function matchesMarketplaceSeason(date, startDate, endDate) {
  const japanDate = tokyoRentalDate(date);
  return japanDate >= startDate && japanDate <= endDate;
}

export function isRentalRequestExpired(status, respondBy, paymentDeadline, now = new Date()) {
  if (!["requested", "offer_pending", "awaiting_payment"].includes(status)) return false;
  const deadline = status === "awaiting_payment" ? paymentDeadline : respondBy;
  return deadline instanceof Date && deadline <= now;
}

export function mayAcceptAlternateOffer(status) {
  return status === "offer_pending";
}

export function isMarketplaceEnabled(flag) {
  return flag?.trim().toLowerCase() === "true";
}