import { Link } from "wouter";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BookingSuccessPage() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md w-full bg-background rounded-xl p-8 text-center space-y-6 shadow-lg border">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h1 className="font-serif text-3xl font-bold">Booking Confirmed</h1>
        <p className="text-muted-foreground">
          Thank you for choosing CIAO Rental Car. We have sent your booking details to your email address.
        </p>
        <div className="pt-6 border-t flex flex-col gap-3">
          <Link href="/">
            <Button className="w-full">Return Home</Button>
          </Link>
          <Link href="/cars">
            <Button variant="outline" className="w-full">View Fleet</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}