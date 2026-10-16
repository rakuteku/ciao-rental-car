import { useState, useEffect } from "react";
import { AddonSelector } from "@/components/rental/AddonSelector";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, ChevronRight, ArrowLeft, Mail, Car, Clock, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { useCheckoutDraft } from "@/hooks/use-checkout-draft";
import { useCustomerAccount, useRentalMarketplaceConfig } from "@/hooks/use-rental-operations";
import { MarketplaceCheckout } from "./marketplace";
import { localizedPath, useLanguage } from "@/lib/language";
import { useInlineSeoMeta } from "@/hooks/use-seo-meta";
import { localizeAddon, localizeVehicle, rentalCopy } from "@/lib/rental-localization";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";
import { formatTokyo, tokyoHour } from "@/lib/rental-marketplace";
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

const paymentCopy = {
  en: {
    step: "Payment",
    title: "Payment instructions",
    message: "No online payment is taken now. We will confirm your booking and send payment instructions by email.",
    total: "Total (tax included)",
    consentBefore: "I agree to the ",
    terms: "Terms of Service",
    consentBetween: " and ",
    privacy: "Privacy Policy",
    consentAfter: ".",
    submit: "Submit booking",
    submitting: "Submitting...",
  },
  ja: {
    step: "お支払い",
    title: "お支払いのご案内",
    message: "現時点でオンライン決済は行いません。予約内容を確認のうえ、お支払い方法をメールでご案内します。",
    total: "合計（税込）",
    consentBefore: "",
    terms: "利用規約",
    consentBetween: "および",
    privacy: "プライバシーポリシー",
    consentAfter: "に同意します。",
    submit: "予約を送信",
    submitting: "送信中...",
  },
  "zh-TW": {
    step: "付款",
    title: "付款方式",
    message: "目前不會在線上收費。我們確認預約後，會以電子郵件寄送付款方式。",
    total: "總計（含稅）",
    consentBefore: "我同意",
    terms: "服務條款",
    consentBetween: "及",
    privacy: "隱私權政策",
    consentAfter: "。",
    submit: "送出預訂",
    submitting: "送出中...",
  },
} as const;

const documentCopy = {
  en: { title: "Required documents", upload: "After booking, upload PDF, JPEG, or PNG files securely from your booking details.", pickup: "Original documents are checked at pickup. Staff will contact you about the documents needed.", driversLicence: "Driver's licence", japaneseLicense: "Japanese driver's licence", creditCard: "Credit card", insurance: "Insurance document", checking: "Checking secure upload…", retry: "Could not check secure upload. Please try again.", foreignLicense: "Foreign driver's licence", idp: "International driving permit", passport: "Passport", residenceCard: "Residence card", selfie: "Identity photo", additionalDrivers: "Additional driver's documents", other: "Other document" },
  ja: { title: "必要書類", upload: "予約後、予約詳細から PDF・JPEG・PNG 形式の書類を安全にアップロードできます。", pickup: "原本は貸出時に確認します。必要書類についてスタッフからご連絡します。", driversLicence: "運転免許証", japaneseLicense: "日本の運転免許証", creditCard: "クレジットカード", insurance: "保険書類", checking: "安全なアップロードを確認しています…", retry: "安全なアップロードを確認できませんでした。もう一度お試しください。", foreignLicense: "外国の運転免許証", idp: "国際運転免許証", passport: "パスポート", residenceCard: "在留カード", selfie: "本人確認用写真", additionalDrivers: "追加運転者の書類", other: "その他の書類" },
  "zh-TW": { title: "所需文件", upload: "預訂後可在預訂詳情安全上傳 PDF、JPEG 或 PNG 文件。", pickup: "取車時會查驗文件正本。工作人員將聯絡您確認所需文件。", driversLicence: "駕駛執照", japaneseLicense: "日本駕駛執照", creditCard: "信用卡", insurance: "保險文件", checking: "正在確認安全上傳…", retry: "無法確認安全上傳，請重試。", foreignLicense: "外國駕駛執照", idp: "國際駕駛許可證", passport: "護照", residenceCard: "在留卡", selfie: "身分確認照片", additionalDrivers: "其他駕駛人的文件", other: "其他文件" },
} as const;

function documentName(value: string, language: keyof typeof documentCopy): string {
  const names = documentCopy[language];
  const key = value.toLowerCase().replaceAll(/[\s'-]+/g, "_");
  if (key === "japanese_license") return names.japaneseLicense;
  if (key === "drivers_license" || key === "driver_s_license") return names.driversLicence;
  if (key === "foreign_license") return names.foreignLicense;
  if (key === "idp" || key === "international_license") return names.idp;
  if (key.includes("passport")) return names.passport;
  if (key === "residence_card") return names.residenceCard;
  if (key === "selfie") return names.selfie;
  if (key === "additional_driver_docs") return names.additionalDrivers;
  if (key === "credit_card") return names.creditCard;
  if (key === "insurance") return names.insurance;
  return names.other;
}

export function CheckoutPage() {
  const { language } = useLanguage();
  const account = useCustomerAccount();
  const config = useRentalMarketplaceConfig();
  if (config.isLoading || account.isLoading) return <div className="container min-h-[60dvh] space-y-4 py-20"><div className="h-10 w-56 animate-pulse bg-muted" /><div className="h-48 max-w-3xl animate-pulse bg-muted" /></div>;
  if (config.isError || !config.data) return <div className="container min-h-[60dvh] py-20"><h1 className="font-serif text-2xl">Checkout temporarily unavailable</h1><p className="my-4 text-muted-foreground">We could not verify the booking mode. No booking was submitted.</p><Button onClick={() => config.refetch()}>Try again</Button></div>;
  if (!account.data?.account) {
    const gate = language === "ja"
      ? { title: "予約にはログインが必要です", body: "ログインまたはアカウントを作成すると、この車両の予約を続けられます。", action: "ログイン・アカウント作成" }
      : language === "zh-TW"
        ? { title: "請先登入再預訂", body: "登入或建立帳戶後，即可繼續此車輛的預訂。", action: "登入或建立帳戶" }
        : { title: "Sign in before booking", body: "Sign in or create an account to continue this vehicle booking.", action: "Sign in or create account" };
    const next = localizedPath("/rentalcar/checkout", language);
    return <div className="container grid min-h-[65dvh] place-items-center py-16"><Card className="w-full max-w-lg"><CardContent className="space-y-5 p-8 text-center"><h1 className="font-serif text-3xl font-bold">{gate.title}</h1><p className="text-muted-foreground">{gate.body}</p><Button asChild className="w-full"><Link href={`${localizedPath("/rentalcar/my-bookings", language)}?next=${encodeURIComponent(next)}`}>{gate.action}</Link></Button></CardContent></Card></div>;
  }
  return config.data.enabled ? <MarketplaceCheckout /> : <LegacyCheckout />;
}

function LegacyCheckout() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { draft, updateDraft, clearDraft } = useCheckoutDraft();
  const { toast } = useToast();
  const { language } = useLanguage();
  const copy = rentalCopy(language);
  const payment = paymentCopy[language];
  const customer = useCustomerAccount().data?.account as { email?: string; fullName?: string; phone?: string } | undefined;
  const { data: configuredLocations } = useRentalLocations();
  const locations = configuredLocations ?? DEFAULT_RENTAL_LOCATIONS;
  const locationLabel = (value: string) => rentalLocationLabel(value, locations, language);
  useInlineSeoMeta({
    metaTitle: "Checkout | PrimoStay Car Rental",
    metaDescription: "Review your PrimoStay Car Rental booking, driver details, add-ons, and pickup information.",
    ogTitle: "Checkout | PrimoStay Car Rental",
    ogDescription: "Review your PrimoStay Car Rental booking before confirming.",
    ogImage: "",
  });
  
  const [step, setStep] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [holdExpired, setHoldExpired] = useState(false);
  const [differentReturnLocation, setDifferentReturnLocation] = useState(draft?.differentReturnLocation ?? false);
  const [additionalDriver, setAdditionalDriver] = useState({ fullName: "", email: "", phone: "" });
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number>>(
    draft?.addons.reduce((acc, curr) => ({ ...acc, [curr.addonId]: curr.qty }), {}) || {}
  );
  const [agreedTerms, setAgreedTerms] = useState(false);
  
  const { data: addons } = useGetRentalAddons();
  useEffect(() => {
    if (!addons) return;
    const available = new Set(addons.map(addon => addon.id));
    setSelectedAddons(current => Object.keys(current).some(id => !available.has(Number(id)))
      ? Object.fromEntries(Object.entries(current).filter(([id]) => available.has(Number(id))))
      : current);
  }, [addons]);
  const { data: marketplaceConfig, isLoading: isMarketplaceConfigLoading, isError: isMarketplaceConfigError } = useRentalMarketplaceConfig();
  const { data: car } = useGetRentalVehicle(draft?.vehicleSlug || "", {
    query: { enabled: !!draft?.vehicleSlug, queryKey: getGetRentalVehicleQueryKey(draft?.vehicleSlug || "") }
  });
  const localizedCar = car ? localizeVehicle(car, language) : undefined;
  const addonName = (addonId: number, fallback: string) => {
    const addon = addons?.find((candidate) => candidate.id === addonId);
    return addon ? localizeAddon(addon, language).name : fallback;
  };
  const { data: holdStatus } = useGetRentalHold(draft?.holdId ?? 0, {
    request: { headers: { "X-Hold-Token": draft?.holdToken ?? "" } },
    query: {
      queryKey: [...getGetRentalHoldQueryKey(draft?.holdId ?? 0), draft?.holdToken],
      refetchInterval: 30_000,
      enabled: Boolean(draft?.holdId && draft?.holdToken),
    },
  });

  const createReservation = useCreateRentalReservation();

  const form = useForm<z.infer<typeof driverSchema>>({
    resolver: zodResolver(driverSchema),
    defaultValues: draft?.driver || {
      fullName: customer?.fullName || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      romanizedName: "",
      nationality: "",
      flightNumber: "",
      accommodation: "",
    },
  });

  const priceQuote = useCalculateRentalPrice();

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
    if (customer?.email) form.setValue("email", customer.email);
    if (customer?.fullName && !form.getValues("fullName")) form.setValue("fullName", customer.fullName);
    if (customer?.phone && !form.getValues("phone")) form.setValue("phone", customer.phone);
  }, [customer?.email, customer?.fullName, customer?.phone, form]);

  useEffect(() => {
    if (draft) {
      priceQuote.mutate({
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
  }, [draft?.vehicleId, draft?.pickupAt, draft?.returnAt, draft?.pickupLocation, draft?.returnLocation, JSON.stringify(selectedAddons)]);

  const priceData = priceQuote.data;

  if (!draft) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center space-y-4">
        <h1 className="text-2xl font-serif">No active checkout</h1>
        <p className="text-muted-foreground">Please select a vehicle first.</p>
        <Button onClick={() => setLocation(localizedPath("/rentalcar/cars", language))}>View Fleet</Button>
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
      if (isMarketplaceConfigLoading || !marketplaceConfig) {
        toast({
          title: "Document settings unavailable",
          description: isMarketplaceConfigError ? "Could not check secure document settings. Please try again." : "Checking document settings. Please try again shortly.",
          variant: "destructive",
        });
        return;
      }
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
    if (isMarketplaceConfigLoading || !marketplaceConfig) {
      toast({
        title: "Booking unavailable",
        description: isMarketplaceConfigError ? "Could not verify document settings. Please try again." : "Checking document settings. Please try again shortly.",
        variant: "destructive",
      });
      return;
    }
    if (!draft.holdId || !draft.holdToken || holdExpired) {
      toast({ title: "Error", description: "Hold expired or invalid", variant: "destructive" });
      return;
    }
    
    createReservation.mutate({
      data: {
        holdId: draft.holdId,
        holdToken: draft.holdToken,
        vehicleId: draft.vehicleId,
        pickupAt: draft.pickupAt,
        returnAt: draft.returnAt,
        pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation,
        driver: draft.driver,
        additionalDrivers: draft.additionalDrivers ? [additionalDriver] : [],
         addons: Object.entries(selectedAddons)
           .filter(([, qty]) => qty > 0)
           .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
        source: "web",
      }
    }, {
      onSuccess: (reservation) => {
        queryClient.invalidateQueries({ queryKey: ["rental", "customer-account"] });
        window.sessionStorage.setItem("ciao_rental_confirmation", JSON.stringify({
          reservation,
           selectedRoom: draft.selectedRoom ?? null,
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
        setLocation(`${localizedPath("/rentalcar/booking/confirmation", language)}?id=${reservation.id}`);
      },
      onError: (err) => {
        toast({ title: "Booking failed", description: err.message || "Please try again later.", variant: "destructive" });
      }
    });
  };

  const steps = [
    "Add-ons",
    "Driver Info",
    documentCopy[language].title,
    "Pickup Details",
    "Summary",
    payment.step
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
                {((tokyoHour(draft.pickupAt) ?? 10) < 8 || (tokyoHour(draft.pickupAt) ?? 10) >= 19) && (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm">
                    Your pickup is outside normal desk hours. An after-hours service fee may apply.
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Pickup</div>
                      <div className="font-bold text-lg">{formatTokyo(draft.pickupAt, language)}</div>
                      <div className="text-sm text-muted-foreground">{locationLabel(draft.pickupLocation)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Return</div>
                      <div className="font-bold text-lg">{formatTokyo(draft.returnAt, language)}</div>
                      <div className="text-sm text-muted-foreground">{locationLabel(draft.returnLocation)}</div>
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
                        <h3 className="font-serif font-bold text-xl">{localizedCar?.title || car.model}</h3>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5"><Car className="w-4 h-4"/> {car.seats} {copy.passengers}</p>
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
                  <h2 className="text-2xl font-serif font-bold">{copy.enhanceTrip}</h2>
                  <p className="text-muted-foreground">{copy.enhanceTripHelp}</p>
                </div>
                <div className="space-y-4">
                  <AddonSelector addons={addons ?? []} selected={selectedAddons} onChange={setSelectedAddons} />
                  {!addons?.length && (
                    <div className="p-8 text-center bg-white border rounded-xl text-muted-foreground">
                      {copy.noAddons}
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
                            <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input type="email" readOnly className="bg-muted" {...field} value={customer?.email || field.value} /></FormControl><FormMessage /></FormItem>
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
                  <h2 className="text-2xl font-serif font-bold">{documentCopy[language].title}</h2>
                  <p className="text-muted-foreground">{isMarketplaceConfigLoading ? documentCopy[language].checking : isMarketplaceConfigError ? documentCopy[language].retry : marketplaceConfig?.privateDocumentUploadAvailable ? documentCopy[language].upload : documentCopy[language].pickup}</p>
                </div>
                {(car?.requiredDocuments?.length ? car.requiredDocuments : ["drivers_license", "passport"]).map((document, index) => (
                  <Card key={`${document}-${index}`}>
                    <CardContent className="p-5 font-medium">{documentName(document, language)}</CardContent>
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
                            <span className="font-medium">{formatTokyo(draft.pickupAt, language)}</span><br/>
                            <span className="text-xs text-muted-foreground">{locationLabel(draft.pickupLocation)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">Return</span>
                            <span className="font-medium">{formatTokyo(draft.returnAt, language)}</span><br/>
                            <span className="text-xs text-muted-foreground">{locationLabel(draft.returnLocation)}</span>
                          </div>
                        </div>
                      </div>
                      {draft.selectedRoom && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Stay planning</p>
                          <p className="mt-1 font-semibold">{draft.selectedRoom.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Room availability is confirmed separately by the PrimoStay Car Rental team.
                          </p>
                        </div>
                      )}
                      {priceData?.addons && priceData.addons.length > 0 && (
                        <div>
                          <h3 className="font-bold text-lg mb-4 border-b pb-2">Selected add-ons</h3>
                          <div className="space-y-2 text-sm">
                            {priceData.addons.map((addon) => (
                              <div key={addon.addonId} className="flex justify-between gap-4">
                                <span>{addonName(addon.addonId, addon.name)} × {addon.qty}</span>
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
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 6: Payment */}
            {step === 6 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{payment.step}</h2>
                </div>
                
                <Card>
                  <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                      <Mail className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-xl">{payment.title}</h3>
                    <p className="text-muted-foreground max-w-sm">
                      {payment.message}
                    </p>
                    <div className="w-full max-w-sm rounded-lg bg-muted/50 px-4 py-3 text-left">
                      <div className="flex items-center justify-between gap-4 font-semibold">
                        <span>{payment.total}</span>
                        <span className="tabular-nums">{priceData ? `¥${priceData.finalTotal.toLocaleString()}` : copy.calculating}</span>
                      </div>
                    </div>
                    
                    <div className="pt-6 w-full max-w-sm text-left">
                      <div className="flex items-start gap-3">
                        <Checkbox id="terms" checked={agreedTerms} onCheckedChange={(c) => setAgreedTerms(!!c)} />
                        <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug">
                          {payment.consentBefore}<a href={localizedPath("/terms", language)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">{payment.terms}</a>{payment.consentBetween}<a href={localizedPath("/privacy-policy", language)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">{payment.privacy}</a>{payment.consentAfter}
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
                <Button onClick={handleNext} className="gap-2" size="lg" disabled={step === 3 && (isMarketplaceConfigLoading || isMarketplaceConfigError || !marketplaceConfig)}>
                  Continue <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleConfirm} disabled={!agreedTerms || !priceData || createReservation.isPending || isMarketplaceConfigLoading || isMarketplaceConfigError || !marketplaceConfig} className="gap-2 px-8" size="lg">
                  {createReservation.isPending ? payment.submitting : payment.submit} <Check className="w-4 h-4" />
                </Button>
              )}
            </div>

          </div>

          {/* Sidebar / Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-serif font-bold text-lg">{copy.bookingSummary}</h3>
                </div>
                
                {car && (
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-12 bg-muted rounded overflow-hidden">
                      <img src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"} alt={car.model} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-bold text-sm leading-tight">{localizedCar?.title || car.model}</div>
                      <div className="text-xs text-muted-foreground">{car.vehicleClass}</div>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-3 text-sm">
                  {priceData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{copy.rental} ({priceData.days} {copy.days})</span>
                        <span>¥{priceData.subtotal.toLocaleString()}</span>
                      </div>
                      {priceData.addonsTotal > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{copy.addons}</span>
                            <span>¥{priceData.addonsTotal.toLocaleString()}</span>
                          </div>
                          {priceData.addons?.map((addon) => (
                            <div key={addon.addonId} className="flex justify-between pl-3 text-xs">
                              <span className="text-muted-foreground">{addonName(addon.addonId, addon.name)} × {addon.qty}</span>
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
                      {(priceData as any).pickupLocationFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Pickup Location Fee</span><span>¥{(priceData as any).pickupLocationFee.toLocaleString()}</span></div>}
                      {(priceData as any).returnLocationFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Return Location Fee</span><span>¥{(priceData as any).returnLocationFee.toLocaleString()}</span></div>}
                      {(priceData as any).oneWayFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">One-way Fee</span><span>¥{(priceData as any).oneWayFee.toLocaleString()}</span></div>}
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold text-lg">
                        <span>{payment.total}</span>
                        <span>¥{priceData.finalTotal.toLocaleString()}</span>
                      </div>
                    </>
                  ) : priceQuote.isError ? (
                    <div className="space-y-3 py-3 text-center text-sm text-destructive">
                      <p>{language === "ja" ? "料金を計算できませんでした。" : language === "zh-TW" ? "無法計算價格。" : "We could not calculate the total."}</p>
                      <Button variant="outline" size="sm" onClick={() => priceQuote.mutate({ data: { vehicleId: draft.vehicleId, pickupAt: draft.pickupAt, returnAt: draft.returnAt, pickupLocation: draft.pickupLocation, returnLocation: draft.returnLocation, addons: Object.entries(selectedAddons).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ addonId: Number(id), qty })) } })}>{language === "ja" ? "再試行" : language === "zh-TW" ? "重試" : "Try again"}</Button>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      {copy.calculating}
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
        <Button className="w-full" onClick={() => { clearDraft(); setLocation(`${localizedPath("/rentalcar", language)}?hold=expired`); }}>Return to search</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
