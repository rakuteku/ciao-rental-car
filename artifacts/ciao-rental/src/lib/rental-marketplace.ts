export type Attribution = {
  firstTouch?: { url: string; at: string }; lastTouch?: { url: string; at: string }; utmSource?: string; utmMedium?: string;
  utmCampaign?: string; landingUrl?: string; referralCode?: string; hotelCode?: string;
};
const KEY = "ciao_rental_attribution_v1";

export function captureRentalAttribution(): Attribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  let previous: Attribution = {};
  try { previous = JSON.parse(sessionStorage.getItem(KEY) || "{}") as Attribution; } catch { /* discard malformed storage */ }
  const tagged = ["utm_source", "utm_medium", "utm_campaign", "referralCode", "ref", "hotelCode", "hotel"].some(key => params.has(key));
  // Navigating inside the site must not overwrite the landing touch.
  const entry = `${window.location.pathname}${window.location.search}`;
  const next: Attribution = {
    ...previous,
    firstTouch: previous.firstTouch || { url: entry, at: new Date().toISOString() },
    lastTouch: tagged ? { url: entry, at: new Date().toISOString() } : previous.lastTouch || { url: entry, at: new Date().toISOString() },
    landingUrl: previous.landingUrl || entry,
    utmSource: params.get("utm_source") || previous.utmSource,
    utmMedium: params.get("utm_medium") || previous.utmMedium,
    utmCampaign: params.get("utm_campaign") || previous.utmCampaign,
    referralCode: params.get("referralCode") || params.get("ref") || previous.referralCode,
    hotelCode: params.get("hotelCode") || params.get("hotel") || previous.hotelCode,
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private storage unavailable */ }
  return next;
}

// datetime-local and calendar dates are wall times. Never use the browser's timezone.
export function tokyoInstant(date: string, time: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Select a valid date and time.");
  const iso = `${date}T${time}:00+09:00`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed) !== date) throw new Error("Select a valid Tokyo date.");
  return parsed.toISOString();
}

export function tokyoParts(instant: string): { date: string; time: string } {
  const d = new Date(instant);
  if (Number.isNaN(d.getTime())) return { date: "", time: "10:00" };
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function formatTokyo(instant: string, language: string): string {
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? instant : new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : "en-GB", { timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) + " JST";
}

export interface RentalRequest {
  id: number;
  accessCode?: string;
  customerAccessToken?: string;
  status: string;
  vehicleId?: number;
  vehicle?: { id?: number; publicTitle?: string; title?: string; slug?: string };
  vehicleTitle?: string;
  declinedReason?: string | null;
  pickupAt?: string;
  returnAt?: string;
  pickupLocation?: string;
  returnLocation?: string;
  quotedTotal?: number;
  finalTotal?: number;
  offerTotal?: number;
  offer?: { vehicleId?: number; vehicleTitle?: string; vehicle?: { id?: number; publicTitle?: string; title?: string }; totalPrice?: number; total?: number; finalTotal?: number; pickupAt?: string; returnAt?: string; pickupLocation?: string; returnLocation?: string; notes?: string; partnerReason?: string; expiresAt?: string; policy?: { marketplace?: Record<string, unknown>; vehicle?: Record<string, unknown> } };
  originalOffer?: RentalRequest["offer"];
  respondBy?: string;
  paymentDeadline?: string;
  paymentAvailable?: boolean;
  paymentEmailStatus?: string;
  paymentEmailDeliveryStatus?: string;
  paymentEmail?: { status?: string };
  emailDeliveryStatus?: string;
  pricing?: { finalTotal?: number };
  operatorName?: string;
}

export interface RentalPaymentState {
  verified?: boolean;
  configured?: boolean;
  paymentStatus?: string;
  status?: string;
  reservationStatus?: string;
  requestStatus?: string;
  paymentAvailable?: boolean;
  checkoutAvailable?: boolean;
  terminal?: boolean;
  emailDeliveryStatus?: string;
  paymentEmailStatus?: string;
}

export interface CreateRentalRequest {
  holdId: number; vehicleId: number; pickupLocation: string; returnLocation: string;
  driver: { fullName: string; email: string; phone: string; romanizedName?: string; nationality?: string; flightNumber?: string; accommodation?: string };
  additionalDrivers?: Array<{ fullName: string; email: string; phone: string }>;
  travelNotes?: string; marketingConsent: boolean; locale?: "en" | "ja" | "zh-TW"; attribution?: Attribution;
  addons?: Array<{ addonId: number; qty: number }>;
}

async function rentalRequest<T>(path: string, body?: unknown, locale?: "en" | "ja" | "zh-TW"): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST", credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(locale ? { "Accept-Language": locale } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const createRentalRequest = (body: CreateRentalRequest, locale: "en" | "ja" | "zh-TW") => rentalRequest<RentalRequest>("/api/rental/requests", body, locale);
export const getRentalRequest = (id: number, code: string) => rentalRequest<RentalRequest>(`/api/rental/requests/${encodeURIComponent(id)}?accessCode=${encodeURIComponent(code)}`);
export const getRentalPaymentState = (id: number, code: string) => rentalRequest<RentalPaymentState>(`/api/rental/requests/${encodeURIComponent(id)}/payment?accessCode=${encodeURIComponent(code)}`);
export const acceptRentalOffer = (id: number, code: string) => rentalRequest<RentalRequest>(`/api/rental/requests/${encodeURIComponent(id)}/accept-offer?accessCode=${encodeURIComponent(code)}`, {});
export async function createRentalCheckout(id: number, code: string): Promise<{ url: string }> {
  const response = await fetch(`/api/rental/requests/${encodeURIComponent(id)}/checkout?accessCode=${encodeURIComponent(code)}`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || error.message || `Request failed (${response.status}).`);
  }
  const result = await response.json() as { checkoutUrl?: unknown };
  const returnedUrl = result.checkoutUrl;
  if (typeof returnedUrl !== "string") throw new Error("The checkout service did not return a Stripe URL.");
  let parsed: URL;
  try { parsed = new URL(returnedUrl); } catch { throw new Error("The checkout service returned an invalid Stripe URL."); }
  if (parsed.protocol !== "https:" || parsed.hostname !== "checkout.stripe.com") {
    throw new Error("The checkout service returned an untrusted payment URL.");
  }
  return { url: returnedUrl };
}
