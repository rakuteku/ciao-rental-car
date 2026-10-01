import { Link, useLocation } from "wouter";
import { useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Car as CarIcon, MapPin, Shield, CreditCard, ChevronRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGetPageContent, useGetRentalAddons, useGetRentalVehicles } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { localizeContent, localizedPath, useLanguage } from "@/lib/language";
import { localizeAddon, rentalCopy } from "@/lib/rental-localization";
import { captureRentalAttribution, tokyoInstant, tokyoParts } from "@/lib/rental-marketplace";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";

interface PricingRow {
  label: string;
  value: string;
}

interface Plan {
  name: string;
  description: string;
  price: string;
}

interface RentalCarContent {
  hero: { eyebrow: string; title: string; subtitle: string };
  search: Record<string, string>;
  sections: Record<string, string>;
  pricingTable: { title: string; description: string; rows: PricingRow[] };
  plans: Plan[];
  addOns?: Array<{ name: string; description: string; price: string }>;
  importantNotes: string[];
}

const SEARCH_COPY = {
  en: { pickupDate: "Pickup Date", returnDate: "Return Date", pickupLocation: "Pickup Location", returnLocation: "Return Location", pickupTime: "Pickup Time", returnTime: "Return Time", pickDate: "Pick a date", selectLocation: "Select location", adults: "Adults", children: "Children", babies: "Babies", largeLuggage: "Large luggage", smallLuggage: "Small luggage", optionalFilters: "Optional filters", vehicleClass: "Vehicle class", anyClass: "Any class", searchVehicles: "Search Vehicles", minDailyPrice: "Minimum daily price", maxDailyPrice: "Maximum daily price", priceRangeTo: "to", perDay: "/day", compact: "Compact", suv: "SUV", minivan: "Minivan", fourWheelDrive: "4WD", winterTires: "Winter tires", childSeat: "Child seat", airportDelivery: "Airport delivery", skiLuggage: "Ski luggage", passengersLuggage: "Passengers & luggage", dailyPrice: "Daily price", timeNote: "Dates and times are Japan Standard Time (Asia/Tokyo). Airport and hotel delivery require operator confirmation.", returnAfterPickup: "Return must be after pickup" },
  ja: { pickupDate: "受取日", returnDate: "返却日", pickupLocation: "受取場所", returnLocation: "返却場所", pickupTime: "受取時間", returnTime: "返却時間", pickDate: "日付を選択", selectLocation: "場所を選択", adults: "大人", children: "子ども", babies: "乳幼児", largeLuggage: "大型荷物", smallLuggage: "小型荷物", optionalFilters: "詳細条件", vehicleClass: "車両クラス", anyClass: "すべてのクラス", searchVehicles: "空車を検索", minDailyPrice: "最低日額料金", maxDailyPrice: "最高日額料金", priceRangeTo: "から", perDay: "/日", compact: "コンパクト", suv: "SUV", minivan: "ミニバン", fourWheelDrive: "4WD", winterTires: "冬用タイヤ", childSeat: "チャイルドシート", airportDelivery: "空港配車", skiLuggage: "スキー用荷物", passengersLuggage: "乗車人数・荷物", dailyPrice: "日額料金", timeNote: "日時は日本標準時（Asia/Tokyo）で指定します。空港・ホテルへの配車は事業者の確認が必要です。", returnAfterPickup: "返却日時は受取日時より後にしてください" },
  "zh-CN": { pickupDate: "取車日期", returnDate: "還車日期", pickupLocation: "取車地點", returnLocation: "還車地點", pickupTime: "取車時間", returnTime: "還車時間", pickDate: "選擇日期", selectLocation: "選擇地點", adults: "成人", children: "兒童", babies: "嬰幼兒", largeLuggage: "大型行李", smallLuggage: "小型行李", optionalFilters: "更多條件", vehicleClass: "車輛類別", anyClass: "所有類別", searchVehicles: "搜尋車輛", minDailyPrice: "最低每日價格", maxDailyPrice: "最高每日價格", priceRangeTo: "至", perDay: "/天", compact: "小型車", suv: "SUV", minivan: "廂型車", fourWheelDrive: "四輪驅動", winterTires: "冬季輪胎", childSeat: "兒童座椅", airportDelivery: "機場送車", skiLuggage: "滑雪行李", passengersLuggage: "乘客與行李", dailyPrice: "每日價格", timeNote: "日期與時間均為日本標準時間（Asia/Tokyo）。機場與飯店送車須由租車業者確認。", returnAfterPickup: "還車時間必須晚於取車時間" },
} as const;

const searchSchema = z.object({
  pickupLocation: z.string({ required_error: "Please select a pickup location" }),
  returnLocation: z.string({ required_error: "Please select a return location" }),
  pickupDate: z.date({ required_error: "Please select a pickup date" }),
  returnDate: z.date({ required_error: "Please select a return date" }),
  pickupTime: z.string().min(1),
  returnTime: z.string().min(1),
  adults: z.coerce.number().min(1),
  children: z.coerce.number().min(0),
  babies: z.coerce.number().min(0),
  luggageLarge: z.coerce.number().min(0),
  luggageSmall: z.coerce.number().min(0),
  vehicleClass: z.string().optional(),
  has4wd: z.boolean().optional(),
  winterTires: z.boolean().optional(),
  childSeat: z.boolean().optional(),
  airportDelivery: z.boolean().optional(),
  skiLuggage: z.boolean().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

export function RentalCarHome() {
  useEffect(() => { captureRentalAttribution(); }, []);
  const { language } = useLanguage();
  const rentalLabels = rentalCopy(language);
  const [, setLocation] = useLocation();
  const { data: vehicles, isLoading } = useGetRentalVehicles();
  const { data: addons } = useGetRentalAddons();
  const { data: configuredLocations } = useRentalLocations();
  const locations = configuredLocations ?? DEFAULT_RENTAL_LOCATIONS;
  const { data: contentData } = useGetPageContent("rentalcar");
  const content = contentData ? localizeContent(contentData.content.en as unknown as RentalCarContent, contentData.content, language) : undefined;
  const rawLanguageContent = contentData?.content?.[language] as { search?: Record<string, string> } | undefined;
  const search = { ...SEARCH_COPY[language] } as Record<string, string>;
  Object.entries(language === "en" ? content?.search ?? {} : rawLanguageContent?.search ?? {}).forEach(([key, value]) => {
    if (typeof value === "string" && value.trim()) search[key] = value;
  });
  useSeoMeta("rentalcar");

  const form = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      pickupLocation: DEFAULT_RENTAL_LOCATIONS[0].value,
      returnLocation: DEFAULT_RENTAL_LOCATIONS[0].value,
      pickupTime: "10:00",
      returnTime: "10:00",
      adults: 2,
      children: 0,
      babies: 0,
      luggageLarge: 0,
      luggageSmall: 0,
      minPrice: 0,
      maxPrice: 100000,
    },
  });

  function onSubmit(data: z.infer<typeof searchSchema>) {
    captureRentalAttribution();
    const pickupAt = tokyoInstant(format(data.pickupDate, "yyyy-MM-dd"), data.pickupTime);
    const returnAt = tokyoInstant(format(data.returnDate, "yyyy-MM-dd"), data.returnTime);
    if (returnAt <= pickupAt) {
      form.setError("returnDate", { message: search.returnAfterPickup });
      return;
    }
    const params = new URLSearchParams({
      pickupLocation: data.pickupLocation,
      returnLocation: data.returnLocation,
      pickupAt,
      returnAt,
      pickupDate: pickupAt,
      returnDate: returnAt,
      pickupTime: data.pickupTime,
      returnTime: data.returnTime,
      adults: String(data.adults),
      children: String(data.children),
      babies: String(data.babies),
      luggageLarge: String(data.luggageLarge),
      luggageSmall: String(data.luggageSmall),
      minPrice: String(data.minPrice ?? 0),
      maxPrice: String(data.maxPrice ?? 100000),
    });
    if (data.vehicleClass && data.vehicleClass !== "any") params.set("vehicleClass", data.vehicleClass);
    (["has4wd", "winterTires", "childSeat", "airportDelivery", "skiLuggage"] as const).forEach((filter) => {
      if (data[filter]) params.set(filter, "true");
    });
    setLocation(`${localizedPath("/rentalcar/cars", language)}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Hero Section */}
      <section className="relative flex min-h-[720px] w-full items-center overflow-hidden sm:min-h-[760px] lg:min-h-[calc(100svh-8rem)]">
        <div className="absolute inset-0">
          <img
            src="/hero-sapporo.png"
            alt={content?.search.roadImageAlt ?? "Sapporo winter road"}
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-foreground/65" />
        </div>
        <div className="relative z-10 w-full py-12 sm:py-16">
          <div className="container space-y-7">
            <div className="mx-auto max-w-4xl space-y-4 text-center">
              <p className="eyebrow text-white/80">{content?.hero.eyebrow ?? "Sapporo · Hokkaido"}</p>
              <h1 className="mx-auto max-w-3xl font-serif text-4xl font-semibold leading-[1.05] text-white sm:text-5xl lg:text-6xl">
                {content?.hero.title ?? "Rent a Car in Sapporo with Ease"}
              </h1>
              <p className="mx-auto max-w-2xl text-sm leading-7 text-white/85 sm:text-base sm:leading-8">
                {content?.hero.subtitle ?? "Premium vehicles, flexible pickup, fully insured options."}
              </p>
            </div>

          <Card className="mx-auto max-w-5xl border border-white/70 bg-background/95 p-4 text-foreground shadow-xl sm:p-5">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-2 items-end gap-3 sm:gap-4 lg:grid-cols-5">
                {/* 1. Pickup Date */}
                <FormField
                  control={form.control}
                  name="pickupDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{search.pickupDate}</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              data-testid="button-pickup-date"
                              className={cn("w-full pl-3 text-left font-normal h-11 md:h-10", !field.value && "text-muted-foreground")}
                            >
                               {field.value ? format(field.value, "MMM d, yyyy") : <span>{search.pickDate}</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                             disabled={(date) => format(date, "yyyy-MM-dd") < tokyoParts(new Date().toISOString()).date}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 2. Pickup Location */}
                <FormField
                  control={form.control}
                  name="pickupLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{search.pickupLocation}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-pickup-location" className="h-11 md:h-10">
                             <SelectValue placeholder={search.selectLocation} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locations.map(loc => (
                            <SelectItem key={loc.value} value={loc.value}>{rentalLocationLabel(loc.value, locations, language)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 3. Return Date */}
                <FormField
                  control={form.control}
                  name="returnDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>{search.returnDate}</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              data-testid="button-return-date"
                              className={cn("w-full pl-3 text-left font-normal h-11 md:h-10", !field.value && "text-muted-foreground")}
                            >
                               {field.value ? format(field.value, "MMM d, yyyy") : <span>{search.pickDate}</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                             disabled={(date) => format(date, "yyyy-MM-dd") < format(form.watch("pickupDate") || new Date(`${tokyoParts(new Date().toISOString()).date}T12:00:00`), "yyyy-MM-dd")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* 4. Return Location */}
                <FormField
                  control={form.control}
                  name="returnLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{search.returnLocation}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-return-location" className="h-11 md:h-10">
                             <SelectValue placeholder={search.selectLocation} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locations.map(loc => (
                            <SelectItem key={loc.value} value={loc.value}>{rentalLocationLabel(loc.value, locations, language)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pickupTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{search.pickupTime}</FormLabel>
                      <FormControl><Input type="time" className="h-11 md:h-10" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="returnTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{search.returnTime}</FormLabel>
                      <FormControl><Input type="time" className="h-11 md:h-10" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <details className="col-span-2 border-t pt-3 lg:col-span-5">
                  <summary className="cursor-pointer text-xs font-semibold text-foreground">
                    {search.passengersLuggage}
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                  {([
                     ["adults", search.adults, 1],
                     ["children", search.children, 0],
                     ["babies", search.babies, 0],
                     ["luggageLarge", search.largeLuggage, 0],
                     ["luggageSmall", search.smallLuggage, 0],
                  ] as const).map(([name, label, min]) => (
                    <FormField key={name} control={form.control} name={name} render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{label}</FormLabel>
                        <FormControl>
                          <Input className="h-11 md:h-10" type="number" min={min} step={1} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} />
                        </FormControl>
                      </FormItem>
                    )} />
                  ))}
                  </div>
                </details>
                <details className="col-span-2 border-t pt-3 lg:col-span-5">
                  <summary className="cursor-pointer text-xs font-semibold text-foreground">
                    {search.optionalFilters}
                  </summary>
                  <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                     <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{search.dailyPrice}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span>¥</span>
                      <FormField control={form.control} name="minPrice" render={({ field }) => <FormItem><FormControl><Input aria-label={search.minDailyPrice} className="w-24 h-11 md:h-9" type="number" min={0} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl></FormItem>} />
                       <span>{search.priceRangeTo}</span>
                      <FormField control={form.control} name="maxPrice" render={({ field }) => <FormItem><FormControl><Input aria-label={search.maxDailyPrice} className="w-24 h-11 md:h-9" type="number" min={0} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} /></FormControl></FormItem>} />
                       <span>{search.perDay}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <FormField control={form.control} name="vehicleClass" render={({ field }) => (
                      <FormItem>
                         <FormLabel className="text-xs">{search.vehicleClass}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                           <FormControl><SelectTrigger className="h-11 md:h-9"><SelectValue placeholder={search.anyClass} /></SelectTrigger></FormControl>
                          <SelectContent>
                             <SelectItem value="any">{search.anyClass}</SelectItem>
                            <SelectItem value="compact">{search.compact}</SelectItem>
                             <SelectItem value="suv">{search.suv}</SelectItem>
                             <SelectItem value="minivan">{search.minivan}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    {([
                       ["has4wd", search.fourWheelDrive],
                       ["winterTires", search.winterTires],
                       ["childSeat", search.childSeat],
                       ["airportDelivery", search.airportDelivery],
                       ["skiLuggage", search.skiLuggage],
                    ] as const).map(([name, label]) => (
                      <FormField key={name} control={form.control} name={name} render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-2 space-y-0 pt-6">
                          <FormControl><Checkbox checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl>
                          <FormLabel className="text-xs font-normal">{label}</FormLabel>
                        </FormItem>
                      )} />
                    ))}
                  </div>
                  </div>
                </details>
                 <p className="col-span-2 text-xs text-muted-foreground lg:col-span-5">{search.timeNote}</p>
                 <Button type="submit" data-testid="button-search" className="col-span-2 w-full lg:col-span-5" size="lg">{search.searchVehicles}</Button>
              </form>
            </Form>
          </Card>
          </div>
        </div>
      </section>

      {/* Featured Cars Section */}
      <section className="py-24">
        <div className="container space-y-12">
          <div className="flex items-end justify-between border-b pb-6">
            <div className="space-y-1">
               <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground">{content?.sections.fleetEyebrow ?? "Our Fleet"}</p>
               <h2 className="text-3xl font-serif font-bold tracking-tight">{content?.sections.featuredVehicles ?? "Featured Vehicles"}</h2>
            </div>
            <Link href={localizedPath("/rentalcar/cars", language)}>
              <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-1 text-muted-foreground hover:text-foreground">
                 {content?.sections.viewAll ?? "View all"} <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[360px] bg-muted animate-pulse"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {vehicles?.filter((vehicle) => vehicle.featured).slice(0, 3).map((vehicle) => (
                <Link key={vehicle.id} href={localizedPath(`/rentalcar/cars/${vehicle.slug}`, language)} className="group block">
                  <div className="overflow-hidden bg-muted aspect-[4/3]">
                    <img
                      src={vehicle.images?.[0]?.url ?? "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"}
                      alt={`${vehicle.brand} ${vehicle.model}`}
                      className="object-cover w-full h-full group-hover:scale-103 transition-transform duration-700"
                    />
                  </div>
                  <div className="pt-4 pb-2 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-xl font-semibold group-hover:text-muted-foreground transition-colors">{vehicle.publicTitle || vehicle.model}</h3>
                       <span className="text-sm font-medium tabular-nums">¥{(vehicle.basePrice ?? 0).toLocaleString()}<span className="text-muted-foreground text-xs">{content?.sections.perDay ?? "/day"}</span></span>
                    </div>
                     <p className="text-xs text-muted-foreground">{vehicle.seats} {content?.sections.passengers ?? "Passengers"}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Pricing, Plans, Add-ons */}
      {content && (
        <section className="py-24 border-b">
          <div className="container space-y-16">
            <div className="space-y-4 max-w-2xl">
               <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground">{content.sections.pricingEyebrow}</p>
              <h2 className="text-3xl font-serif font-bold tracking-tight">{content.pricingTable.title}</h2>
              <p className="text-muted-foreground leading-relaxed">{content.pricingTable.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {content.pricingTable.rows.map((row) => (
                <div key={row.label} className="border p-6 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</p>
                  <p className="text-xl font-serif font-semibold">{row.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-6">
               <h3 className="text-2xl font-serif font-bold tracking-tight">{content.sections.insurancePlans}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {content.plans.map((plan) => (
                  <div key={plan.name} className="border p-6 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-semibold">{plan.name}</h4>
                      <span className="text-sm font-medium tabular-nums">{plan.price}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{plan.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
               <h3 className="text-2xl font-serif font-bold tracking-tight">{content.sections.addOns}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {addons?.map((addOn) => {
                  const price = addOn.pricingType === "per_day" ? addOn.perDayFee : addOn.flatFee;
                  const localizedAddOn = localizeAddon(addOn, language);
                  return (
                  <div key={addOn.id} className="border p-6 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-semibold text-sm">{localizedAddOn.name}</h4>
                      <span className="text-sm font-medium tabular-nums">¥{price.toLocaleString()}{addOn.pricingType === "per_day" ? rentalLabels.perDay : rentalLabels.perBooking}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{localizedAddOn.description}</p>
                  </div>
                  );
                })}
              </div>
            </div>

            {content.importantNotes.length > 0 && (
              <div className="bg-muted/40 border p-6 space-y-3">
                 <h3 className="text-sm font-semibold uppercase tracking-wide">{content.sections.importantNotes}</h3>
                <ul className="space-y-2 list-disc list-inside text-sm text-muted-foreground">
                  {content.importantNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Why Book With CIAO */}
      <section className="py-20 bg-muted/40">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x border">
            {[
               { icon: <Shield className="h-5 w-5" />, title: content?.search.fullyInsured ?? "Fully Insured", desc: content?.search.fullyInsuredDescription ?? "Comprehensive coverage included in every booking." },
               { icon: <MapPin className="h-5 w-5" />, title: content?.search.multipleLocations ?? "Multiple Locations", desc: content?.search.multipleLocationsDescription ?? "Pickup and drop-off across Sapporo and the airport." },
               { icon: <CarIcon className="h-5 w-5" />, title: content?.search.airportService ?? "Airport Service", desc: content?.search.airportServiceDescription ?? "Seamless New Chitose Airport connections." },
               { icon: <CreditCard className="h-5 w-5" />, title: content?.search.easyPayment ?? "Easy Payment", desc: content?.search.easyPaymentDescription ?? "Transparent pricing, no hidden fees." },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex flex-col gap-3 p-8">
                <div className="text-muted-foreground">{icon}</div>
                <h3 className="font-semibold text-sm tracking-wide">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
