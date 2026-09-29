import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useMyBookingDetail,
  useSubmitBookingDocuments,
  useUploadPrivateBookingDocument,
  useCancelBookingRequest,
  useRentalMarketplaceConfig,
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

export function MyBookingDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { language } = useLanguage();
  
  const { data: res, isLoading } = useMyBookingDetail(id);
  const docMut = useSubmitBookingDocuments();
  const privateDocMut = useUploadPrivateBookingDocument();
  const cancelMut = useCancelBookingRequest();
  const { data: marketplaceConfig, isLoading: isMarketplaceConfigLoading, isError: isMarketplaceConfigError } = useRentalMarketplaceConfig();
  const { toast } = useToast();

  const [docType, setDocType] = useState<"passport" | "drivers_license" | "international_license">("passport");
  const [fileUrl, setFileUrl] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  if (isLoading) return <div className="p-8 text-center min-h-[60vh]">Loading booking details...</div>;
  if (!res) return <div className="p-8 text-center text-destructive min-h-[60vh]">Booking not found or email doesn't match.</div>;

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
      privateDocMut.mutate({ id, docType, file: documentFile }, {
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
                  <span>Total Paid</span>
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
              <Button className="w-full" onClick={handleDocSubmit} disabled={docMut.isPending || privateDocMut.isPending || isMarketplaceConfigLoading || isMarketplaceConfigError || !marketplaceConfig}>
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
    </div>
  );
}
