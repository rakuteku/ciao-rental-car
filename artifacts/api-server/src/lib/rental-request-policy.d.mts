export function hasExplicitUtcOffset(value: unknown): value is string;
export function marketplaceBillablePeriodCount(start: Date, end: Date, periodHours: number): number;
export function tokyoRentalDate(date: Date): string;
export function matchesMarketplaceSeason(date: Date, startDate: string, endDate: string): boolean;
export function isRentalRequestExpired(status: string, respondBy: Date, paymentDeadline: Date | null, now?: Date): boolean;
export function mayAcceptAlternateOffer(status: string): boolean;
export function isMarketplaceEnabled(flag: string | undefined): boolean;