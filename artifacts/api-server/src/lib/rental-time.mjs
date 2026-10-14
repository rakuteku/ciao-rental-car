/** Server-side formatter for customer/staff rental times. */
export function formatTokyo(instant, locale = "en") {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return String(instant);
  const language = locale === "ja" ? "ja-JP" : locale === "zh-TW" ? "zh-TW" : "en-GB";
  const label = locale === "en" ? "JST" : "日本時間";
  return `${new Intl.DateTimeFormat(language, { timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)} ${label}`;
}

export function tokyoHour(instant) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(date).find(part => part.type === "hour")?.value;
  return hour === undefined ? null : Number(hour);
}
