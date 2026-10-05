export interface TimeBasedRates {
  rate6Hours?: number | null;
  rate12Hours: number;
  rate24Hours: number;
  additional24Hours: number;
  additionalHour: number;
  gracePeriodMinutes?: number;
  cheapestRateEnabled?: boolean;
  additionalDayCapEnabled?: boolean;
}

export interface TimeBasedRateResult {
  durationMinutes: number;
  billedHours: number;
  fullAdditionalDays: number;
  additionalHours: number;
  baseAmount: number;
  extensionAmount: number;
  fullAdditionalDaysAmount: number;
  additionalHoursAmount: number;
  total: number;
  tier: "6_hours" | "12_hours" | "24_hours" | "extended";
}

export function calculateTimeBasedRate(
  pickupAt: Date,
  returnAt: Date,
  rates: TimeBasedRates,
): TimeBasedRateResult {
  const durationMinutes = Math.max(1, Math.ceil((returnAt.getTime() - pickupAt.getTime()) / 60_000));
  const grace = Math.max(0, rates.gracePeriodMinutes ?? 0);
  const billedHours = Math.max(1, Math.ceil(Math.max(1, durationMinutes - grace) / 60));

  if (billedHours <= 6 && rates.rate6Hours != null && rates.rate6Hours > 0) {
    return { durationMinutes, billedHours, fullAdditionalDays: 0, additionalHours: 0, baseAmount: rates.rate6Hours, extensionAmount: 0, fullAdditionalDaysAmount: 0, additionalHoursAmount: 0, total: rates.rate6Hours, tier: "6_hours" };
  }
  if (billedHours <= 12) {
    return { durationMinutes, billedHours, fullAdditionalDays: 0, additionalHours: 0, baseAmount: rates.rate12Hours, extensionAmount: 0, fullAdditionalDaysAmount: 0, additionalHoursAmount: 0, total: rates.rate12Hours, tier: "12_hours" };
  }
  if (billedHours <= 24) {
    return { durationMinutes, billedHours, fullAdditionalDays: 0, additionalHours: 0, baseAmount: rates.rate24Hours, extensionAmount: 0, fullAdditionalDaysAmount: 0, additionalHoursAmount: 0, total: rates.rate24Hours, tier: "24_hours" };
  }

  const extensionHours = billedHours - 24;
  const fullAdditionalDays = Math.floor(extensionHours / 24);
  const additionalHours = extensionHours % 24;
  const fullDayAmount = fullAdditionalDays * rates.additional24Hours;
  const hourlyAmount = additionalHours * rates.additionalHour;
  const shouldCap = rates.cheapestRateEnabled !== false || rates.additionalDayCapEnabled !== false;
  const remainderAmount = additionalHours === 0
    ? 0
    : shouldCap ? Math.min(hourlyAmount, rates.additional24Hours) : hourlyAmount;
  const extensionAmount = fullDayAmount + remainderAmount;

  return {
    durationMinutes,
    billedHours,
    fullAdditionalDays,
    additionalHours,
    baseAmount: rates.rate24Hours,
    extensionAmount,
    fullAdditionalDaysAmount: fullDayAmount,
    additionalHoursAmount: remainderAmount,
    total: rates.rate24Hours + extensionAmount,
    tier: "extended",
  };
}

export function validateTimeBasedRates(rates: TimeBasedRates): string[] {
  const entries = [rates.rate6Hours, rates.rate12Hours, rates.rate24Hours, rates.additional24Hours, rates.additionalHour]
    .filter((value): value is number => value != null);
  const errors: string[] = [];
  if (entries.some((value) => !Number.isInteger(value) || value < 0)) errors.push("Rates must use non-negative whole yen amounts.");
  if (!rates.rate12Hours) errors.push("The 12-hour rate is required.");
  if (!rates.rate24Hours) errors.push("The 24-hour rate is required.");
  if (!rates.additional24Hours) errors.push("The additional 24-hour rate is required.");
  if (!rates.additionalHour) errors.push("The additional-hour rate is required.");
  if (rates.rate12Hours > rates.rate24Hours) errors.push("The 12-hour rate cannot be higher than the 24-hour rate.");
  return errors;
}
