import { useParams, useLocation, useSearch } from "wouter";
import { useEffect, useRef, useState } from "react";
import { format, differenceInDays, addDays } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CalendarIcon, Users, CreditCard, Shield, MapPin, CheckCircle2, Fuel, AlertTriangle, Luggage, Snowflake } from "lucide-react";

import {
  useGetRentalVehicle,
  useCreateRentalHold,
  getGetRentalVehicleQueryKey,
  useCalculateRentalPrice,
  useGetRentalAddons,
  useSearchRentalVehicles,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LOCATIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useCheckoutDraft } from "@/hooks/use-checkout-draft";

const bookingSchema = z.object({
  pickupLocation: z.string({ required_error: "Pickup location is required" }),
  returnLocation: z.string({ required_error: "Return location is required" }),
  pickupDate: z.date({ required_error: "Pickup date is required" }),
  returnDate: z.date({ required_error: "Return date is required" }),
});

export function CarDetailPage() {
  const params = useParams();
  const slug = params.slug || "";
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setDraft } = useCheckoutDraft();

  const { data: car, isLoading } = useGetRentalVehicle(slug, {
    query: { enabled: !!slug, queryKey: getGetRentalVehicleQueryKey(slug) }
  });

  const createHold = useCreateRentalHold();
  const { data: addons } = useGetRentalAddons();
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number>>({});

  const defaultPickupDate = searchParams.get("pickupAt") ? new Date(searchParams.get("pickupAt")!) : searchParams.get("pickupDate") ? new Date(searchParams.get("pickupDate")!) : new Date();
  const defaultReturnDate = searchParams.get("returnAt") ? new Date(searchParams.get("returnAt")!) : searchParams.get("returnDate") ? new Date(searchParams.get("returnDate")!) : addDays(new Date(), 3);

  const form = useForm<z.infer<typeof bookingSchema>>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      pickupLocation: searchParams.get("pickupLocation") || LOCATIONS[0],
      returnLocation: searchParams.get("returnLocation") || LOCATIONS[0],
      pickupDate: defaultPickupDate,
      returnDate: defaultReturnDate,
    },
  });

  const pickupDate = form.watch("pickupDate");
  const returnDate = form.watch("returnDate");
  const pickupLocation = form.watch("pickupLocation");
  const returnLocation = form.watch("returnLocation");
  const availabilitySearch = useSearchRentalVehicles({
    slug,
    pickupAt: pickupDate?.toISOString(),
    returnAt: returnDate?.toISOString(),
  });
  const isStillAvailable = availabilitySearch.data
    ? availabilitySearch.data.available.some((vehicle) => vehicle.id === car?.id)
    : true;

  const calculatePrice = useCalculateRentalPrice();
  const priceData = calculatePrice.data;

  const calculateRef = useRef(calculatePrice.mutate);
  calculateRef.current = calculatePrice.mutate;

  useEffect(() => {
    if (car?.id && pickupDate && returnDate && pickupLocation && returnLocation) {
      calculateRef.current({
        data: {
          vehicleId: car.id,
          pickupAt: pickupDate.toISOString(),
          returnAt: returnDate.toISOString(),
          pickupLocation: pickupLocation,
          returnLocation: returnLocation,
          addons: Object.entries(selectedAddons)
            .filter(([, qty]) => qty > 0)
            .map(([addonId, qty]) => ({ addonId: Number(addonId), qty })),
        }
      });
    }
  }, [car?.id, pickupDate, returnDate, pickupLocation, returnLocation, selectedAddons]);


  function onSubmit(data: z.infer<typeof bookingSchema>) {
    if (!car) return;

    createHold.mutate({
      data: {
        vehicleId: car.id,
        pickupAt: data.pickupDate.toISOString(),
        returnAt: data.returnDate.toISOString(),
        pickupLocation: data.pickupLocation,
        returnLocation: data.returnLocation,
        addons: Object.entries(selectedAddons)
          .filter(([, qty]) => qty > 0)
          .map(([addonId, qty]) => ({ addonId: Number(addonId), qty })),
      }
    }, {
      onSuccess: (hold) => {
        setDraft({
          vehicleId: car.id,
          vehicleSlug: car.slug,
          pickupAt: data.pickupDate.toISOString(),
          returnAt: data.returnDate.toISOString(),
          pickupLocation: data.pickupLocation,
          returnLocation: data.returnLocation,
          holdId: hold.holdId,
          heldUntil: hold.heldUntil,
          addons: Object.entries(selectedAddons)
            .filter(([, qty]) => qty > 0)
            .map(([addonId, qty]) => ({ addonId: Number(addonId), qty })),
          driver: { fullName: "", email: "", phone: "" }
        });
        setLocation("/rentalcar/checkout");
      },
      onError: () => {
        toast({ title: "Booking failed", description: "This vehicle is no longer available for these dates.", variant: "destructive" });
      }
    });
  }

  const isDateUnavailable = (date: Date) => {
    if (date < new Date(new Date().setHours(0, 0, 0, 0))) return true;
    return false; // Real availability logic would go here if API provided it simply
  };

  const displayImage = car?.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80";

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
            {!isStillAvailable && (
              <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                This vehicle is no longer available for the selected dates. Please return to results and choose another option.
              </div>
            )}
            <div className="rounded-xl overflow-hidden bg-background border shadow-sm">
              <div className="aspect-[16/9] relative bg-muted">
                <img
                  src={displayImage}
                  alt={`${car.brand} ${car.model}`}
                  className="object-cover w-full h-full"
                />
              </div>
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">{car.brand} · {car.year}</p>
                    <h1 className="text-3xl font-serif font-bold mt-1">{car.publicTitle || car.model}</h1>
                    <div className="flex flex-wrap gap-3 mt-3">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="w-3 h-3" /> {car.seats} passengers
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Fuel className="w-3 h-3" /> {car.fuelType}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    {car.pricing?.basePrice && (
                      <>
                        <div className="text-2xl font-mono font-bold">¥{car.pricing.basePrice.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">per day</div>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Description</h3>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {car.description || "A premium vehicle perfectly suited for exploring the scenic routes of Hokkaido. Features advanced safety systems, comfortable seating, and excellent handling in all weather conditions."}
                  </p>
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
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Hokkaido & winter ready</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                    {[
                      [car.has4wd, "4WD traction"],
                      [car.hasWinterTires, "Winter tires"],
                      [car.hasSnowBrush, "Snow brush"],
                      [car.hasIceScraper, "Ice scraper"],
                      [car.isSkiFriendly, "Ski friendly"],
                      [car.hasHeatedSeats, "Heated seats"],
                    ].filter(([included]) => included).map(([, label]) => <span key={String(label)} className="flex gap-2"><Snowflake className="h-4 w-4" />{label}</span>)}
                  </div>
                </div>
                <div className="grid gap-5 border-t pt-6 text-sm text-muted-foreground">
                  <div><h3 className="mb-1 font-bold text-foreground">Pickup & return</h3><p>We will send meeting instructions before your selected pickup time. Please return with the same fuel level.</p></div>
                  <div><h3 className="mb-1 font-bold text-foreground">Policies & insurance</h3><p>Free cancellation is available before the policy cutoff. Standard collision coverage is included; security deposit terms are shown at checkout.</p></div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="sticky top-24 shadow-lg border-primary/10">
              <CardHeader>
                <CardTitle className="font-serif">Reserve this Vehicle</CardTitle>
                <CardDescription>Select dates to check availability and calculate price</CardDescription>
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
                                <SelectTrigger className="h-11 md:h-10"><SelectValue placeholder="Select location" /></SelectTrigger>
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
                                <SelectTrigger className="h-11 md:h-10"><SelectValue placeholder="Select location" /></SelectTrigger>
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
                                  <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal h-11 md:h-10", !field.value && "text-muted-foreground")}>
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
                                  <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal h-11 md:h-10", !field.value && "text-muted-foreground")}>
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
                    <div className="space-y-3 border-t pt-4">
                      <div className="flex items-center justify-between"><h3 className="font-semibold">Add-ons</h3><span className="text-xs text-muted-foreground">Optional</span></div>
                      {addons?.map((addon) => {
                        const qty = selectedAddons[addon.id] ?? 0;
                        const displayedPrice = addon.pricingType === "per_day" ? addon.perDayFee : addon.pricingType === "per_unit" ? addon.perUnitFee : addon.flatFee;
                        return (
                          <div key={addon.id} className="flex items-center justify-between gap-2 text-xs">
                            <div><p className="font-medium">{addon.name}</p><p className="text-muted-foreground">¥{displayedPrice.toLocaleString()} {addon.pricingType === "per_day" ? "/ day" : ""}</p></div>
                            <div className="flex items-center gap-1">
                              <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setSelectedAddons((current) => ({ ...current, [addon.id]: Math.max(0, qty - 1) }))}>−</Button>
                              <span className="w-4 text-center">{qty}</span>
                              <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setSelectedAddons((current) => ({ ...current, [addon.id]: Math.min(addon.maxQty, qty + 1) }))}>+</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-muted p-4 rounded-lg mt-6 space-y-2 text-sm">
                      {priceData ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Rental ({priceData.days} {priceData.days === 1 ? 'day' : 'days'})
                            </span>
                            <span className="tabular-nums">¥{priceData.subtotal.toLocaleString()}</span>
                          </div>
                          {priceData.addonsTotal > 0 && (
                            <div data-testid="price-addons-summary">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Add-ons</span>
                                <span className="tabular-nums">¥{priceData.addonsTotal.toLocaleString()}</span>
                              </div>
                              {priceData.addons?.map((addon) => (
                                <div key={addon.addonId} data-testid={`price-addon-${addon.addonId}`} className="flex justify-between pl-3 text-xs">
                                  <span className="text-muted-foreground">{addon.name} × {addon.qty}</span>
                                  <span className="tabular-nums">¥{addon.totalPrice.toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {priceData.airportPickupFee > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Airport Pickup Fee</span>
                              <span className="tabular-nums">¥{priceData.airportPickupFee.toLocaleString()}</span>
                            </div>
                          )}
                          {priceData.airportDropoffFee > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Airport Drop-off Fee</span>
                              <span className="tabular-nums">¥{priceData.airportDropoffFee.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Insurance & Taxes</span>
                            <span>Included</span>
                          </div>
                          <Separator className="my-2" />
                          <div className="flex justify-between font-bold text-base">
                            <span>Total</span>
                            <span className="tabular-nums">¥{priceData.finalTotal.toLocaleString()}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          {calculatePrice.isPending ? "Calculating price..." : "Select dates to see price"}
                        </div>
                      )}
                    </div>

                    <Button type="submit" className="w-full mt-4" size="lg" disabled={createHold.isPending || calculatePrice.isPending || !priceData || !isStillAvailable}>
                      {createHold.isPending ? "Holding Vehicle..." : "Continue to Booking"}
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
