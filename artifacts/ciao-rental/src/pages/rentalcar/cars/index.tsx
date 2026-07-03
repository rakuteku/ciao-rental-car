import { Link } from "wouter";
import { Car as CarIcon, Fuel } from "lucide-react";
import { useGetCars } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function CarsPage() {
  const { data: cars, isLoading } = useGetCars();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="border-b py-12 bg-white">
        <div className="container">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">Fleet</p>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Our Vehicles</h1>
          <p className="text-muted-foreground mt-3 text-sm max-w-xl">
            Premium vehicles, meticulously maintained for your Hokkaido journey.
          </p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {cars?.map((car) => (
              <Link key={car.id} href={`/rentalcar/cars/${car.id}`} className="group block">
                <div className="overflow-hidden bg-muted aspect-[4/3]">
                  <img
                    src={car.imageUrls?.[0] || car.imageUrl}
                    alt={`${car.model} ${car.name}`}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                  />
                </div>
                <div className="pt-4 pb-2 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{car.model} · {car.year}</p>
                      <h2 className="font-serif text-xl font-semibold group-hover:text-muted-foreground transition-colors">{car.name}</h2>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      ¥{car.pricePerDay.toLocaleString()}<span className="text-muted-foreground text-xs">/day</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <CarIcon className="h-3.5 w-3.5" /> {car.passengerCapacity} pax
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Fuel className="h-3.5 w-3.5" /> {car.fuelEfficiency} km/L
                    </p>
                    {!car.isAvailable && (
                      <span className="text-xs text-muted-foreground border px-2 py-0.5 ml-auto">Unavailable</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{car.description}</p>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs tracking-wide"
                      disabled={!car.isAvailable}
                    >
                      {car.isAvailable ? "Reserve Now" : "Currently Unavailable"}
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
