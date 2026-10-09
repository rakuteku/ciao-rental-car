import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { localizedPath, type Language } from "@/lib/language";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";
import { tokyoInstant, tokyoParts } from "@/lib/rental-marketplace";
import { RentalTimeSelect } from "@/components/rental/RentalTimeSelect";
import { useRentalTrip, useStickySummaryVisible } from "@/components/rental/RentalNavigation";
import { isRentalTime } from "@/lib/rental-time";

const copy = {
  en: {
    title: "Find a car for your dates",
    pickupDate: "Pickup date",
    returnDate: "Return date",
    pickupTime: "Pickup time",
    returnTime: "Return time",
    pickupLocation: "Pickup location",
    guests: "Travelers",
    search: "Find available cars",
    note: "Search vehicle availability for these dates. Explore lodging separately.",
    invalidDates: "Choose a return date after your pickup date.",
    invalidTimes: "Choose pickup and return times between 10:00 AM and 7:00 PM.",
  },
  ja: {
    title: "ご希望の日程で車を探す",
    pickupDate: "受取日",
    returnDate: "返却日",
    pickupTime: "受取時間",
    returnTime: "返却時間",
    pickupLocation: "受取場所",
    guests: "乗車人数",
    search: "空車を検索",
    note: "選択した日程で車両の空き状況を検索します。宿泊施設は別ページをご覧ください。",
    invalidDates: "返却日は受取日より後の日付を選択してください。",
    invalidTimes: "受取・返却時間は10:00 AMから7:00 PMの間で選択してください。",
  },
  "zh-TW": {
    title: "搜尋符合日期的租車",
    pickupDate: "取車日期",
    returnDate: "還車日期",
    pickupTime: "取車時間",
    returnTime: "還車時間",
    pickupLocation: "取車地點",
    guests: "乘客人數",
    search: "搜尋可用車輛",
    note: "依照所選日期查詢車輛供應情況。住宿資訊請另行查看。",
    invalidDates: "還車日期請選擇取車日期之後。",
    invalidTimes: "請選擇10:00 AM至7:00 PM之間的取車與還車時間。",
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
  const { trip, updateTrip } = useRentalTrip();
  const stickySummaryVisible = useStickySummaryVisible();
  const [pickupDate, setPickupDate] = useState(trip.pickupDate || today);
  const [returnDate, setReturnDate] = useState(trip.returnDate || tomorrow);
  const [pickupTime, setPickupTime] = useState(trip.pickupTime || "10:00");
  const [returnTime, setReturnTime] = useState(trip.returnTime || "10:00");
  const [pickupLocation, setPickupLocation] = useState(trip.pickupLocation || DEFAULT_RENTAL_LOCATIONS[0].value);
  const [adults, setAdults] = useState("2");
  const [error, setError] = useState("");
  useEffect(() => { updateTrip({ pickupDate, returnDate, pickupTime, returnTime, pickupLocation, returnLocation: pickupLocation }); }, [pickupDate, returnDate, pickupTime, returnTime, pickupLocation, updateTrip]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isRentalTime(pickupTime) || !isRentalTime(returnTime)) {
      setError(labels.invalidTimes);
      return;
    }
    if (!pickupDate || !returnDate || tokyoInstant(returnDate, returnTime) <= tokyoInstant(pickupDate, pickupTime)) {
      setError(labels.invalidDates);
      return;
    }
    setError("");

    const pickupAt = tokyoInstant(pickupDate, pickupTime);
    const returnAt = tokyoInstant(returnDate, returnTime);
    const params = new URLSearchParams({
      pickupLocation,
      returnLocation: pickupLocation,
      pickupAt,
      returnAt,
      pickupDate: pickupAt,
      returnDate: returnAt,
      pickupTime,
      returnTime,
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
    {stickySummaryVisible && createPortal(<form onSubmit={onSubmit} aria-label={labels.title} data-testid="home-sticky-search" className="public-site fixed inset-x-0 top-[4.5rem] z-40 hidden border-b bg-background px-3 py-2 text-foreground shadow-sm md:block">
      <div className="mx-auto grid max-w-5xl grid-cols-2 items-center gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto]">
        <label className="min-w-0 text-[10px] text-muted-foreground">{labels.pickupDate}<input aria-label={labels.pickupDate} type="date" required min={today} value={pickupDate} onChange={event => { const value = event.target.value; setPickupDate(value); if (returnDate <= value) setReturnDate(nextTokyoDate(value)); }} className="block w-full bg-transparent text-sm font-semibold text-foreground" /></label>
        <label className="min-w-0 text-[10px] text-muted-foreground">{labels.returnDate}<input aria-label={labels.returnDate} type="date" required min={pickupDate} value={returnDate} onChange={event => setReturnDate(event.target.value)} className="block w-full bg-transparent text-sm font-semibold text-foreground" /></label>
        <label className="hidden min-w-0 text-[10px] text-muted-foreground md:block">{labels.pickupLocation}<select value={pickupLocation} onChange={event => setPickupLocation(event.target.value)} className="block w-full bg-transparent text-sm text-foreground">{locations.map(location => <option key={location.value} value={location.value}>{rentalLocationLabel(location.value, locations, language)}</option>)}</select></label>
        <button type="submit" className="hidden h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm text-primary-foreground md:flex"><Search className="size-4" />{labels.search}</button>
      </div>
    </form>, document.body)}
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-5xl rounded-md border border-white/50 bg-background p-3 text-left shadow-xl sm:p-4"
      aria-label={labels.title}
      data-testid="form-home-car-search"
    >
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold text-foreground">{labels.title}</p>
        <Search aria-hidden="true" className="size-4 text-primary" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
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
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{labels.pickupTime}</span>
          <RentalTimeSelect aria-label={labels.pickupTime} data-testid="select-home-pickup-time" value={pickupTime} onChange={event => setPickupTime(event.target.value)} className="h-7 border-0 px-0 font-semibold" />
        </label>
        <label className="col-span-2 min-w-0 rounded-md border border-border bg-background px-3 py-2.5 lg:col-span-1">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"><MapPin aria-hidden="true" className="size-3.5" />{labels.pickupLocation}</span>
          <select data-testid="select-home-pickup-location" value={pickupLocation} onChange={event => setPickupLocation(event.target.value)} className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-foreground outline-none focus-visible:ring-0">
            {locations.map(location => <option key={location.value} value={location.value}>{rentalLocationLabel(location.value, locations, language)}</option>)}
          </select>
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
          <span className="mb-1 block text-[10px] font-medium text-muted-foreground">{labels.returnTime}</span>
          <RentalTimeSelect aria-label={labels.returnTime} data-testid="select-home-return-time" value={returnTime} onChange={event => setReturnTime(event.target.value)} className="h-7 border-0 px-0 font-semibold" />
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
          className="col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:col-span-3"
        >
          {labels.search}<Search aria-hidden="true" className="size-4" />
        </button>
      </div>
      {error && <p id="home-search-error" className="mt-2 px-1 text-xs font-medium text-destructive" role="alert" data-testid="status-home-search-error">{error}</p>}
      <p className="mt-2 px-1 text-[10px] leading-5 text-muted-foreground" data-testid="text-home-room-confirmation-note">{labels.note}</p>
    </form>
    </>
  );
}
