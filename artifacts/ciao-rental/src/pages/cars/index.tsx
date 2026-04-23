import { Link } from "wouter";
import { Car as CarIcon } from "lucide-react";
import { useGetCars } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function CarsPage() {
  const { data: cars, isLoading } = useGetCars();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="bg-muted py-12">
        <div className="container">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Our Fleet</h1>
          <p className="text-muted-foreground mt-4 max-w-2xl">
            Choose from our selection of premium vehicles designed for comfort and reliability during your Hokkaido journey.
          </p>
        </div>
      </div>

      <div className="container py-12 flex-1">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="overflow-hidden border-none shadow-sm">
                <Skeleton className="h-[250px] w-full" />
                <CardHeader><Skeleton className="h-6 w-2/3" /></CardHeader>
                <CardContent><Skeleton className="h-4 w-full" /></CardContent>
                <CardFooter><Skeleton className="h-10 w-full" /></CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {cars?.map((car) => (
              <Card key={car.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="aspect-[16/9] overflow-hidden relative bg-muted">
                  <img 
                    src={car.imageUrl} 
                    alt={car.name} 
                    className="object-cover w-full h-full" 
                  />
                </div>
                <CardHeader>
                  <CardTitle className="font-serif text-2xl">{car.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="flex flex-col gap-4 text-sm">
                    <p className="text-muted-foreground line-clamp-2">{car.description}</p>
                    <div className="flex justify-between items-center py-2 border-y">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CarIcon className="h-4 w-4" /> 
                        <span>{car.passengerCapacity} Passengers</span>
                      </div>
                      <div className="font-mono text-lg font-medium">
                        ¥{car.pricePerDay.toLocaleString()}<span className="text-sm text-muted-foreground">/day</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Link href={`/cars/${car.id}`} className="w-full">
                    <Button className="w-full" disabled={!car.isAvailable}>
                      {car.isAvailable ? "Book Now" : "Currently Unavailable"}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}