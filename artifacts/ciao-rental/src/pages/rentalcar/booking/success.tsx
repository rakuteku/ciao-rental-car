import { Link, useSearch } from "wouter";
import { CheckCircle2, MapPin, Upload, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export function BookingSuccessPage() {
  const search = useSearch();
  const reservationId = new URLSearchParams(search).get("id") ?? "Pending";
  const confirmation = (() => {
    try {
      return JSON.parse(window.sessionStorage.getItem("ciao_rental_confirmation") ?? "null") as {
        reservation?: { finalTotal?: number; outstanding?: number; id?: number };
        draft?: { pickupAt?: string; returnAt?: string; pickupLocation?: string; returnLocation?: string; documents?: Record<string, string> };
        vehicle?: { title?: string; image?: string };
      } | null;
    } catch {
      return null;
    }
  })();
  const bookingNumber = `CIAO-${String(confirmation?.reservation?.id ?? reservationId).padStart(6, "0")}`;

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
          <h1 className="font-serif text-4xl font-bold tracking-tight">Booking Confirmed</h1>
          <p className="font-mono text-sm text-muted-foreground">Booking reference: {bookingNumber}</p>
        </div>
        <p className="text-center text-muted-foreground leading-relaxed">
          Thank you for choosing CIAO. We have sent your booking details and pickup instructions to your email address.
        </p>
        <div className="grid gap-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-4 rounded-lg border p-5">
            <h2 className="font-serif text-xl font-bold">{confirmation?.vehicle?.title ?? "Your CIAO vehicle"}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs uppercase text-muted-foreground">Pickup</p><p>{confirmation?.draft?.pickupAt ? format(new Date(confirmation.draft.pickupAt), "MMM d, yyyy · HH:mm") : "See booking email"}</p><p className="text-muted-foreground">{confirmation?.draft?.pickupLocation}</p></div>
              <div><p className="text-xs uppercase text-muted-foreground">Return</p><p>{confirmation?.draft?.returnAt ? format(new Date(confirmation.draft.returnAt), "MMM d, yyyy · HH:mm") : "See booking email"}</p><p className="text-muted-foreground">{confirmation?.draft?.returnLocation}</p></div>
            </div>
            <div className="flex justify-between border-t pt-4 text-sm"><span>Paid today</span><strong>¥0</strong></div>
            <div className="flex justify-between text-sm"><span>Outstanding at pickup</span><strong>¥{(confirmation?.reservation?.outstanding ?? confirmation?.reservation?.finalTotal ?? 0).toLocaleString()}</strong></div>
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
          <Link href="/rentalcar/my-bookings?section=documents"><Button variant="outline" className="w-full">Upload documents</Button></Link>
          <Link href="/rentalcar/my-bookings"><Button variant="outline" className="w-full">My bookings</Button></Link>
          <Link href="/rentalcar">
            <Button className="w-full" size="lg">Return to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
