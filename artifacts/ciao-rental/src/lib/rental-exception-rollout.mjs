/** A global flag must never replace the legacy actions on an existing booking. */
export function usesMarketplaceExceptions(flagEnabled, reservationSource) {
  return flagEnabled === true && reservationSource === "marketplace_request";
}