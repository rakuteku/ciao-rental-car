import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search } from "lucide-react";
import { useBookingLookup } from "@/hooks/use-rental-operations";

export function MyBookings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const lookup = useBookingLookup();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    if (bookingId) {
      lookup.mutate({ email, bookingId, accessCode }, { onSuccess: () => setLocation(`/rentalcar/my-bookings/${bookingId}`), onError: (error: Error) => toast({ title: "Booking not found", description: error.message, variant: "destructive" }) });
    } else {
      // In a real app we might have a list view, but here we just need one ID
      toast({ title: "Please provide a Booking ID", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 bg-muted/20">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-serif text-primary">Find My Booking</CardTitle>
          <CardDescription>Enter your email and booking ID to view or manage your reservation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="hello@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessCode">Booking access code</Label>
              <Input id="accessCode" required value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="From your confirmation email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bookingId">Booking ID (Order #)</Label>
              <Input 
                id="bookingId" 
                type="text" 
                required 
                value={bookingId} 
                onChange={e => setBookingId(e.target.value)} 
                placeholder="e.g. 1024"
              />
            </div>
            <Button type="submit" disabled={lookup.isPending} className="w-full h-12 text-md mt-4 gap-2">
              <Search className="w-4 h-4" /> Look Up Booking
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
