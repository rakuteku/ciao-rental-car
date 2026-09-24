import { useRoute, Link } from "wouter";
import { useAdminReservation, useUpdateAdminReservation, useReviewAdminDocument } from "@/hooks/use-rental-operations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Car, Calendar, User, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export function AdminReservationDetail() {
  const [, params] = useRoute("/admin/rental-cars/reservations/:id");
  const id = Number(params?.id);
  const { data: res, isLoading } = useAdminReservation(id);
  const updateMut = useUpdateAdminReservation();
  const reviewDocument = useReviewAdminDocument();
  const { toast } = useToast();

  const [notes, setNotes] = useState("");
  const initRef = useRef(false);

  useEffect(() => {
    if (res && !initRef.current) {
      setNotes(res.internalNotes || "");
      initRef.current = true;
    }
  }, [res]);

  if (isLoading) return <div className="p-8 text-center">Loading reservation...</div>;
  if (!res) return <div className="p-8 text-center text-destructive">Reservation not found</div>;

  const handleSaveNotes = () => {
    updateMut.mutate({ id, data: { internalNotes: notes } }, {
      onSuccess: () => toast({ title: "Notes saved" }),
      onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/rental-cars/reservations">
          <Button variant="outline" size="icon"><ChevronLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-serif font-bold">Reservation #{res.id}</h1>
            <Badge variant={res.status === 'confirmed' || res.status === 'in_rental' ? 'default' : res.status === 'cancelled' ? 'destructive' : 'secondary'}>{res.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">Created {new Date(res.createdAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Calendar className="w-5 h-5" /> Itinerary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pickup</p>
                <p className="font-medium">{new Date(res.pickupAt).toLocaleString()}</p>
                <p className="text-sm">{res.pickupLocation}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Return</p>
                <p className="font-medium">{new Date(res.returnAt).toLocaleString()}</p>
                <p className="text-sm">{res.returnLocation}</p>
              </div>
            </div>
            {res.status === 'confirmed' && (
              <Link href={`/admin/rental-cars/reservations/${id}/pickup`}>
                <Button className="w-full mt-2">Start Pickup Process</Button>
              </Link>
            )}
            {res.status === 'in_rental' && (
              <Link href={`/admin/rental-cars/reservations/${id}/return`}>
                <Button className="w-full mt-2">Start Return Process</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Document verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {res.documents?.length ? res.documents.map((document: any) => (
              <div className="rounded border p-3 space-y-2" key={document.id}>
                <div className="flex items-center justify-between gap-2"><a className="font-medium underline" href={document.fileUrl} target="_blank" rel="noreferrer">{document.docType.replace("_", " ")}</a><Badge variant="outline">{document.status}</Badge></div>
                {document.adminNotes && <p className="text-sm text-muted-foreground">{document.adminNotes}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => reviewDocument.mutate({ id: document.id, data: { status: "approved" } }, { onSuccess: () => toast({ title: "Document approved" }) })}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => reviewDocument.mutate({ id: document.id, data: { status: "resubmit_required", adminNotes: "Please upload a clearer or valid document." } }, { onSuccess: () => toast({ title: "Resubmission requested" }) })}>Request resubmission</Button>
                  <Button size="sm" variant="destructive" onClick={() => reviewDocument.mutate({ id: document.id, data: { status: "rejected", adminNotes: "Document rejected by rental staff." } }, { onSuccess: () => toast({ title: "Document rejected" }) })}>Reject</Button>
                </div>
              </div>
            )) : <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><User className="w-5 h-5" /> Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><span className="text-muted-foreground inline-block w-24">Name:</span> {res.driver?.fullName}</p>
            <p><span className="text-muted-foreground inline-block w-24">Email:</span> {res.driver?.email}</p>
            <p><span className="text-muted-foreground inline-block w-24">Phone:</span> {res.driver?.phone}</p>
            {res.driver?.flightNumber && <p><span className="text-muted-foreground inline-block w-24">Flight:</span> {res.driver.flightNumber}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Car className="w-5 h-5" /> Vehicle & Addons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p><span className="text-muted-foreground inline-block w-24">Vehicle ID:</span> #{res.vehicleId}</p>
            {res.addons && res.addons.length > 0 ? (
              <div className="mt-4">
                <p className="font-medium text-sm mb-2">Addons:</p>
                <ul className="space-y-1 text-sm">
                  {res.addons.map((a: any) => (
                    <li key={a.id} className="flex justify-between">
                      <span>{a.qty}x Addon #{a.addonId}</span>
                      <span>¥{Number(a.totalPrice).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : <p className="text-sm text-muted-foreground mt-4">No addons selected</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="w-5 h-5" /> Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline">{res.paymentStatus}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>¥{Number(res.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Taxes & Fees</span>
              <span>¥{(Number(res.tax || 0) + Number(res.deliveryFee || 0)).toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-bold mt-2 pt-2 border-t">
              <span>Total</span>
              <span>¥{Number(res.finalTotal).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Internal Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
              placeholder="Add staff notes here (not visible to customer)..."
              className="min-h-[100px] mb-4"
            />
            <Button onClick={handleSaveNotes} disabled={updateMut.isPending}>Save Notes</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
