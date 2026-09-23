import { Link, useSearch } from "wouter";
import { CheckCircle2, MapPin, Upload, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { localizedPath, useLanguage } from "@/lib/language";

export function BookingSuccessPage() {
  const search = useSearch();
  const reservationId = Number(new URLSearchParams(search).get("id"));
  const { language } = useLanguage();
  const confirmation = (() => {
    try {
      return JSON.parse(window.sessionStorage.getItem("ciao_rental_confirmation") ?? "null") as {
        reservation?: { finalTotal?: number; outstanding?: number; id?: number };
        selectedRoom?: { title?: string; startingPrice?: number } | null;
        pricing?: { addons?: Array<{ addonId: number; name: string; qty: number; totalPrice: number }>; addonsTotal?: number };
        draft?: { pickupAt?: string; returnAt?: string; pickupLocation?: string; returnLocation?: string; documents?: Record<string, string> };
        vehicle?: { title?: string; image?: string };
      } | null;
    } catch {
      return null;
    }
  })();
  const isValidConfirmation = Number.isInteger(reservationId) && reservationId > 0 && confirmation?.reservation?.id === reservationId;

  if (!isValidConfirmation) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border bg-background p-8 text-center shadow-sm">
          <h1 className="font-serif text-3xl font-bold">No booking confirmation found</h1>
          <p className="mt-3 text-muted-foreground">
            This confirmation link is missing or has expired. You can look up an existing booking or search for another vehicle.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href={localizedPath("/rentalcar/my-bookings", language)}>
              <Button variant="outline" className="w-full">My Bookings</Button>
            </Link>
            <Link href={localizedPath("/rentalcar", language)}>
              <Button className="w-full">Search Vehicles</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const bookingNumber = `CIAO-${String(confirmation.reservation?.id).padStart(6, "0")}`;

  return (
    <div className="min-h-[100dvh] p-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"
          alt="Sapporo winter road"
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-background/80" />
      </div>

      <div className="mx-auto max-w-3xl bg-background/95 backdrop-blur-sm rounded-xl p-6 md:p-10 space-y-7 shadow-2xl border border-primary/10 relative z-10 animate-in fade-in zoom-in duration-500">
        <div className="mx-auto w-20 h-20 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="space-y-3 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">CIAO Rental Car</p>
          <h1 className="font-serif text-4xl font-bold tracking-tight">Car Booking Confirmed</h1>
          <p className="font-mono text-sm text-muted-foreground">Booking reference: {bookingNumber}</p>
        </div>
        <p className="text-center text-muted-foreground leading-relaxed">
           Thank you for choosing CIAO. Your rental car is confirmed. Room availability is confirmed separately by the CIAO team.
        </p>
        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-4 rounded-lg border p-5">
            <h2 className="font-serif text-xl font-bold">{confirmation?.vehicle?.title ?? "Your CIAO vehicle"}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs uppercase text-muted-foreground">Pickup</p><p>{confirmation?.draft?.pickupAt ? format(new Date(confirmation.draft.pickupAt), "MMM d, yyyy · HH:mm") : "See booking email"}</p><p className="text-muted-foreground">{confirmation?.draft?.pickupLocation}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Return</p><p>{confirmation?.draft?.returnAt ? format(new Date(confirmation.draft.returnAt), "MMM d, yyyy · HH:mm") : "See booking email"}</p><p className="text-muted-foreground">{confirmation?.draft?.returnLocation}</p></div>
            </div>
             {confirmation?.pricing?.addons && confirmation.pricing.addons.length > 0 && (
               <div className="border-t pt-4 text-sm">
                 <p className="mb-2 text-xs uppercase text-muted-foreground">Add-ons</p>
                 <div className="space-y-1">
                   {confirmation.pricing.addons.map((addon) => (
                     <div key={addon.addonId} className="flex justify-between gap-4">
                       <span>{addon.name} × {addon.qty}</span>
                       <strong>¥{addon.totalPrice.toLocaleString()}</strong>
                     </div>
                   ))}
                 </div>
                 <div className="mt-2 flex justify-between border-t pt-2">
                   <span>Add-ons total</span>
                   <strong>¥{(confirmation.pricing.addonsTotal ?? 0).toLocaleString()}</strong>
                 </div>
               </div>
             )}
            <div className="flex justify-between border-t pt-4 text-sm"><span>Paid today</span><strong>¥0</strong></div>
            <div className="flex justify-between text-sm"><span>Outstanding at pickup</span><strong>¥{(confirmation?.reservation?.outstanding ?? confirmation?.reservation?.finalTotal ?? 0).toLocaleString()}</strong></div>
             {confirmation.selectedRoom?.title && (
               <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                 <p className="font-semibold">Stay planning</p>
                 <p className="mt-1">{confirmation.selectedRoom.title}</p>
                 <p className="mt-1 text-muted-foreground">Room availability is confirmed separately by staff.</p>
               </div>
             )}
            {(confirmation?.reservation as { customerAccessToken?: string } | undefined)?.customerAccessToken && <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><p className="font-semibold">Booking access code</p><p className="mt-1 break-all font-mono">{(confirmation?.reservation as { customerAccessToken?: string }).customerAccessToken}</p><p className="mt-1 text-muted-foreground">Keep this code with your booking ID to view or manage your reservation.</p></div>}
          </div>
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 p-5 text-center">
            <div className="grid h-28 w-28 place-items-center bg-[linear-gradient(90deg,#111_10%,transparent_10%,transparent_20%,#111_20%,#111_30%,transparent_30%,transparent_40%,#111_40%,#111_50%,transparent_50%,transparent_60%,#111_60%,#111_70%,transparent_70%,transparent_80%,#111_80%,#111_90%,transparent_90%)]"><QrCode className="h-12 w-12 bg-white p-1" /></div>
            <span className="text-xs text-muted-foreground">Present this booking QR at pickup</span>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-5 text-sm">
          <div className="flex gap-3"><Upload className="h-5 w-5" /><div><h2 className="font-semibold">Documents reminder</h2><p className="mt-1 text-muted-foreground">Bring your driver’s license and passport or photo ID. Upload documents before pickup to speed up collection.</p></div></div>
        </div>
        <div className="pt-2 grid gap-3 sm:grid-cols-3">
           <Link href={`${localizedPath("/rentalcar/my-bookings", language)}?section=documents`}><Button variant="outline" className="w-full">Upload documents</Button></Link>
           <Link href={localizedPath("/rentalcar/my-bookings", language)}><Button variant="outline" className="w-full">My bookings</Button></Link>
           <Link href={localizedPath("/rentalcar", language)}>
            <Button className="w-full" size="lg">Return to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
