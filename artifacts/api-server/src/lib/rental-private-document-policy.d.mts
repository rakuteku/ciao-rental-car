export function rentalMarketplaceEnabled(): boolean;
export function isAllowedRentalDocumentContentType(value: unknown): value is string;
export function rentalPrivateReference(token: string): string;
export function parseRentalPrivateReference(reference: string | null | undefined): string | null;