export function savedCancellationPercent(
  policy: unknown,
  pickupAt: Date,
  now?: Date,
): number | null;
export function cancellationRefund(totalPaid: number, percent: number): number;
export function canAcceptOperatorCancellationChoice(input: {
  accepted: boolean;
  choice: "full_refund" | "alternative" | string | undefined;
  selectedChoice?: "full_refund" | "alternative" | string | null;
}): boolean;
export function isQuoteLive(expiresAt: Date, now?: Date): boolean;
export function isExtensionApproved(snapshot: Record<string, unknown>): boolean;
export function extensionQuoteMatches(
  snapshot: Record<string, unknown>,
  current: {
    vehicleId: number;
    returnAt: string;
    finalTotal: number;
    newTotal: number;
    additionalAmount: number;
  },
): boolean;