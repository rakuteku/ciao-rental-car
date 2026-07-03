import { useParams, useLocation } from "wouter";
import { format, differenceInDays, addDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarIcon, Users, CreditCard, Shield, MapPin, CheckCircle2, Fuel } from "lucide-react";

import { useGetCar, useGetCarAvailability, useCreateBooking, getGetCarQueryKey, getGetCarAvailabilityQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LOCATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AIRPORT_LOCATION = "New Chitose Airport";

const bookingSchema = z.object({
  pickupLocation: z.string({ required_error: "Pickup location is required" }),
  returnLocation: z.string({ required_error: "Return location is required" }),
  pickupDate: z.date({ required_error: "Pickup date is required" }),
  returnDate: z.date({ required_error: "Return date is required" }),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
});

export function CarDetailPage() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: car, isLoading } = useGetCar(id, {
    query: { enabled: !!id, queryKey: getGetCarQueryKey(id) }
  });

  const { data: availability } = useGetCarAvailability(id, {
    startDate: new Date().toISOString(),
  }, {
    query: { enabled: !!id, queryKey: getGetCarAvailabilityQueryKey(id) }
  });

  const createBooking = useCreateBooking();

  const form = useForm<z.infer<typeof bookingSchema>>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      pickupLocation: LOCATIONS[0],
      returnLocation: LOCATIONS[0],
      pickupDate: new Date(),
      returnDate: addDays(new Date(), 3),
      name: "",
      email: "",
      phone: "",
    },
  });

  const pickupDate = form.watch("pickupDate");
  const returnDate = form.watch("returnDate");
  const pickupLocation = form.watch("pickupLocation");
  const returnLocation = form.watch("returnLocation");

  const days = pickupDate && returnDate
    ? Math.max(1, differenceInDays(returnDate, pickupDate))
    : 1;

  const airportPickupFee = car && pickupLocation === AIRPORT_LOCATION ? car.airportPickupFee : 0;
  const airportDropoffFee = car && returnLocation === AIRPORT_LOCATION ? car.airportDropoffFee : 0;
  const rentalCost = car ? car.pricePerDay * days : 0;
  const totalPrice = rentalCost + airportPickupFee + airportDropoffFee;

  function onSubmit(data: z.infer<typeof bookingSchema>) {
    if (!car) return;

    createBooking.mutate({
      data: {
        carId: car.id,
        pickupDate: data.pickupDate.toISOString(),
        returnDate: data.returnDate.toISOString(),
        pickupLocation: data.pickupLocation,
        returnLocation: data.returnLocation,
        name: data.name,
        email: data.email,
        phone: data.phone,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Booking successful", description: "Your car has been reserved." });
        setLocation("/rentalcar/booking/success");
      },
      onError: () => {
        toast({ title: "Booking failed", description: "There was an error processing your booking.", variant: "destructive" });
      }
    });
  }

  const isDateUnavailable = (date: Date) => {
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    if (!availability) return false;
    const dateStr = format(date, "yyyy-MM-dd");
    const found = availability.find(a => a.date.startsWith(dateStr));
    if (found && !found.isAvailable) return true;
    return false;
  };

  const displayImage = car?.imageUrls?.[0] || car?.imageUrl || "";

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!car) {
    return <div className="min-h-screen flex items-center justify-center">Car not found</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-muted/20 py-12">
      <div className="container max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          <div className="lg:col-span-2 space-y-8">
            <div className="rounded-xl overflow-hidden bg-background border shadow-sm">
              <div className="aspect-[16/9] relative bg-muted">
                <img
                  src={displayImage}
                  alt={`${car.model} ${car.name}`}
                  className="object-cover w-full h-full"
                />
              </div>
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">{car.model} · {car.year}</p>
                    <h1 className="text-3xl font-serif font-bold mt-1">{car.name}</h1>
                    <div className="flex flex-wrap gap-3 mt-3">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="w-3 h-3" /> {car.passengerCapacity} passengers
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Fuel className="w-3 h-3" /> {car.fuelEfficiency} km/L
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-bold">¥{car.pricePerDay.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">per day</div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {car.description || "A premium vehicle perfectly suited for exploring the scenic routes of Hokkaido. Features advanced safety systems, comfortable seating, and excellent handling in all weather conditions."}
                  </p>
                </div>

                <Separator />

                <div>
                  <h3 className="font-bold text-lg mb-4">Airport Service Fees</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Airport Pickup</p>
                      {car.airportPickupFee > 0
                        ? <p className="font-bold text-lg">¥{car.airportPickupFee.toLocaleString()}</p>
                        : <p className="font-bold text-lg text-green-600">Free</p>
                      }
                      <p className="text-xs text-muted-foreground mt-1">New Chitose Airport pickup</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Airport Drop-off</p>
                      {car.airportDropoffFee > 0
                        ? <p className="font-bold text-lg">¥{car.airportDropoffFee.toLocaleString()}</p>
                        : <p className="font-bold text-lg text-green-600">Free</p>
                      }
                      <p className="text-xs text-muted-foreground mt-1">New Chitose Airport drop-off</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex gap-3 items-start">
                    <Shield className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium">Fully Insured</div>
                      <div className="text-sm text-muted-foreground">Comprehensive coverage included</div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium">Free Cancellation</div>
                      <div className="text-sm text-muted-foreground">Up to 48 hours before pickup</div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <MapPin className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium">Multiple Locations</div>
                      <div className="text-sm text-muted-foreground">Easy pickup and drop-off</div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <CreditCard className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium">Secure Payment</div>
                      <div className="text-sm text-muted-foreground">Pay online or at pickup</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="sticky top-24 shadow-lg border-primary/10">
              <CardHeader>
                <CardTitle className="font-serif">Reserve this Vehicle</CardTitle>
                <CardDescription>Fill out the form below to secure your booking</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="pickupLocation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pickup Location</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
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
                        name="returnLocation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Return Location</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
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
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="pickupDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Pickup Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, "MMM d, yyyy") : <span>Date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={isDateUnavailable} initialFocus />
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
                                  <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                    {field.value ? format(field.value, "MMM d, yyyy") : <span>Date</span>}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => isDateUnavailable(date) || date < (pickupDate || new Date(new Date().setHours(0, 0, 0, 0)))} initialFocus />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator className="my-4" />

                    <div className="space-y-4">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Full Name</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="john@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="+81 11-123-4567" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>

                    <div className="bg-muted p-4 rounded-lg mt-6 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Rental ({days} {days === 1 ? 'day' : 'days'} × ¥{car.pricePerDay.toLocaleString()})
                        </span>
                        <span className="tabular-nums">¥{rentalCost.toLocaleString()}</span>
                      </div>
                      {airportPickupFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Airport Pickup Fee</span>
                          <span className="tabular-nums">¥{airportPickupFee.toLocaleString()}</span>
                        </div>
                      )}
                      {airportDropoffFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Airport Drop-off Fee</span>
                          <span className="tabular-nums">¥{airportDropoffFee.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Insurance & Taxes</span>
                        <span>Included</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold text-base">
                        <span>Total</span>
                        <span className="tabular-nums">¥{totalPrice.toLocaleString()}</span>
                      </div>
                    </div>

                    <Button type="submit" className="w-full mt-4" size="lg" disabled={createBooking.isPending || !car.isAvailable}>
                      {createBooking.isPending ? "Processing..." : car.isAvailable ? "Confirm Booking" : "Car Unavailable"}
                    </Button>

                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
