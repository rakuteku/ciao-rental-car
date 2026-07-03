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

export function RentalCarHome() {
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
    setLocation(`/rentalcar/cars?${params.toString()}`);
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Hero Section */}
      <section className="relative w-full min-h-[92vh] flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/hero-sapporo.png"
            alt="Sapporo winter road"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
        </div>
        <div className="relative z-10 w-full pb-16 pt-32">
          <div className="container space-y-10">
            <div className="max-w-2xl space-y-4">
              <p className="text-xs tracking-[0.3em] uppercase text-white/60 font-medium">Sapporo · Hokkaido</p>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-white leading-[1.05]">
                Rent a Car in<br />Sapporo with Ease
              </h1>
              <p className="text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
                Premium vehicles, flexible pickup, fully insured options.
              </p>
            </div>

          <Card className="max-w-5xl p-5 bg-white/98 text-foreground border border-white/20 shadow-2xl rounded-sm">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                {/* 1. Pickup Date */}
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
                              data-testid="button-pickup-date"
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "MMM d, yyyy") : <span>Pick a date</span>}
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
                {/* 2. Pickup Location */}
                <FormField
                  control={form.control}
                  name="pickupLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pickup Location</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-pickup-location">
                            <SelectValue placeholder="Select location" />
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
                {/* 3. Return Date */}
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
                              data-testid="button-return-date"
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "MMM d, yyyy") : <span>Pick a date</span>}
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
                {/* 4. Return Location */}
                <FormField
                  control={form.control}
                  name="returnLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Return Location</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-return-location">
                            <SelectValue placeholder="Select location" />
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
                {/* 5. Search Button */}
                <Button type="submit" data-testid="button-search" className="w-full sm:col-span-2 lg:col-span-1" size="lg">Search Vehicles</Button>
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
              <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground">Our Fleet</p>
              <h2 className="text-3xl font-serif font-bold tracking-tight">Featured Vehicles</h2>
            </div>
            <Link href="/rentalcar/cars">
              <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-1 text-muted-foreground hover:text-foreground">
                View all <ChevronRight className="h-4 w-4" />
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
              {cars?.slice(0, 3).map((car) => (
                <Link key={car.id} href={`/rentalcar/cars/${car.id}`} className="group block">
                  <div className="overflow-hidden bg-muted aspect-[4/3]">
                    <img
                      src={car.imageUrl}
                      alt={car.name}
                      className="object-cover w-full h-full group-hover:scale-103 transition-transform duration-700"
                    />
                  </div>
                  <div className="pt-4 pb-2 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-xl font-semibold group-hover:text-muted-foreground transition-colors">{car.name}</h3>
                      <span className="text-sm font-medium tabular-nums">¥{car.pricePerDay.toLocaleString()}<span className="text-muted-foreground text-xs">/day</span></span>
                    </div>
                    <p className="text-xs text-muted-foreground">{car.passengerCapacity} Passengers</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why Book With CIAO */}
      <section className="py-20 bg-muted/40">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x border">
            {[
              { icon: <Shield className="h-5 w-5" />, title: "Fully Insured", desc: "Comprehensive coverage included in every booking." },
              { icon: <MapPin className="h-5 w-5" />, title: "Multiple Locations", desc: "Pickup and drop-off across Sapporo and the airport." },
              { icon: <CarIcon className="h-5 w-5" />, title: "Airport Service", desc: "Seamless New Chitose Airport connections." },
              { icon: <CreditCard className="h-5 w-5" />, title: "Easy Payment", desc: "Transparent pricing, no hidden fees." },
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
