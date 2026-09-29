import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useMyBookingDetail,
  useSubmitBookingDocuments,
  useUploadPrivateBookingDocument,
  useCancelBookingRequest,
  useRentalMarketplaceConfig,
  useAcknowledgeTripCharges,
} from "@/hooks/use-rental-operations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FileCheck, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localizedPath, useLanguage } from "@/lib/language";
import { Ledger, TripRecordSummary } from "@/components/rental/TripWorkflow";

export function MyBookingDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { language } = useLanguage();
  
  const { data: res, isLoading } = useMyBookingDetail(id);
  const docMut = useSubmitBookingDocuments();
  const privateDocMut = useUploadPrivateBookingDocument();
  const cancelMut = useCancelBookingRequest();
  const acknowledgeChargesMut = useAcknowledgeTripCharges();
  const { data: marketplaceConfig, isLoading: isMarketplaceConfigLoading, isError: isMarketplaceConfigError } = useRentalMarketplaceConfig();
  const { toast } = useToast();

  const [docType, setDocType] = useState<"passport" | "drivers_license" | "international_license">("passport");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [chargeAcknowledgements, setChargeAcknowledgements] = useState<Record<string, boolean>>({});

  if (isLoading) return <div className="p-8 text-center min-h-[60vh]">Loading booking details...</div>;
  if (!res) return <div className="p-8 text-center text-destructive min-h-[60vh]">Booking not found or email doesn't match.</div>;
  const authorizedDrivers = Array.isArray(res.drivers) && res.drivers.length > 0
    ? res.drivers
    : res.driver ? [res.driver] : [];
  const uploadDriverId = Number(selectedDriverId || authorizedDrivers[0]?.id);

  const handleDocSubmit = () => {
    if (isMarketplaceConfigLoading || !marketplaceConfig) {
      toast({
        title: "Document upload unavailable",
        description: isMarketplaceConfigError ? "Could not check secure upload availability. Please try again." : "Checking secure upload availability. Please try again shortly.",
        variant: "destructive",
      });
      return;
    }
    if (marketplaceConfig.enabled) {
      if (!documentFile) {
        toast({ title: "Choose a document file", variant: "destructive" });
        return;
      }
      if (!["application/pdf", "image/jpeg", "image/png"].includes(documentFile.type)) {
        toast({ title: "Unsupported file type", description: "Choose a PDF, JPEG, or PNG file.", variant: "destructive" });
        return;
      }
      if (documentFile.size > 10 * 1024 * 1024) {
        toast({ title: "File is too large", description: "Documents must be 10 MB or smaller.", variant: "destructive" });
        return;
      }
      privateDocMut.mutate({ id, driverId: uploadDriverId, docType, file: documentFile }, {
        onSuccess: () => {
          toast({ title: "Document submitted" });
          setDocumentFile(null);
        },
        onError: (err: Error) => toast({ title: "Upload failed", description: err.message, variant: "destructive" })
      });
      return;
    }
    if (!fileUrl) {
      toast({ title: "Provide a document URL", variant: "destructive" });
      return;
    }
    docMut.mutate({ id, data: { docType, fileUrl } }, {
      onSuccess: () => {
        toast({ title: "Document submitted" });
        setFileUrl("");
      },
      onError: (err: any) => toast({ title: "Upload failed", description: err.message, variant: "destructive" })
    });
  };

  const handleCancelRequest = () => {
    if (confirm("Are you sure you want to request cancellation for this booking?")) {
      cancelMut.mutate({ id, data: { reason: "Customer requested" } }, {
        onSuccess: () => toast({ title: "Cancellation requested" }),
        onError: (err: any) => toast({ title: "Request failed", description: err.message, variant: "destructive" })
      });
    }
  };

  const submitChargeAcknowledgements = () => {
    const selected = (res.trip?.provisionalCharges ?? [])
      .filter((charge: Record<string, any>) => chargeAcknowledgements[String(charge.code)] && !charge.customerAcknowledged)
      .map((charge: Record<string, any>) => ({ code: String(charge.code), amount: Number(charge.amount) }));
    if (!selected.length) return;
    acknowledgeChargesMut.mutate({ id, charges: selected }, {
      onSuccess: () => {
        setChargeAcknowledgements({});
        toast({ title: "Charge acknowledgment recorded", description: "This records acknowledgment of the listed amount; it does not collect payment." });
      },
      onError: (error: Error) => toast({ title: "Could not acknowledge charges", description: error.message, variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 min-h-[80vh]">
      <div className="flex items-center gap-4">
        <Link href={localizedPath("/rentalcar/my-bookings", language)}>
          <Button variant="outline" size="icon"><ChevronLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-serif font-bold text-primary">Booking #{res.id}</h1>
            <Badge variant={res.status === 'confirmed' ? 'default' : res.status === 'cancelled' ? 'destructive' : 'secondary'} className="text-sm">
              {res.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground">{res.driver?.fullName} • {res.driver?.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Itinerary Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pickup</p>
                <p className="font-medium text-lg">{new Date(res.pickupAt).toLocaleString()}</p>
                <p className="text-sm">{res.pickupLocation}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Return</p>
                <p className="font-medium text-lg">{new Date(res.returnAt).toLocaleString()}</p>
                <p className="text-sm">{res.returnLocation}</p>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <h3 className="font-semibold mb-2">Payment Summary</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Base Rate</span> <span>¥{Number(res.subtotal).toLocaleString()}</span></div>
                {res.addonsTotal > 0 && <div className="flex justify-between"><span>Add-ons</span> <span>¥{res.addonsTotal.toLocaleString()}</span></div>}
                <div className="flex justify-between"><span>Taxes & Fees</span> <span>¥{(Number(res.tax || 0) + Number(res.deliveryFee || 0)).toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base pt-2 mt-2 border-t">
                  <span>Booking total</span>
                  <span>¥{Number(res.finalTotal).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" /> Upload ID
              </CardTitle>
              <CardDescription>Required before pickup.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select
                  value={docType}
                  onValueChange={(value) => setDocType(value as typeof docType)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="drivers_license">Driver's License</SelectItem>
                    <SelectItem value="international_license">Intl. License</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {marketplaceConfig?.enabled && authorizedDrivers.length > 0 && <div className="space-y-2">
                <Label htmlFor="booking-document-driver">Authorized driver</Label>
                <Select value={String(uploadDriverId)} onValueChange={setSelectedDriverId}>
                  <SelectTrigger id="booking-document-driver" data-testid="select-booking-document-driver"><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>{authorizedDrivers.map((authorizedDriver: Record<string, any>) => <SelectItem key={authorizedDriver.id} value={String(authorizedDriver.id)}>{authorizedDriver.fullName || `Driver #${authorizedDriver.id}`}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Submit each driver’s documents under that authorized driver. Originals are still checked in person at pickup.</p>
              </div>}
              {marketplaceConfig?.enabled && authorizedDrivers.length === 0 && <p role="alert" className="text-sm text-destructive">Authorized drivers are unavailable. Contact the rental operator before uploading documents.</p>}
              <div className="space-y-2">
                {isMarketplaceConfigLoading ? (
                  <p className="text-sm text-muted-foreground">Checking secure document upload...</p>
                ) : isMarketplaceConfigError || !marketplaceConfig ? (
                  <p className="text-sm text-destructive">Secure document upload availability could not be checked. Please refresh and try again.</p>
                ) : marketplaceConfig.enabled ? (
                  <>
                    <Label htmlFor="booking-document-file">Document file</Label>
                    <Input
                      id="booking-document-file"
                      data-testid="input-booking-document-file"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                      onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs text-muted-foreground">PDF, JPEG, or PNG; maximum 10 MB.</p>
                    {documentFile && <p className="text-sm text-muted-foreground">{documentFile.name}</p>}
                  </>
                ) : (
                  <>
                    <Label>File URL (Demo)</Label>
                    <Input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="https://..." />
                  </>
                )}
              </div>
              <Button className="w-full" onClick={handleDocSubmit} disabled={docMut.isPending || privateDocMut.isPending || isMarketplaceConfigLoading || isMarketplaceConfigError || !marketplaceConfig || (marketplaceConfig.enabled && !uploadDriverId)}>
                Submit Document
              </Button>
            </CardContent>
          </Card>

          {['pending', 'confirmed'].includes(res.status) && (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="pt-6">
                <Button variant="destructive" className="w-full gap-2" onClick={handleCancelRequest} disabled={cancelMut.isPending}>
                  <XCircle className="w-4 h-4" /> Cancel Booking
                </Button>
                <p className="text-xs text-center mt-2 text-muted-foreground">Cancellation fees may apply.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {res.trip && <section data-testid={`section-trip-receipt-${res.id}`} className="space-y-5 rounded-xl border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold">Trip condition & receipt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Inspection evidence and ledger entries are shown as recorded. A provisional amount is not a collected payment.</p>
        </div>
        <TripRecordSummary trip={res.trip} />
        {Array.isArray(res.trip.provisionalCharges) && res.trip.provisionalCharges.length > 0 && <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-950">Provisional charges — not collected</h3>
          <p className="mt-1 text-sm text-amber-900">Acknowledging a claim confirms you reviewed the specific provisional amount. It does not approve payment or mean the amount was collected.</p>
          <ul className="mt-3 space-y-3 text-sm">{res.trip.provisionalCharges.map((charge: Record<string, any>, index: number) => <li key={charge.code ?? index} className="flex flex-wrap items-start justify-between gap-3 border-t border-amber-200 pt-3">
            <div>
              <p>{charge.description ?? charge.code ?? "Return discrepancy"} <span className="text-amber-800">· {charge.status ?? "provisional"}</span></p>
              {charge.customerAcknowledged ? <p className="mt-1 text-xs font-medium text-emerald-800">Acknowledgment recorded · not payment</p>
                : Number(charge.amount) > 0 && <label className="mt-2 flex items-center gap-2 text-xs"><input data-testid={`check-acknowledge-charge-${charge.code}`} type="checkbox" checked={Boolean(chargeAcknowledgements[String(charge.code)])} onChange={(event) => setChargeAcknowledgements((current) => ({ ...current, [String(charge.code)]: event.target.checked }))} />I acknowledge reviewing this provisional amount</label>}
            </div>
            <strong>¥{Number(charge.amount ?? 0).toLocaleString()}</strong>
          </li>)}</ul>
          {res.status === "return_completed" && <Button data-testid="button-acknowledge-trip-charges" className="mt-4" onClick={submitChargeAcknowledgements} disabled={acknowledgeChargesMut.isPending || !res.trip.provisionalCharges.some((charge: Record<string, any>) => chargeAcknowledgements[String(charge.code)] && !charge.customerAcknowledged)}>
            {acknowledgeChargesMut.isPending ? "Recording acknowledgment…" : "Acknowledge selected amounts"}
          </Button>}
        </section>}
        <Ledger ledger={res.trip.ledger} />
        {res.trip.operatorContact && <div className="border-t pt-4 text-sm">
          <h3 className="font-semibold">Rental operator contact</h3>
          <p>{res.trip.operatorContact.name}</p>
          {res.trip.operatorContact.email && <p><a className="underline" href={`mailto:${res.trip.operatorContact.email}`}>{res.trip.operatorContact.email}</a></p>}
          {res.trip.operatorContact.phone && <p><a className="underline" href={`tel:${res.trip.operatorContact.phone}`}>{res.trip.operatorContact.phone}</a></p>}
        </div>}
      </section>}
    </div>
  );
}
