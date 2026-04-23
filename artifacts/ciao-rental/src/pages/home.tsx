import { Link, useLocation } from "wouter";
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
import { LOCATIONS } from "@/lib/constants";
import { useGetCars } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  pickupLocation: z.string({ required_error: "Please select a pickup location" }),
  returnLocation: z.string({ required_error: "Please select a return location" }),
  pickupDate: z.date({ required_error: "Please select a pickup date" }),
  returnDate: z.date({ required_error: "Please select a return date" }),
});

export function Home() {
  const [, setLocation] = useLocation();
  const { data: cars, isLoading } = useGetCars();

  const form = useForm<z.infer<typeof searchSchema>>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      pickupLocation: LOCATIONS[0],
      returnLocation: LOCATIONS[0],
    },
  });

  function onSubmit(data: z.infer<typeof searchSchema>) {
    const params = new URLSearchParams({
      pickupLocation: data.pickupLocation,
      returnLocation: data.returnLocation,
      pickupDate: data.pickupDate.toISOString(),
      returnDate: data.returnDate.toISOString(),
    });
    setLocation(`/cars?${params.toString()}`);
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Hero Section */}
      <section className="relative w-full py-24 md:py-32 lg:py-48 overflow-hidden bg-black text-white">
        <div className="absolute inset-0 bg-[url('/images/alphard.png')] bg-cover bg-center bg-no-repeat opacity-40 mix-blend-overlay"></div>
        <div className="container relative z-10 space-y-8">
          <div className="max-w-3xl space-y-4">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight">
              Rent a Car in Sapporo with Ease
            </h1>
            <p className="text-lg md:text-xl text-gray-200 max-w-2xl">
              Premium vehicles, flexible pickup, fully insured options. Experience Hokkaido with confidence.
            </p>
          </div>

          <Card className="max-w-4xl p-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 text-foreground border-none shadow-xl">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <FormField
                  control={form.control}
                  name="pickupLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pickup</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOCATIONS.map(loc => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="pickupDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Pickup Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="returnDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Return Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant={"outline"}
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < (form.watch("pickupDate") || new Date(new Date().setHours(0, 0, 0, 0)))}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" size="lg">Search Vehicles</Button>
              </form>
            </Form>
          </Card>
        </div>
      </section>

      {/* Featured Cars Section */}
      <section className="py-24 bg-muted/30">
        <div className="container space-y-12">
          <div className="flex items-end justify-between">
            <div className="space-y-2">
              <h2 className="text-3xl font-serif font-bold tracking-tight">Featured Fleet</h2>
              <p className="text-muted-foreground">Select from our premium range of meticulously maintained vehicles.</p>
            </div>
            <Link href="/cars">
              <Button variant="ghost" className="hidden sm:flex group">
                View all <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[400px] bg-muted animate-pulse rounded-lg"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {cars?.slice(0, 3).map((car) => (
                <Card key={car.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-shadow group">
                  <div className="aspect-[16/9] overflow-hidden relative bg-muted">
                    <img 
                      src={car.imageUrl} 
                      alt={car.name} 
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500" 
                    />
                  </div>
                  <CardHeader>
                    <CardTitle className="font-serif text-xl">{car.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center text-sm text-muted-foreground">
                      <div className="flex items-center gap-1"><CarIcon className="h-4 w-4" /> {car.passengerCapacity} Seats</div>
                      <div className="font-mono text-foreground font-medium">¥{car.pricePerDay.toLocaleString()}/day</div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Link href={`/cars/${car.id}`} className="w-full">
                      <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        View Details
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why Book With CIAO */}
      <section className="py-24">
        <div className="container space-y-16">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <h2 className="text-3xl font-serif font-bold tracking-tight">Why Book With CIAO?</h2>
            <p className="text-muted-foreground">Experience the highest standard of car rental service in Hokkaido.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="flex flex-col items-center text-center space-y-4 p-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="font-bold">Fully Insured</h3>
              <p className="text-sm text-muted-foreground">Comprehensive coverage included in every booking for your peace of mind.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4 p-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="font-bold">Convenient Locations</h3>
              <p className="text-sm text-muted-foreground">Pick up and drop off at multiple strategic locations across Sapporo.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4 p-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <CarIcon className="h-6 w-6" />
              </div>
              <h3 className="font-bold">Airport Service</h3>
              <p className="text-sm text-muted-foreground">Seamless New Chitose Airport pickup and drop-off available.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4 p-6">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <CreditCard className="h-6 w-6" />
              </div>
              <h3 className="font-bold">Easy Payment</h3>
              <p className="text-sm text-muted-foreground">Simple, transparent booking process with no hidden fees.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}