export function isLodgingEnabled(value = process.env.LODGING_ENABLED): boolean {
  return value?.trim().toLowerCase() === "true";
}
