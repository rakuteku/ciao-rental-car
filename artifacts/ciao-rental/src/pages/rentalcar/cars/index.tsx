import { useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Car as CarIcon, Fuel, SlidersHorizontal, ArrowRight } from "lucide-react";
import { useSearchRentalVehicles, useCalculateRentalPrice, type RentalVehicle } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useInlineSeoMeta } from "@/hooks/use-seo-meta";
import { localizedPath, useLanguage } from "@/lib/language";
import { localizeVehicle, rentalCopy } from "@/lib/rental-localization";
import { captureRentalAttribution } from "@/lib/rental-marketplace";
import { useRentalTrip, useStickySummaryVisible } from "@/components/rental/RentalNavigation";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";
import { formatRentalTime } from "@/lib/rental-time";

function EstimatedPrice({ vehicle, pickupAt, returnAt, pickupLocation, returnLocation }: {
  vehicle: RentalVehicle;
  pickupAt?: string;
  returnAt?: string;
  pickupLocation?: string;
  returnLocation?: string;
}) {
  const { language } = useLanguage();
  const copy = rentalCopy(language);
  const quote = useCalculateRentalPrice();
  useEffect(() => {
    if (pickupAt && returnAt) {
      quote.mutate({ data: { vehicleId: vehicle.id, pickupAt, returnAt, pickupLocation, returnLocation } });
    }
  }, [vehicle.id, pickupAt, returnAt, pickupLocation, returnLocation]);

  if (!pickupAt || !returnAt) return <span className="text-sm">{copy.selectDates}</span>;
  if (quote.isError) return <span className="text-xs text-[#a84736]">{language === "ja" ? "料金を取得できません" : "Quote unavailable"}</span>;
  if (!quote.data) return <span className="text-sm">{copy.calculating}</span>;
  return <span className="text-sm font-semibold">¥{quote.data.finalTotal.toLocaleString()} <span className="font-normal text-muted-foreground">{copy.estimatedTotal}</span></span>;
}

export function CarsPage() {
  useEffect(() => { captureRentalAttribution(); }, []);
  const { language } = useLanguage();
  const copy = rentalCopy(language);
  useInlineSeoMeta({
    metaTitle: language === "ja" ? "札幌のレンタカー一覧｜CIAO北海道" : language === "zh-TW" ? "札幌租車車輛｜CIAO北海道" : "Rental Cars in Sapporo | CIAO Hokkaido Car Rental",
    metaDescription: language === "ja" ? "札幌で利用できるCIAOのレンタカーを比較し、北海道旅行に合う車両をお選びください。" : language === "zh-TW" ? "比較 CIAO 在札幌提供的租車車輛，選擇適合北海道旅程的車款。" : "Compare CIAO's available rental vehicles in Sapporo and choose the right car for your Hokkaido journey.",
    ogTitle: language === "ja" ? "札幌のレンタカー一覧｜CIAO" : language === "zh-TW" ? "札幌租車車輛｜CIAO" : "Rental Cars in Sapporo | CIAO",
    ogDescription: language === "ja" ? "北海道旅行に利用できるCIAOの車両をご覧ください。" : language === "zh-TW" ? "查看適合北海道旅程的 CIAO 租車。" : "Compare available CIAO rental cars for your Hokkaido trip.",
    ogImage: "",
  });
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const pickupLocation = searchParams.get("pickupLocation") || undefined;
  const returnLocation = searchParams.get("returnLocation") || undefined;
  const pickupAt = searchParams.get("pickupAt") || searchParams.get("pickupDate") || undefined;
  const returnAt = searchParams.get("returnAt") || searchParams.get("returnDate") || undefined;
  const numberParam = (name: string) => {
    const value = searchParams.get(name);
    return value ? Number(value) : undefined;
  };

  const { data: searchResults, isLoading, isError, refetch } = useSearchRentalVehicles({
    pickupLocation,
    returnLocation,
    pickupAt,
    returnAt,
    adults: numberParam("adults"),
    children: numberParam("children"),
    babies: numberParam("babies"),
    luggageLarge: numberParam("luggageLarge"),
    luggageSmall: numberParam("luggageSmall"),
    vehicleClass: searchParams.get("vehicleClass") || undefined,
    has4wd: searchParams.get("has4wd") === "true" || undefined,
    winterTires: searchParams.get("winterTires") === "true" || undefined,
    skiLuggage: searchParams.get("skiLuggage") === "true" || undefined,
    childSeat: searchParams.get("childSeat") === "true" || undefined,
    airportDelivery: searchParams.get("airportDelivery") === "true" || undefined,
  });

  const minPrice = numberParam("minPrice") ?? 0;
  const maxPrice = numberParam("maxPrice") ?? Number.POSITIVE_INFINITY;
  const cars = (searchResults?.available || []).filter((car) => {
    const dailyRate = car.basePrice ?? 0;
    return dailyRate >= minPrice && dailyRate <= maxPrice;
  });
  const unavailableCars = searchResults?.unavailable || [];
  const { trip } = useRentalTrip();
  const stickySummaryVisible = useStickySummaryVisible();
  const { data: configuredLocations } = useRentalLocations();
  const locations = configuredLocations ?? DEFAULT_RENTAL_LOCATIONS;
  const pickupLabel = language === "ja" ? "受取" : language === "zh-TW" ? "取車" : "Pickup";
  const returnLabel = language === "ja" ? "返却" : language === "zh-TW" ? "還車" : "Return";
  const tripDate = (value?: string) => value ? new Intl.DateTimeFormat(language, { month: "short", day: "numeric", timeZone: "Asia/Tokyo" }).format(new Date(`${value}T12:00:00+09:00`)) : copy.selectDates;

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {stickySummaryVisible && <div data-testid="cars-sticky-search" className="fixed inset-x-0 top-[4.5rem] z-40 h-14 border-b bg-background/95 shadow-sm backdrop-blur md:h-14">
        <div className="container flex h-full items-center gap-3 md:gap-6">
          <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 md:max-w-3xl">
            <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{pickupLabel}</p><p className="truncate text-xs font-semibold md:text-sm">{tripDate(trip.pickupDate)}{trip.pickupTime ? ` · ${formatRentalTime(trip.pickupTime)}` : ""}</p>{pickupLocation && <p className="hidden truncate text-xs text-muted-foreground md:block">{rentalLocationLabel(pickupLocation, locations, language)}</p>}</div>
            <ArrowRight className="size-4 text-primary" aria-hidden="true" />
            <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{returnLabel}</p><p className="truncate text-xs font-semibold md:text-sm">{tripDate(trip.returnDate)}{trip.returnTime ? ` · ${formatRentalTime(trip.returnTime)}` : ""}</p>{returnLocation && <p className="hidden truncate text-xs text-muted-foreground md:block">{rentalLocationLabel(returnLocation, locations, language)}</p>}</div>
          </div>
          <Link href={`${localizedPath("/rentalcar", language)}${searchString ? `?${searchString}` : ""}`} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold md:text-sm" aria-label={copy.editSearch} title={copy.editSearch}><SlidersHorizontal className="size-4" /><span className="hidden sm:inline">{copy.editSearch}</span></Link>
        </div>
      </div>}
      <div data-sticky-summary-trigger className="border-b py-12 bg-white">
        <div className="container">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">{copy.fleet}</p>
          <h1 className="text-4xl font-serif font-bold tracking-tight">{copy.vehicles}</h1>
          <p className="text-muted-foreground mt-3 text-sm max-w-xl">
            {copy.vehiclesIntro}
          </p>
        </div>
      </div>

      <div className="container py-16 flex-1">
        {isError ? <div role="alert" className="mx-auto max-w-xl border bg-[#fff8f0] p-8 text-center">
          <h2 className="font-serif text-2xl">{language === "ja" ? "車両を検索できませんでした" : "Search could not be completed"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{language === "ja" ? "通信状況を確認して再試行してください。" : "Check your connection and try again."}</p>
          <Button className="mt-5" onClick={() => refetch()}>{language === "ja" ? "再試行" : "Try again"}</Button>
        </div> : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/3] w-full" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-16">
            {cars.length === 0 && unavailableCars.length === 0 && (
              <div className="text-center py-20 bg-muted/30 rounded-xl">
                <h3 className="text-lg font-medium mb-2">{copy.noVehicles}</h3>
                <p className="text-muted-foreground">{copy.adjustSearch}</p>
                <Link href={localizedPath("/rentalcar", language)}>
                  <Button className="mt-6">{copy.backToSearch}</Button>
                </Link>
              </div>
            )}

            {cars.length > 0 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-serif font-bold">{copy.available}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {cars.map((car) => (
                  <Link key={car.id} href={`${localizedPath(`/rentalcar/cars/${car.slug || car.id}`, language)}?${searchString}`} className="group block">
                    <div className="overflow-hidden bg-muted aspect-[4/3] relative">
                      <img
                        src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"}
                        alt={`${car.brand} ${car.model}`}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                      />
                      {car.basePrice && (
                        <div className="absolute top-4 right-4 bg-background/95 backdrop-blur px-3 py-1.5 rounded text-sm font-semibold shadow-sm">
                          ¥{car.basePrice.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">{copy.perDay}</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 pb-2 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{car.brand} · {car.year}</p>
                          <h2 className="font-serif text-xl font-semibold group-hover:text-muted-foreground transition-colors">{localizeVehicle(car, language).title || car.model}</h2>
                          {typeof (car as typeof car & { operatorName?: string }).operatorName === "string" && <p className="text-xs text-muted-foreground">{language === "ja" ? "運営事業者" : "Operated by"}: {(car as typeof car & { operatorName?: string }).operatorName}</p>}
                        </div>
                        <EstimatedPrice vehicle={car} pickupAt={pickupAt} returnAt={returnAt} pickupLocation={pickupLocation} returnLocation={returnLocation} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CarIcon className="h-3.5 w-3.5" /> {car.seats} {copy.passengers}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Fuel className="h-3.5 w-3.5" /> {car.fuelType}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{localizeVehicle(car, language).description}</p>
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs tracking-wide group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                        >
                          {copy.selectVehicle}
                        </Button>
                      </div>
                    </div>
                  </Link>
                  ))}
                </div>
              </div>
            )}

            {unavailableCars.length > 0 && (
              <div className="space-y-6 pt-10 border-t">
                <h2 className="text-2xl font-serif font-bold text-muted-foreground">{copy.unavailable}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 opacity-60 grayscale-[0.5]">
                  {unavailableCars.map((car) => (
                    <div key={car.id} className="block">
                      <div className="overflow-hidden bg-muted aspect-[4/3] relative">
                        <img
                          src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"}
                          alt={`${car.brand} ${car.model}`}
                          className="object-cover w-full h-full"
                        />
                        <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px] flex items-center justify-center">
                          <span className="bg-background px-4 py-2 rounded font-medium text-sm shadow-sm">Unavailable</span>
                        </div>
                      </div>
                      <div className="pt-4 pb-2 space-y-2">
                        <div>
                          <p className="text-xs text-muted-foreground">{car.brand} · {car.year}</p>
                          <h2 className="font-serif text-xl font-semibold">{car.publicTitle || car.model}</h2>
                          {typeof (car as typeof car & { operatorName?: string }).operatorName === "string" && <p className="text-xs text-muted-foreground">{language === "ja" ? "運営事業者" : "Operated by"}: {(car as typeof car & { operatorName?: string }).operatorName}</p>}
                        </div>
                        <Button variant="outline" size="sm" className="w-full text-xs tracking-wide" disabled>
                          Currently Unavailable
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
