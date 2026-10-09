import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { CalendarDays, MapPin, Search, Users, Building2, Bookmark } from "lucide-react";
import { localizedPath, type Language } from "@/lib/language";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";
import { tokyoInstant, tokyoParts } from "@/lib/rental-marketplace";

const copy = {
  en: {
    title: "Find a car for your dates",
    pickupDate: "Pickup date",
    returnDate: "Return date",
    pickupLocation: "Pickup location",
    guests: "Travelers",
    search: "Find available cars",
    note: "Search vehicle availability for these dates. Explore lodging separately.",
    invalidDates: "Choose a return date after your pickup date.",
  },
  ja: {
    title: "ご希望の日程で車を探す",
    pickupDate: "受取日",
    returnDate: "返却日",
    pickupLocation: "受取場所",
    guests: "乗車人数",
    search: "空車を検索",
    note: "選択した日程で車両の空き状況を検索します。宿泊施設は別ページをご覧ください。",
    invalidDates: "返却日は受取日より後の日付を選択してください。",
  },
  "zh-TW": {
    title: "搜尋符合日期的租車",
    pickupDate: "取車日期",
    returnDate: "還車日期",
    pickupLocation: "取車地點",
    guests: "乘客人數",
    search: "搜尋可用車輛",
    note: "依照所選日期查詢車輛供應情況。住宿資訊請另行查看。",
    invalidDates: "還車日期請選擇取車日期之後。",
  },
} satisfies Record<Language, Record<string, string>>;

const todayInTokyo = () => tokyoParts(new Date().toISOString()).date;
const nextTokyoDate = (date: string) => {
  const next = new Date(`${date}T12:00:00+09:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return tokyoParts(next.toISOString()).date;
};

export function HomeSearchPanel({ language }: { language: Language }) {
  const [, setLocation] = useLocation();
  const { data: configuredLocations } = useRentalLocations();
  const locations = configuredLocations ?? DEFAULT_RENTAL_LOCATIONS;
  const labels = copy[language];
  const today = todayInTokyo();
  const tomorrow = nextTokyoDate(today);
  const [pickupDate, setPickupDate] = useState(today);
  const [returnDate, setReturnDate] = useState(tomorrow > today ? tomorrow : today);
  const [pickupLocation, setPickupLocation] = useState(DEFAULT_RENTAL_LOCATIONS[0].value);
  const [adults, setAdults] = useState("2");
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLFormElement>(null);
  const [sticky, setSticky] = useState(false);
  const shortcuts = language === "ja" ? ["宿泊", "予約確認"] : language === "zh-TW" ? ["住宿", "我的預訂"] : ["Lodging", "My bookings"];

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new IntersectionObserver(([entry]) => setSticky(!entry.isIntersecting && entry.boundingClientRect.top < 88), { rootMargin: "-88px 0px 0px 0px" });
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pickupDate || !returnDate || returnDate <= pickupDate) {
      setError(labels.invalidDates);
      return;
    }
    setError("");

    const pickupAt = tokyoInstant(pickupDate, "10:00");
    const returnAt = tokyoInstant(returnDate, "10:00");
    const params = new URLSearchParams({
      pickupLocation,
      returnLocation: pickupLocation,
      pickupAt,
      returnAt,
      pickupDate: pickupAt,
      returnDate: returnAt,
      pickupTime: "10:00",
      returnTime: "10:00",
      adults,
      children: "0",
      babies: "0",
      luggageLarge: "0",
      luggageSmall: "0",
    });
    setLocation(`${localizedPath("/rentalcar/cars", language)}?${params.toString()}`);
  }

  return (
    <>
    {sticky && createPortal(<form onSubmit={onSubmit} aria-label={labels.title} data-testid="home-sticky-search" className="public-site fixed inset-x-0 top-[4.5rem] z-40 border-b bg-background px-3 py-2 text-foreground shadow-sm">
      <div className="mx-auto grid max-w-5xl grid-cols-2 items-center gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto]">
        <label className="min-w-0 text-[10px] text-muted-foreground">{labels.pickupDate}<input aria-label={labels.pickupDate} type="date" required min={today} value={pickupDate} onChange={event => { const value = event.target.value; setPickupDate(value); if (returnDate <= value) setReturnDate(nextTokyoDate(value)); }} className="block w-full bg-transparent text-sm font-semibold text-foreground" /></label>
        <label className="min-w-0 text-[10px] text-muted-foreground">{labels.returnDate}<input aria-label={labels.returnDate} type="date" required min={pickupDate} value={returnDate} onChange={event => setReturnDate(event.target.value)} className="block w-full bg-transparent text-sm font-semibold text-foreground" /></label>
        <label className="hidden min-w-0 text-[10px] text-muted-foreground md:block">{labels.pickupLocation}<select value={pickupLocation} onChange={event => setPickupLocation(event.target.value)} className="block w-full bg-transparent text-sm text-foreground">{locations.map(location => <option key={location.value} value={location.value}>{rentalLocationLabel(location.value, locations, language)}</option>)}</select></label>
        <button type="submit" className="hidden h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground md:flex"><Search className="size-4" />{labels.search}</button>
      </div>
    </form>, document.body)}
    <form
      ref={panelRef}
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-5xl rounded-md border border-white/50 bg-background p-3 text-left shadow-xl sm:p-4"
      aria-label={labels.title}
      data-testid="form-home-car-search"
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold text-foreground">{labels.title}</p>
        <Search aria-hidden="true" className="size-4 text-primary" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[1fr_1fr_1.2fr_.75fr_auto]">
        <label className="min-w-0 rounded-md border border-border bg-background px-3 py-2.5">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5" />{labels.pickupDate}
          </span>
          <input
            data-testid="input-home-pickup-date"
            type="date"
            required
            min={today}
            value={pickupDate}
            onChange={(event) => {
              const nextPickup = event.target.value;
              setPickupDate(nextPickup);
              if (nextPickup && returnDate <= nextPickup) setReturnDate(nextTokyoDate(nextPickup));
              setError("");
            }}
            className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none focus-visible:ring-0"
          />
        </label>
        <label className="min-w-0 rounded-md border border-border bg-background px-3 py-2.5">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5" />{labels.returnDate}
          </span>
          <input
            data-testid="input-home-return-date"
            type="date"
            required
            min={pickupDate || today}
            value={returnDate}
            onChange={(event) => {
              setReturnDate(event.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "home-search-error" : undefined}
            className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none focus-visible:ring-0"
          />
        </label>
        <label className="min-w-0 rounded-md border border-border bg-background px-3 py-2.5">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5" />{labels.pickupLocation}
          </span>
          <select
            data-testid="select-home-pickup-location"
            value={pickupLocation}
            onChange={(event) => setPickupLocation(event.target.value)}
            className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none focus-visible:ring-0"
          >
            {locations.map((location) => (
              <option key={location.value} value={location.value}>{rentalLocationLabel(location.value, locations, language)}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 rounded-md border border-border bg-background px-3 py-2.5">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <Users aria-hidden="true" className="size-3.5" />{labels.guests}
          </span>
          <select
            data-testid="select-home-passengers"
            value={adults}
            onChange={(event) => setAdults(event.target.value)}
            className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none focus-visible:ring-0"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <button
          data-testid="button-home-search-cars"
          type="submit"
          className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:col-span-1 lg:min-w-44"
        >
          {labels.search}<Search aria-hidden="true" className="size-4" />
        </button>
      </div>
      {error && <p id="home-search-error" className="mt-2 px-1 text-xs font-medium text-destructive" role="alert" data-testid="status-home-search-error">{error}</p>}
      <p className="mt-2 px-1 text-[10px] leading-5 text-muted-foreground" data-testid="text-home-room-confirmation-note">{labels.note}</p>
    </form>
    {createPortal(<nav aria-label={language === "ja" ? "クイックリンク" : language === "zh-TW" ? "快速連結" : "Quick links"} className="public-site fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 divide-x border-t bg-background pb-[env(safe-area-inset-bottom)] text-foreground shadow-sm md:hidden">
      <Link href={localizedPath("/lodging", language)} className="flex min-h-14 items-center justify-center gap-2 text-sm font-medium"><Building2 className="size-4" />{shortcuts[0]}</Link>
      <Link href={localizedPath("/rentalcar/my-bookings", language)} className="flex min-h-14 items-center justify-center gap-2 text-sm font-medium"><Bookmark className="size-4" />{shortcuts[1]}</Link>
    </nav>, document.body)}
    </>
  );
}
