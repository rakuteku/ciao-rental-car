export const HALF_HOUR_TIMES = Array.from({ length: 19 }, (_, index) =>
  `${String(10 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
);

export const isRentalTime = (value?: string): boolean => Boolean(value && HALF_HOUR_TIMES.includes(value));

export function formatRentalTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return "";
  const [hour, minutes] = value.split(":");
  return `${Number(hour) % 12 || 12}:${minutes} ${Number(hour) < 12 ? "AM" : "PM"}`;
}
