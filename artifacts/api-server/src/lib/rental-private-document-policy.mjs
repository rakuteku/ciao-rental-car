const allowedContentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export function rentalMarketplaceEnabled() {
  return process.env.RENTAL_MARKETPLACE_ENABLED?.trim().toLowerCase() === "true";
}

export function isAllowedRentalDocumentContentType(value) {
  return typeof value === "string" && allowedContentTypes.has(value.toLowerCase());
}

export function rentalPrivateReference(token) {
  return `rental-private://${token}`;
}

export function parseRentalPrivateReference(reference) {
  if (!reference) return null;
  const match = /^rental-private:\/\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(reference);
  return match?.[1] ?? null;
}