import { useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Car as CarIcon, Fuel } from "lucide-react";
import { useSearchRentalVehicles, useCalculateRentalPrice, type RentalVehicle } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function EstimatedPrice({ vehicle, pickupAt, returnAt, pickupLocation, returnLocation }: {
  vehicle: RentalVehicle;
  pickupAt?: string;
  returnAt?: string;
  pickupLocation?: string;
  returnLocation?: string;
}) {
  const quote = useCalculateRentalPrice();
  useEffect(() => {
    if (pickupAt && returnAt) {
      quote.mutate({ data: { vehicleId: vehicle.id, pickupAt, returnAt, pickupLocation, returnLocation } });
    }
  }, [vehicle.id, pickupAt, returnAt, pickupLocation, returnLocation]);

  if (!pickupAt || !returnAt) return <span className="text-sm">Select dates for a total</span>;
  if (!quote.data) return <span className="text-sm">Calculating total…</span>;
  return <span className="text-sm font-semibold">¥{quote.data.finalTotal.toLocaleString()} <span className="font-normal text-muted-foreground">estimated total</span></span>;
}

export function CarsPage() {
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

  const { data: searchResults, isLoading } = useSearchRentalVehicles({
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

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="border-b py-12 bg-white">
        <div className="container">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">Fleet</p>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Our Vehicles</h1>
          <p className="text-muted-foreground mt-3 text-sm max-w-xl">
            Premium vehicles, meticulously maintained for your Hokkaido journey.
          </p>
          {(pickupAt && returnAt) && (
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-medium text-muted-foreground bg-muted/40 p-4 rounded-lg inline-flex">
              <span>{pickupLocation} → {returnLocation}</span>
              <span>•</span>
              <span>{new Date(pickupAt).toLocaleDateString()} — {new Date(returnAt).toLocaleDateString()}</span>
              <Link href="/rentalcar" className="text-primary hover:underline ml-2">Edit Search</Link>
            </div>
          )}
        </div>
      </div>

      <div className="container py-16 flex-1">
        {isLoading ? (
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
                <h3 className="text-lg font-medium mb-2">No vehicles found</h3>
                <p className="text-muted-foreground">Try adjusting your search criteria or dates.</p>
                <Link href="/rentalcar">
                  <Button className="mt-6">Back to Search</Button>
                </Link>
              </div>
            )}

            {cars.length > 0 && (
              <div className="space-y-5">
                <h2 className="text-2xl font-serif font-bold">Available Vehicles</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {cars.map((car) => (
                  <Link key={car.id} href={`/rentalcar/cars/${car.slug || car.id}?${searchString}`} className="group block">
                    <div className="overflow-hidden bg-muted aspect-[4/3] relative">
                      <img
                        src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"}
                        alt={`${car.brand} ${car.model}`}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                      />
                      {car.basePrice && (
                        <div className="absolute top-4 right-4 bg-background/95 backdrop-blur px-3 py-1.5 rounded text-sm font-semibold shadow-sm">
                          ¥{car.basePrice.toLocaleString()}<span className="text-xs font-normal text-muted-foreground">/day</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 pb-2 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{car.brand} · {car.year}</p>
                          <h2 className="font-serif text-xl font-semibold group-hover:text-muted-foreground transition-colors">{car.publicTitle || car.model}</h2>
                        </div>
                        <EstimatedPrice vehicle={car} pickupAt={pickupAt} returnAt={returnAt} pickupLocation={pickupLocation} returnLocation={returnLocation} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CarIcon className="h-3.5 w-3.5" /> {car.seats} pax
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Fuel className="h-3.5 w-3.5" /> {car.fuelType}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{car.description}</p>
                      <div className="pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs tracking-wide group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                        >
                          Select Vehicle
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
                <h2 className="text-2xl font-serif font-bold text-muted-foreground">Not available for your selected dates</h2>
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
