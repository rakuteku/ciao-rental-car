import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, ChevronRight, ArrowLeft, CreditCard, Car, Clock, MapPin } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { useCheckoutDraft } from "@/hooks/use-checkout-draft";
import {
  useGetRentalAddons,
  useGetRentalVehicle,
  getGetRentalVehicleQueryKey,
  useGetRentalHold,
  getGetRentalHoldQueryKey,
  useCalculateRentalPrice,
  useCreateRentalReservation,
} from "@workspace/api-client-react";

const driverSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Phone number is required"),
  romanizedName: z.string().optional(),
  nationality: z.string().optional(),
  dateOfBirth: z.string().optional(),
  residenceCountry: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  flightNumber: z.string().optional(),
  accommodation: z.string().optional(),
});

export function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { draft, updateDraft, clearDraft } = useCheckoutDraft();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [holdExpired, setHoldExpired] = useState(false);
  const [differentReturnLocation, setDifferentReturnLocation] = useState(draft?.differentReturnLocation ?? false);
  const [documents, setDocuments] = useState<Record<string, string>>(draft?.documents ?? {});
  const [additionalDriver, setAdditionalDriver] = useState({ fullName: "", email: "", phone: "" });
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number>>(
    draft?.addons.reduce((acc, curr) => ({ ...acc, [curr.addonId]: curr.qty }), {}) || {}
  );
  const [agreedTerms, setAgreedTerms] = useState(false);
  
  const { data: addons } = useGetRentalAddons();
  const { data: car } = useGetRentalVehicle(draft?.vehicleSlug || "", {
    query: { enabled: !!draft?.vehicleSlug, queryKey: getGetRentalVehicleQueryKey(draft?.vehicleSlug || "") }
  });
  const { data: holdStatus } = useGetRentalHold(draft?.holdId ?? 0, {
    query: {
      enabled: Boolean(draft?.holdId),
      queryKey: getGetRentalHoldQueryKey(draft?.holdId ?? 0),
      refetchInterval: 30_000,
    },
  });

  const createReservation = useCreateRentalReservation();

  const form = useForm<z.infer<typeof driverSchema>>({
    resolver: zodResolver(driverSchema),
    defaultValues: draft?.driver || {
      fullName: "",
      email: "",
      phone: "",
      romanizedName: "",
      nationality: "",
      flightNumber: "",
      accommodation: "",
    },
  });

  const { data: priceData, mutate: calculatePrice } = useCalculateRentalPrice();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (holdStatus?.expired || (draft?.heldUntil && new Date(draft.heldUntil).getTime() <= now)) {
      setHoldExpired(true);
    }
  }, [draft?.heldUntil, holdStatus?.expired, now]);

  useEffect(() => {
    if (draft && step >= 5) {
      calculatePrice({
        data: {
          vehicleId: draft.vehicleId,
          pickupAt: draft.pickupAt,
          returnAt: draft.returnAt,
          pickupLocation: draft.pickupLocation,
          returnLocation: draft.returnLocation,
          addons: Object.entries(selectedAddons)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
        }
      });
    }
  }, [step, draft, selectedAddons, calculatePrice]);

  if (!draft) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center space-y-4">
        <h1 className="text-2xl font-serif">No active checkout</h1>
        <p className="text-muted-foreground">Please select a vehicle first.</p>
        <Button onClick={() => setLocation("/rentalcar/cars")}>View Fleet</Button>
      </div>
    );
  }

  const handleNext = () => {
    if (step === 1) {
      updateDraft({
        addons: Object.entries(selectedAddons)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
      });
      setStep(2);
    } else if (step === 2) {
      form.handleSubmit((data) => {
        updateDraft({ driver: data });
        setStep(3);
      })();
    } else if (step === 3) {
      updateDraft({ documents });
      setStep(4);
    } else if (step === 4) {
      updateDraft({ differentReturnLocation });
      setStep(5);
    } else if (step < 6) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleConfirm = () => {
    if (!draft.holdId || holdExpired) {
      toast({ title: "Error", description: "Hold expired or invalid", variant: "destructive" });
      return;
    }
    
    createReservation.mutate({
      data: {
        holdId: draft.holdId,
        vehicleId: draft.vehicleId,
        pickupAt: draft.pickupAt,
        returnAt: draft.returnAt,
        pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation,
        driver: draft.driver,
        additionalDrivers: draft.additionalDrivers ? [additionalDriver] : [],
        documents: Object.entries(documents)
          .filter(([, fileUrl]) => Boolean(fileUrl))
          .map(([document, fileUrl]) => ({
            docType: document.toLowerCase().includes("passport") ? "passport" : document.toLowerCase().includes("international") ? "international_license" : document.toLowerCase().includes("insurance") ? "insurance" : document.toLowerCase().includes("credit") ? "credit_card" : document.toLowerCase().includes("license") ? "drivers_license" : "other",
            fileUrl,
          })),
         addons: Object.entries(selectedAddons)
           .filter(([, qty]) => qty > 0)
           .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
        source: "web",
      }
    }, {
      onSuccess: (reservation) => {
        window.sessionStorage.setItem("ciao_rental_confirmation", JSON.stringify({
          reservation,
          draft: {
            pickupAt: draft.pickupAt,
            returnAt: draft.returnAt,
            pickupLocation: draft.pickupLocation,
            returnLocation: draft.returnLocation,
          },
          vehicle: car ? { title: car.publicTitle || car.model, image: car.images?.[0]?.url } : null,
           pricing: reservation.pricing,
        }));
        clearDraft();
        setLocation(`/rentalcar/booking/confirmation?id=${reservation.id}`);
      },
      onError: (err) => {
        toast({ title: "Booking failed", description: err.message || "Please try again later.", variant: "destructive" });
      }
    });
  };

  const steps = [
    "Add-ons",
    "Driver Info",
    "Documents",
    "Pickup Details",
    "Summary",
    "Payment"
  ];
  const secondsRemaining = draft.heldUntil
    ? Math.max(0, Math.ceil((new Date(draft.heldUntil).getTime() - now) / 1_000))
    : 0;
  const holdLabel = `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-[100dvh] bg-muted/10 py-12">
      <div className="container max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-sm">
          <div className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4" /> Your vehicle is held for you</div>
          <span className="font-mono text-base font-bold">{holdLabel}</span>
        </div>
        
        {/* Progress Bar */}
        <div className="relative">
          <div className="absolute top-1/2 left-0 w-full h-1 -translate-y-1/2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-in-out"
              style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
            />
          </div>
          <div className="relative flex justify-between">
            {steps.map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors z-10
                  ${step > i + 1 ? 'bg-primary text-primary-foreground' : step === i + 1 ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'}`}
                >
                  {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${step >= i + 1 ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 4: Pickup details */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">Pickup Details</h2>
                  <p className="text-muted-foreground">Confirm your locations, times, and delivery notes.</p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-background p-4">
                  <Checkbox id="different-return" checked={differentReturnLocation} onCheckedChange={(checked) => setDifferentReturnLocation(Boolean(checked))} />
                  <label htmlFor="different-return" className="text-sm leading-relaxed">
                    I need a different return location. Our team will confirm any applicable delivery fee before pickup.
                  </label>
                </div>
                {(new Date(draft.pickupAt).getHours() < 8 || new Date(draft.pickupAt).getHours() >= 19) && (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm">
                    Your pickup is outside normal desk hours. An after-hours service fee may apply.
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Pickup</div>
                      <div className="font-bold text-lg">{format(new Date(draft.pickupAt), "MMM d, yyyy")}</div>
                      <div className="text-sm text-muted-foreground">{draft.pickupLocation}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Return</div>
                      <div className="font-bold text-lg">{format(new Date(draft.returnAt), "MMM d, yyyy")}</div>
                      <div className="text-sm text-muted-foreground">{draft.returnLocation}</div>
                    </CardContent>
                  </Card>
                </div>
                {car && (
                  <Card>
                    <CardContent className="p-6 flex items-center gap-6">
                      <div className="w-32 aspect-[4/3] bg-muted rounded-md overflow-hidden shrink-0">
                        <img src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"} alt={car.model} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{car.brand} · {car.year}</p>
                        <h3 className="font-serif font-bold text-xl">{car.publicTitle || car.model}</h3>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5"><Car className="w-4 h-4"/> {car.seats} passengers</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Step 1: Add-ons */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">Enhance Your Trip</h2>
                  <p className="text-muted-foreground">Add extras to make your journey more comfortable.</p>
                </div>
                <div className="space-y-4">
                  {addons?.map(addon => {
                    const qty = selectedAddons[addon.id] || 0;
                    return (
                      <Card key={addon.id} className={qty > 0 ? "border-primary" : ""}>
                        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4 flex-1">
                            {addon.image && (
                              <div className="w-16 h-16 bg-muted rounded shrink-0 overflow-hidden">
                                <img src={addon.image} alt={addon.name} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <div>
                              <h4 className="font-bold">{addon.name}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2">{addon.description}</p>
                              <p className="text-sm font-semibold mt-1">
                                {addon.pricingType === 'per_day' ? `¥${addon.perDayFee.toLocaleString()}/day` : `¥${addon.flatFee.toLocaleString()} flat`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 bg-muted/50 rounded-lg p-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => setSelectedAddons(prev => ({ ...prev, [addon.id]: Math.max(0, (prev[addon.id] || 0) - 1) }))}
                            >
                              -
                            </Button>
                            <span className="w-4 text-center font-medium">{qty}</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => setSelectedAddons(prev => ({ ...prev, [addon.id]: Math.min(addon.maxQty || 10, (prev[addon.id] || 0) + 1) }))}
                            >
                              +
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {!addons?.length && (
                    <div className="p-8 text-center bg-white border rounded-xl text-muted-foreground">
                      No add-ons available for this location.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Driver Details */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">Driver Information</h2>
                  <p className="text-muted-foreground">Please provide details for the primary driver.</p>
                </div>
                <Card>
                  <CardContent className="p-6">
                    <Form {...form}>
                      <form className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="fullName" render={({ field }) => (
                            <FormItem><FormLabel>Full Name (as on License)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="romanizedName" render={({ field }) => (
                            <FormItem><FormLabel>Romanized Name (if applicable)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="email" render={({ field }) => (
                            <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="phone" render={({ field }) => (
                            <FormItem><FormLabel>Phone Number</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="nationality" render={({ field }) => (
                            <FormItem><FormLabel>Nationality</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                            <FormItem><FormLabel>Date of Birth</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="residenceCountry" render={({ field }) => (
                            <FormItem><FormLabel>Country of Residence</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="address" render={({ field }) => (
                            <FormItem className="sm:col-span-2"><FormLabel>Home Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="emergencyContact" render={({ field }) => (
                            <FormItem className="sm:col-span-2"><FormLabel>Emergency Contact</FormLabel><FormControl><Input placeholder="Name and phone number" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                        <Separator />
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="flightNumber" render={({ field }) => (
                            <FormItem><FormLabel>Arrival Flight Number (Optional)</FormLabel><FormControl><Input placeholder="e.g. JL501" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="accommodation" render={({ field }) => (
                            <FormItem><FormLabel>Hotel / Accommodation (Optional)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      </form>
                    </Form>
                    <Button variant="outline" className="mt-5" onClick={() => updateDraft({ additionalDrivers: true })}>+ Add additional driver</Button>
                    {draft.additionalDrivers && (
                      <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2">
                        <p className="sm:col-span-2 text-sm font-medium">Additional driver</p>
                        <Input placeholder="Full legal name" aria-label="Additional driver full legal name" value={additionalDriver.fullName} onChange={(event) => setAdditionalDriver((driver) => ({ ...driver, fullName: event.target.value }))} />
                        <Input type="email" placeholder="Email address" aria-label="Additional driver email" value={additionalDriver.email} onChange={(event) => setAdditionalDriver((driver) => ({ ...driver, email: event.target.value }))} />
                        <Input type="tel" placeholder="Phone number" aria-label="Additional driver phone" value={additionalDriver.phone} onChange={(event) => setAdditionalDriver((driver) => ({ ...driver, phone: event.target.value }))} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 3: Documents */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">Required Documents</h2>
                  <p className="text-muted-foreground">Add a file or secure document link now. You can also finish this after booking.</p>
                </div>
                {(car?.requiredDocuments?.length ? car.requiredDocuments : ["Driver's license", "Passport or photo ID"]).map((document, index) => (
                  <Card key={document}>
                    <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <p className="font-medium">{document}</p>
                        <p className="text-xs text-muted-foreground">{index === 0 ? "Required before pickup" : "Required for international rentals"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${document} link`}
                          placeholder="Image/PDF URL"
                          value={documents[document] ?? ""}
                          onChange={(event) => setDocuments((current) => ({ ...current, [document]: event.target.value }))}
                        />
                      </div>
                      <span className={`text-xs font-medium ${documents[document] ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {documents[document] ? "Ready to submit" : "Not submitted"}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Step 5: Summary */}
            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">Review & Confirm</h2>
                  <p className="text-muted-foreground">Please review your booking details.</p>
                </div>

                <div className="grid gap-6">
                  <Card>
                    <CardContent className="p-6 space-y-6">
                      <div>
                        <h3 className="font-bold text-lg mb-4 border-b pb-2">Primary Driver</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">Name</span>
                            <span className="font-medium">{draft.driver.fullName}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Email</span>
                            <span className="font-medium">{draft.driver.email}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Phone</span>
                            <span className="font-medium">{draft.driver.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-lg mb-4 border-b pb-2">Itinerary</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">Pickup</span>
                            <span className="font-medium">{format(new Date(draft.pickupAt), "MMM d, yyyy")}</span><br/>
                            <span className="text-xs text-muted-foreground">{draft.pickupLocation}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Return</span>
                            <span className="font-medium">{format(new Date(draft.returnAt), "MMM d, yyyy")}</span><br/>
                            <span className="text-xs text-muted-foreground">{draft.returnLocation}</span>
                          </div>
                        </div>
                      </div>
                      {priceData?.addons && priceData.addons.length > 0 && (
                        <div>
                          <h3 className="font-bold text-lg mb-4 border-b pb-2">Selected add-ons</h3>
                          <div className="space-y-2 text-sm">
                            {priceData.addons.map((addon) => (
                              <div key={addon.addonId} className="flex justify-between gap-4">
                                <span>{addon.name} × {addon.qty}</span>
                                <span className="tabular-nums">¥{addon.totalPrice.toLocaleString()}</span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t pt-2 font-medium">
                              <span>Add-ons total</span>
                              <span className="tabular-nums">¥{priceData.addonsTotal.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3 border-t pt-5">
                        <Checkbox id="rental-agreement" checked={agreedTerms} onCheckedChange={(checked) => setAgreedTerms(Boolean(checked))} />
                        <label htmlFor="rental-agreement" className="text-sm text-muted-foreground">
                          I have reviewed and agree to the rental agreement, insurance summary, cancellation policy, and security deposit terms.
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 6: Payment */}
            {step === 6 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">Payment</h2>
                  <p className="text-muted-foreground">Secure your booking (Simulated).</p>
                </div>
                
                <Card>
                  <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                      <CreditCard className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-xl">Pay at Pickup</h3>
                    <p className="text-muted-foreground max-w-sm">
                      No payment is required right now. You will pay the full amount of <strong className="text-foreground">¥{priceData?.finalTotal.toLocaleString() || '...'}</strong> when you pick up your vehicle at the counter.
                    </p>
                    
                    <div className="pt-6 w-full max-w-sm text-left">
                      <div className="flex items-start gap-3">
                        <Checkbox id="terms" checked={agreedTerms} onCheckedChange={(c) => setAgreedTerms(!!c)} />
                        <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug">
                          I agree to the rental terms and conditions, and acknowledge the cancellation policy.
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              {step < 6 ? (
                <Button onClick={handleNext} className="gap-2" size="lg">
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleConfirm} disabled={!agreedTerms || createReservation.isPending} className="gap-2 px-8" size="lg">
                  {createReservation.isPending ? "Confirming..." : "Confirm Booking"} <Check className="w-4 h-4" />
                </Button>
              )}
            </div>

          </div>

          {/* Sidebar / Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-serif font-bold text-lg">Booking Summary</h3>
                </div>
                
                {car && (
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-12 bg-muted rounded overflow-hidden">
                      <img src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"} alt={car.model} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-bold text-sm leading-tight">{car.publicTitle || car.model}</div>
                      <div className="text-xs text-muted-foreground">{car.vehicleClass}</div>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-3 text-sm">
                  {priceData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rental ({priceData.days} days)</span>
                        <span>¥{priceData.subtotal.toLocaleString()}</span>
                      </div>
                      {priceData.addonsTotal > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Add-ons</span>
                            <span>¥{priceData.addonsTotal.toLocaleString()}</span>
                          </div>
                          {priceData.addons?.map((addon) => (
                            <div key={addon.addonId} className="flex justify-between pl-3 text-xs">
                              <span className="text-muted-foreground">{addon.name} × {addon.qty}</span>
                              <span>¥{addon.totalPrice.toLocaleString()}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {priceData.airportPickupFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pickup Fee</span>
                          <span>¥{priceData.airportPickupFee.toLocaleString()}</span>
                        </div>
                      )}
                      {priceData.airportDropoffFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Dropoff Fee</span>
                          <span>¥{priceData.airportDropoffFee.toLocaleString()}</span>
                        </div>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span>¥{priceData.finalTotal.toLocaleString()}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      Calculating price...
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {holdExpired && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <Card className="max-w-md">
            <CardContent className="space-y-5 p-7">
              <Clock className="h-8 w-8 text-destructive" />
              <div>
                <h2 className="font-serif text-2xl font-bold">Your reservation hold has expired</h2>
                <p className="mt-2 text-sm text-muted-foreground">The vehicle may no longer be available for your selected dates.</p>
              </div>
              <Button className="w-full" onClick={() => { clearDraft(); setLocation("/rentalcar?hold=expired"); }}>Return to search</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
