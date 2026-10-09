import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ArrowRight, Building2, Bookmark } from "lucide-react";
import { localizedPath, useLanguage } from "@/lib/language";
import { tokyoParts } from "@/lib/rental-marketplace";
import { formatRentalTime } from "@/lib/rental-time";

export const isCarDetailPath = (path: string) => /^\/(?:(?:en|ja|zh-TW|zh-CN)\/)?rentalcar\/cars\/[^/]+\/?$/.test(path);

type Trip = { pickupDate?: string; returnDate?: string; pickupTime?: string; returnTime?: string; pickupLocation?: string; returnLocation?: string };
const KEY = "ciao_rental_search_trip";
function storedTrip(): Trip {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    if (!stored || typeof stored !== "object") return {};
    const result: Trip = {};
    for (const key of ["pickupDate", "returnDate", "pickupTime", "returnTime", "pickupLocation", "returnLocation"] as const) {
      const value = stored[key];
      if (typeof value !== "string") continue;
      if (key.endsWith("Date") && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(value).getTime()))) continue;
      if (key.endsWith("Time") && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) continue;
      result[key] = value;
    }
    return result;
  } catch { return {}; }
}
function queryTrip(search: string): Trip | undefined {
  const params = new URLSearchParams(search);
  const pickup = params.get("pickupAt") || params.get("pickupDate");
  const returned = params.get("returnAt") || params.get("returnDate");
  if (!pickup && !returned) return;
  return {
    pickupDate: pickup ? tokyoParts(pickup).date : undefined,
    returnDate: returned ? tokyoParts(returned).date : undefined,
    pickupTime: params.get("pickupTime") || (pickup ? tokyoParts(pickup).time : undefined),
    returnTime: params.get("returnTime") || (returned ? tokyoParts(returned).time : undefined),
    pickupLocation: params.get("pickupLocation") || undefined,
    returnLocation: params.get("returnLocation") || undefined,
  };
}
const TripContext = createContext<{ trip: Trip; updateTrip: (value: Trip) => void } | null>(null);
export function RentalTripProvider({ children }: { children: ReactNode }) {
  const search = useSearch();
  const [trip, setTrip] = useState<Trip>(() => queryTrip(search) || storedTrip());
  const updateTrip = useCallback((value: Trip) => {
    setTrip(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
    try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Storage is optional. */ }
  }, []);
  useEffect(() => { const value = queryTrip(search); if (value) updateTrip(value); }, [search, updateTrip]);
  return <TripContext.Provider value={{ trip, updateTrip }}>{children}</TripContext.Provider>;
}
export function useRentalTrip() {
  const value = useContext(TripContext);
  if (!value) throw new Error("RentalTripProvider is required");
  return value;
}

const labels = {
  en: { pickup: "Pickup", returned: "Return", choose: "Choose dates", edit: "Edit search", lodging: "Lodging", bookings: "My bookings", navigation: "Quick links" },
  ja: { pickup: "受取", returned: "返却", choose: "日付を選択", edit: "検索を編集", lodging: "宿泊", bookings: "予約確認", navigation: "クイックリンク" },
  "zh-TW": { pickup: "取車", returned: "還車", choose: "選擇日期", edit: "修改搜尋", lodging: "住宿", bookings: "我的預訂", navigation: "快速連結" },
};
export function RentalNavigation() {
  const { language } = useLanguage();
  const [path, navigate] = useLocation();
  const { trip } = useRentalTrip();
  const copy = labels[language];
  const isCarsList = /\/rentalcar\/cars\/?$/.test(path);
  if (isCarDetailPath(path)) return null;
  function editSearch() {
    const form = document.getElementById("rental-search-form") || document.querySelector('[data-testid="form-home-car-search"]');
    if (form) { form.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    navigate(localizedPath("/rentalcar", language));
  }
  function dateLabel(date?: string) {
    if (!date) return copy.choose;
    const parsed = new Date(`${date}T12:00:00+09:00`);
    return Number.isNaN(parsed.getTime()) ? copy.choose : new Intl.DateTimeFormat(language === "zh-TW" ? "zh-TW" : language, { month: "short", day: "numeric", timeZone: "Asia/Tokyo" }).format(parsed);
  }
  return <>
    {!isCarsList && <div data-testid="mobile-trip-bar" className="fixed inset-x-0 top-[4.5rem] z-40 h-14 border-b bg-background/95 px-4 shadow-sm backdrop-blur md:hidden">
      <button type="button" onClick={editSearch} aria-label={copy.edit} className="mx-auto grid h-full w-full max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-3 text-left">
        <span className="min-w-0"><span className="block text-[10px] text-muted-foreground">{copy.pickup}</span><span className="block truncate text-xs font-semibold">{dateLabel(trip.pickupDate)}{trip.pickupDate && trip.pickupTime ? ` · ${formatRentalTime(trip.pickupTime)}` : ""}</span></span>
        <ArrowRight className="size-4 text-primary" aria-hidden="true" />
        <span className="min-w-0 text-right"><span className="block text-[10px] text-muted-foreground">{copy.returned}</span><span className="block truncate text-xs font-semibold">{dateLabel(trip.returnDate)}{trip.returnDate && trip.returnTime ? ` · ${formatRentalTime(trip.returnTime)}` : ""}</span></span>
      </button>
    </div>}
    <nav data-testid="mobile-public-navigation" aria-label={copy.navigation} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 divide-x border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-sm backdrop-blur md:hidden">
      <Link href={localizedPath("/lodging", language)} className="flex h-14 min-w-0 items-center justify-center gap-2 px-2 text-sm font-semibold"><Building2 className="size-4 shrink-0 text-primary" />{copy.lodging}</Link>
      <Link href={localizedPath("/rentalcar/my-bookings", language)} className="flex h-14 min-w-0 items-center justify-center gap-2 px-2 text-sm font-semibold"><Bookmark className="size-4 shrink-0 text-primary" />{copy.bookings}</Link>
    </nav>
  </>;
}
