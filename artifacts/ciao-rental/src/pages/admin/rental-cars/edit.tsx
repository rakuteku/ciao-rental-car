import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminRentalVehicle,
  useGetAdminRentalVehiclePricing,
  useCreateAdminRentalVehicle,
  useUpdateAdminRentalVehicle,
  useUpdateAdminRentalVehiclePricing,
  useAddAdminRentalVehicleImage,
  useUpdateAdminRentalVehicleImage,
  useDeleteAdminRentalVehicleImage,
  useReorderAdminRentalVehicleImages,
  useSetAdminRentalVehicleCoverImage,
  getGetAdminRentalVehiclesQueryKey,
  getGetAdminRentalVehicleQueryKey,
  getGetAdminRentalVehiclePricingQueryKey,
  type RentalVehicle,
  type RentalVehicleImage,
  type RentalVehiclePricing,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Star,
  Save,
} from "lucide-react";

function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "vehicle";
}

type VehicleFormData = {
  internalName: string;
  publicTitle: string;
  slug: string;
  brand: string;
  model: string;
  trim: string;
  year: number;
  color: string;
  plate: string;
  vin: string;
  vehicleClass: string;
  description: string;
  internalNotes: string;
  seats: number;
  recommendedPassengers: number;
  maxPassengers: number;
  smallLuggageCapacity: number;
  largeLuggageCapacity: number;
  doors: number;
  transmission: string;
  fuelType: string;
  driveType: string;
  engineSize: string;
  mileage: number | null;
  fuelPolicy: string;
  smokingPolicy: string;
  petPolicy: string;
  has4wd: boolean;
  hasWinterTires: boolean;
  hasSnowBrush: boolean;
  hasIceScraper: boolean;
  isSkiFriendly: boolean;
  hasSkiRack: boolean;
  hasHeatedSeats: boolean;
  hasHeatedSteering: boolean;
  hasEtc: boolean;
  hasNavigation: boolean;
  hasBackupCamera: boolean;
  hasBluetooth: boolean;
  hasUsbPort: boolean;
  hasLargeLuggageSpace: boolean;
  hasEtcCard: boolean;
  hasCarplay: boolean;
  hasAndroidAuto: boolean;
  hasChildSeatCompatible: boolean;
  canonicalUrl: string;
  deliveryLeadTimeHours: number | null;
  deliveryFeeOverride: number | null;
  status: string;
  featured: boolean;
  sortOrder: number;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  requireJapaneseLicense: boolean;
  requireForeignLicense: boolean;
  requireIdp: boolean;
  requirePassport: boolean;
  requireResidenceCard: boolean;
  requireSelfie: boolean;
  requireAdditionalDriverDocs: boolean;
  pickupLocations: string[];
  returnLocations: string[];
  afterHoursPickup: boolean;
  afterHoursReturn: boolean;
  useGlobalPickupSettings: boolean;
};

type PricingFormData = {
  basePrice: number;
  weekendPrice: number | null;
  holidayPrice: number | null;
  highSeasonPrice: number | null;
  winterSeasonPrice: number | null;
  weeklyDiscountPct: number;
  monthlyDiscountPct: number;
  minDays: number;
  maxDays: number | null;
  cleaningFee: number;
  deliveryFee: number;
  lateReturnFee: number;
  extraMileageFee: number;
  securityDeposit: number;
  taxIncluded: boolean;
  taxRate: number;
  airportPickupFee: number;
  airportDropoffFee: number;
  manualPriceOverride: boolean;
  manualPriceValue: number | null;
};

const defaultVehicle: VehicleFormData = {
  internalName: "",
  publicTitle: "",
  slug: "",
  brand: "Toyota",
  model: "",
  trim: "",
  year: new Date().getFullYear(),
  color: "",
  plate: "",
  vin: "",
  vehicleClass: "compact",
  description: "",
  internalNotes: "",
  seats: 5,
  recommendedPassengers: 4,
  maxPassengers: 5,
  smallLuggageCapacity: 2,
  largeLuggageCapacity: 2,
  doors: 4,
  transmission: "automatic",
  fuelType: "gasoline",
  driveType: "fwd",
  engineSize: "",
  mileage: null,
  fuelPolicy: "full_to_full",
  smokingPolicy: "no_smoking",
  petPolicy: "no_pets",
  has4wd: false,
  hasWinterTires: false,
  hasSnowBrush: false,
  hasIceScraper: false,
  isSkiFriendly: false,
  hasSkiRack: false,
  hasHeatedSeats: false,
  hasHeatedSteering: false,
  hasEtc: false,
  hasNavigation: false,
  hasBackupCamera: false,
  hasBluetooth: false,
  hasUsbPort: false,
  hasLargeLuggageSpace: false,
  hasEtcCard: false,
  hasCarplay: false,
  hasAndroidAuto: false,
  hasChildSeatCompatible: false,
  canonicalUrl: "",
  deliveryLeadTimeHours: null,
  deliveryFeeOverride: null,
  status: "draft",
  featured: false,
  sortOrder: 0,
  metaTitle: "",
  metaDescription: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  requireJapaneseLicense: true,
  requireForeignLicense: true,
  requireIdp: false,
  requirePassport: false,
  requireResidenceCard: false,
  requireSelfie: false,
  requireAdditionalDriverDocs: false,
  pickupLocations: ["sapporo_station", "new_chitose_airport", "sapporo_city_center"],
  returnLocations: ["sapporo_station", "new_chitose_airport", "sapporo_city_center"],
  afterHoursPickup: false,
  afterHoursReturn: false,
  useGlobalPickupSettings: true,
};

const defaultPricing: PricingFormData = {
  basePrice: 0,
  weekendPrice: null,
  holidayPrice: null,
  highSeasonPrice: null,
  winterSeasonPrice: null,
  weeklyDiscountPct: 0,
  monthlyDiscountPct: 0,
  minDays: 1,
  maxDays: null,
  cleaningFee: 0,
  deliveryFee: 0,
  lateReturnFee: 0,
  extraMileageFee: 0,
  securityDeposit: 0,
  taxIncluded: true,
  taxRate: 10,
  airportPickupFee: 0,
  airportDropoffFee: 0,
  manualPriceOverride: false,
  manualPriceValue: null,
};

function vehicleToForm(v: RentalVehicle): VehicleFormData {
  return {
    internalName: v.internalName,
    publicTitle: v.publicTitle,
    slug: v.slug,
    brand: v.brand,
    model: v.model,
    trim: v.trim ?? "",
    year: v.year,
    color: v.color ?? "",
    plate: v.plate ?? "",
    vin: v.vin ?? "",
    vehicleClass: v.vehicleClass,
    description: v.description ?? "",
    internalNotes: v.internalNotes ?? "",
    seats: v.seats,
    recommendedPassengers: v.recommendedPassengers,
    maxPassengers: v.maxPassengers,
    smallLuggageCapacity: v.smallLuggageCapacity,
    largeLuggageCapacity: v.largeLuggageCapacity,
    doors: v.doors,
    transmission: v.transmission,
    fuelType: v.fuelType,
    driveType: v.driveType,
    engineSize: v.engineSize ?? "",
    mileage: v.mileage ?? null,
    fuelPolicy: v.fuelPolicy,
    smokingPolicy: v.smokingPolicy,
    petPolicy: v.petPolicy,
    has4wd: v.has4wd,
    hasWinterTires: v.hasWinterTires,
    hasSnowBrush: v.hasSnowBrush,
    hasIceScraper: v.hasIceScraper,
    isSkiFriendly: v.isSkiFriendly,
    hasSkiRack: v.hasSkiRack,
    hasHeatedSeats: v.hasHeatedSeats,
    hasHeatedSteering: v.hasHeatedSteering,
    hasEtc: v.hasEtc,
    hasNavigation: v.hasNavigation,
    hasBackupCamera: v.hasBackupCamera,
    hasBluetooth: v.hasBluetooth,
    hasUsbPort: v.hasUsbPort,
    hasLargeLuggageSpace: v.hasLargeLuggageSpace,
    hasEtcCard: v.hasEtcCard,
    hasCarplay: v.hasCarplay,
    hasAndroidAuto: v.hasAndroidAuto,
    hasChildSeatCompatible: v.hasChildSeatCompatible,
    canonicalUrl: v.canonicalUrl ?? "",
    deliveryLeadTimeHours: v.deliveryLeadTimeHours ?? null,
    deliveryFeeOverride: v.deliveryFeeOverride ?? null,
    status: v.status,
    featured: v.featured,
    sortOrder: v.sortOrder,
    metaTitle: v.metaTitle ?? "",
    metaDescription: v.metaDescription ?? "",
    ogTitle: v.ogTitle ?? "",
    ogDescription: v.ogDescription ?? "",
    ogImage: v.ogImage ?? "",
    requireJapaneseLicense: v.requiredDocuments === null || v.requiredDocuments === undefined ? true : v.requiredDocuments.includes("japanese_license"),
    requireForeignLicense: v.requiredDocuments === null || v.requiredDocuments === undefined ? true : v.requiredDocuments.includes("foreign_license"),
    requireIdp: (v.requiredDocuments ?? []).includes("idp"),
    requirePassport: (v.requiredDocuments ?? []).includes("passport"),
    requireResidenceCard: (v.requiredDocuments ?? []).includes("residence_card"),
    requireSelfie: (v.requiredDocuments ?? []).includes("selfie"),
    requireAdditionalDriverDocs: (v.requiredDocuments ?? []).includes("additional_driver_docs"),
    pickupLocations: v.pickupLocations ?? ["sapporo_station", "new_chitose_airport", "sapporo_city_center"],
    returnLocations: v.returnLocations ?? ["sapporo_station", "new_chitose_airport", "sapporo_city_center"],
    afterHoursPickup: v.afterHoursPickup,
    afterHoursReturn: v.afterHoursReturn,
    useGlobalPickupSettings: v.useGlobalPickupSettings,
  };
}

function pricingToForm(p: RentalVehiclePricing): PricingFormData {
  return {
    basePrice: p.basePrice,
    weekendPrice: p.weekendPrice ?? null,
    holidayPrice: p.holidayPrice ?? null,
    highSeasonPrice: p.highSeasonPrice ?? null,
    winterSeasonPrice: p.winterSeasonPrice ?? null,
    weeklyDiscountPct: p.weeklyDiscountPct,
    monthlyDiscountPct: p.monthlyDiscountPct,
    minDays: p.minDays,
    maxDays: p.maxDays ?? null,
    cleaningFee: p.cleaningFee,
    deliveryFee: p.deliveryFee,
    lateReturnFee: p.lateReturnFee,
    extraMileageFee: p.extraMileageFee,
    securityDeposit: p.securityDeposit,
    taxIncluded: p.taxIncluded,
    taxRate: p.taxRate,
    airportPickupFee: p.airportPickupFee,
    airportDropoffFee: p.airportDropoffFee,
    manualPriceOverride: p.manualPriceOverride,
    manualPriceValue: p.manualPriceValue ?? null,
  };
}

function FieldSection({ title }: { title: string }) {
  return (
    <>
      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    </>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min = 0,
  max,
  nullable = false,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  nullable?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>
        )}
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          className={prefix ? "pl-7" : suffix ? "pr-12" : ""}
          value={value ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            if (nullable && val === "") {
              onChange(null);
            } else {
              const n = step < 1 ? parseFloat(val) : parseInt(val, 10);
              onChange(isNaN(n) ? (nullable ? null : 0) : n);
            }
          }}
          placeholder={nullable ? "Optional" : undefined}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(!!v)} />
      <Label htmlFor={id} className="font-normal cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

const PICKUP_LOCATIONS = [
  { value: "sapporo_station", label: "Sapporo Station" },
  { value: "new_chitose_airport", label: "New Chitose Airport" },
  { value: "sapporo_city_center", label: "Sapporo City Center" },
  { value: "hotel_delivery", label: "Hotel Delivery" },
];

function PhotosTab({
  vehicleId,
  images,
  onImagesChange,
}: {
  vehicleId?: number;
  images: RentalVehicleImage[];
  onImagesChange: (imgs: RentalVehicleImage[]) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newUrl, setNewUrl] = useState("");
  const [newCaption, setNewCaption] = useState("");
  const [editingCaptionId, setEditingCaptionId] = useState<number | null>(null);
  const [editingCaptionValue, setEditingCaptionValue] = useState("");

  const addImage = useAddAdminRentalVehicleImage();
  const updateImage = useUpdateAdminRentalVehicleImage();
  const deleteImage = useDeleteAdminRentalVehicleImage();
  const reorderImages = useReorderAdminRentalVehicleImages();
  const setCover = useSetAdminRentalVehicleCoverImage();

  function invalidate() {
    if (vehicleId) {
      queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehicleQueryKey(vehicleId) });
      queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehiclesQueryKey() });
    }
  }

  function handleAdd() {
    if (!newUrl.trim()) return;
    if (!vehicleId) {
      toast({ title: "Save the vehicle first before adding photos.", variant: "destructive" });
      return;
    }
    addImage.mutate(
      { id: vehicleId, data: { url: newUrl.trim(), caption: newCaption || undefined } },
      {
        onSuccess: (img) => {
          onImagesChange([...images, img]);
          setNewUrl("");
          setNewCaption("");
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Failed to add image.", variant: "destructive" }),
      }
    );
  }

  function handleDelete(imgId: number) {
    if (!vehicleId) return;
    deleteImage.mutate(
      { id: vehicleId, imgId },
      {
        onSuccess: () => {
          onImagesChange(images.filter((img) => img.id !== imgId));
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Failed to delete image.", variant: "destructive" }),
      }
    );
  }

  function handleMove(index: number, direction: -1 | 1) {
    if (!vehicleId) return;
    const newList = [...images];
    const target = index + direction;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    onImagesChange(newList);
    reorderImages.mutate(
      { id: vehicleId, data: { orderedIds: newList.map((i) => i.id) } },
      { onError: () => toast({ title: "Error", description: "Failed to reorder.", variant: "destructive" }) }
    );
  }

  function handleEditCaption(img: RentalVehicleImage) {
    setEditingCaptionId(img.id);
    setEditingCaptionValue(img.caption ?? "");
  }

  function handleSaveCaption(imgId: number) {
    if (!vehicleId) return;
    updateImage.mutate(
      { id: vehicleId, imgId, data: { caption: editingCaptionValue } },
      {
        onSuccess: (updated) => {
          onImagesChange(images.map((img) => img.id === imgId ? { ...img, caption: updated.caption } : img));
          setEditingCaptionId(null);
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Failed to update caption.", variant: "destructive" }),
      }
    );
  }

  function handleSetCover(imgId: number) {
    if (!vehicleId) return;
    setCover.mutate(
      { id: vehicleId, imgId },
      {
        onSuccess: () => {
          onImagesChange(images.map((img) => ({ ...img, isCover: img.id === imgId })));
          invalidate();
        },
        onError: () => toast({ title: "Error", description: "Failed to set cover.", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="space-y-5">
      {!vehicleId && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Save the vehicle first, then add photos.
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Image URL</Label>
          <Input
            placeholder="https://example.com/car-photo.jpg"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label>Caption (optional)</Label>
          <Input
            placeholder="Caption…"
            value={newCaption}
            onChange={(e) => setNewCaption(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="button" onClick={handleAdd} disabled={!newUrl.trim() || addImage.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {images.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8 border rounded-md border-dashed">
          No photos yet. Add a URL above.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((img, i) => (
          <div key={img.id} className="relative group rounded-lg overflow-hidden border bg-muted">
            <img src={img.url} alt={img.caption ?? `Photo ${i + 1}`} className="w-full h-32 object-cover" />
            {img.isCover && (
              <span className="absolute top-1 left-1 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded font-medium">
                Cover
              </span>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!img.isCover && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-6 w-6"
                  title="Set as cover"
                  onClick={() => handleSetCover(img.id)}
                >
                  <Star className="h-3 w-3" />
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-6 w-6"
                title="Move up"
                onClick={() => handleMove(i, -1)}
                disabled={i === 0}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-6 w-6"
                title="Move down"
                onClick={() => handleMove(i, 1)}
                disabled={i === images.length - 1}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-6 w-6"
                title="Delete"
                onClick={() => handleDelete(img.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {editingCaptionId === img.id ? (
              <div className="p-1.5 flex gap-1">
                <input
                  autoFocus
                  className="flex-1 text-xs border rounded px-1.5 py-0.5 bg-background"
                  value={editingCaptionValue}
                  onChange={(e) => setEditingCaptionValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveCaption(img.id);
                    if (e.key === "Escape") setEditingCaptionId(null);
                  }}
                  placeholder="Enter caption…"
                />
                <button
                  type="button"
                  className="text-xs px-1.5 py-0.5 bg-primary text-primary-foreground rounded"
                  onClick={() => handleSaveCaption(img.id)}
                  disabled={updateImage.isPending}
                >
                  ✓
                </button>
                <button
                  type="button"
                  className="text-xs px-1.5 py-0.5 bg-muted rounded"
                  onClick={() => setEditingCaptionId(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full text-left p-1.5 text-xs text-muted-foreground hover:bg-muted/60 transition-colors"
                onClick={() => handleEditCaption(img)}
                title="Click to edit caption"
              >
                {img.caption || <span className="italic opacity-60">Add caption…</span>}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function getRequiredFieldErrors(form: VehicleFormData): string[] {
  const errs: string[] = [];
  if (!form.internalName) errs.push("Internal name is required");
  if (!form.publicTitle) errs.push("Public title is required");
  if (!form.brand) errs.push("Brand is required");
  if (!form.model) errs.push("Model is required");
  if (!form.year) errs.push("Year is required");
  return errs;
}

interface EditPageProps {
  isNew?: boolean;
}

export function AdminRentalCarEdit({ isNew = false }: EditPageProps) {
  const params = useParams<{ id: string }>();
  const vehicleId = isNew ? undefined : parseInt(params.id ?? "", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vehicleDetail, isLoading: loadingVehicle } = useGetAdminRentalVehicle(
    vehicleId!,
    { query: { enabled: !isNew && !!vehicleId, queryKey: getGetAdminRentalVehicleQueryKey(vehicleId!) } }
  );

  const { data: pricingData } = useGetAdminRentalVehiclePricing(
    vehicleId!,
    { query: { enabled: !isNew && !!vehicleId, queryKey: getGetAdminRentalVehiclePricingQueryKey(vehicleId!) } }
  );

  const createVehicle = useCreateAdminRentalVehicle();
  const updateVehicle = useUpdateAdminRentalVehicle();
  const updatePricing = useUpdateAdminRentalVehiclePricing();

  const [form, setForm] = useState<VehicleFormData>(defaultVehicle);
  const [pricing, setPricing] = useState<PricingFormData>(defaultPricing);
  const [images, setImages] = useState<RentalVehicleImage[]>([]);
  const [slugEdited, setSlugEdited] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (vehicleDetail) {
      setForm(vehicleToForm(vehicleDetail));
      setImages(vehicleDetail.images ?? []);
      setSlugEdited(true);
    }
  }, [vehicleDetail]);

  useEffect(() => {
    if (pricingData) {
      setPricing(pricingToForm(pricingData));
    }
  }, [pricingData]);

  const set = <K extends keyof VehicleFormData>(field: K, value: VehicleFormData[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "publicTitle" && !slugEdited) {
        next.slug = slugify(value as string);
      }
      return next;
    });
  };

  const setP = <K extends keyof PricingFormData>(field: K, value: PricingFormData[K]) => {
    setPricing((prev) => ({ ...prev, [field]: value }));
  };

  function togglePickupLocation(val: string) {
    const current = form.pickupLocations;
    if (current.includes(val)) {
      set("pickupLocations", current.filter((l) => l !== val));
    } else {
      set("pickupLocations", [...current, val]);
    }
  }

  function toggleReturnLocation(val: string) {
    const current = form.returnLocations;
    if (current.includes(val)) {
      set("returnLocations", current.filter((l) => l !== val));
    } else {
      set("returnLocations", [...current, val]);
    }
  }

  const validationErrors = getRequiredFieldErrors(form);

  async function handleSave(asDraft = false, continueEditing = false) {
    if (!asDraft && validationErrors.length > 0) {
      setActiveTab("basic");
      toast({ title: "Required fields missing", description: validationErrors[0], variant: "destructive" });
      return;
    }

    const payload = {
      internalName: form.internalName,
      publicTitle: form.publicTitle,
      slug: form.slug || slugify(form.publicTitle),
      brand: form.brand,
      model: form.model,
      trim: form.trim || undefined,
      year: form.year,
      color: form.color || undefined,
      plate: form.plate || undefined,
      vin: form.vin || undefined,
      vehicleClass: form.vehicleClass as "economy" | "compact" | "midsize" | "fullsize" | "suv" | "minivan" | "van" | "luxury" | "sports" | "truck",
      description: form.description,
      internalNotes: form.internalNotes || undefined,
      seats: form.seats,
      recommendedPassengers: form.recommendedPassengers,
      maxPassengers: form.maxPassengers,
      smallLuggageCapacity: form.smallLuggageCapacity,
      largeLuggageCapacity: form.largeLuggageCapacity,
      doors: form.doors,
      transmission: form.transmission as "automatic" | "manual" | "cvt",
      fuelType: form.fuelType as "gasoline" | "diesel" | "hybrid" | "electric" | "plugin_hybrid",
      driveType: form.driveType as "fwd" | "rwd" | "awd" | "4wd",
      engineSize: form.engineSize || undefined,
      mileage: form.mileage ?? undefined,
      fuelPolicy: form.fuelPolicy,
      smokingPolicy: form.smokingPolicy,
      petPolicy: form.petPolicy,
      status: (asDraft ? "draft" : form.status) as "draft" | "published" | "unpublished" | "archived",
      featured: form.featured,
      sortOrder: form.sortOrder,
      has4wd: form.has4wd,
      hasWinterTires: form.hasWinterTires,
      hasSnowBrush: form.hasSnowBrush,
      hasIceScraper: form.hasIceScraper,
      isSkiFriendly: form.isSkiFriendly,
      hasSkiRack: form.hasSkiRack,
      hasHeatedSeats: form.hasHeatedSeats,
      hasHeatedSteering: form.hasHeatedSteering,
      hasEtc: form.hasEtc,
      hasNavigation: form.hasNavigation,
      hasBackupCamera: form.hasBackupCamera,
      hasBluetooth: form.hasBluetooth,
      hasUsbPort: form.hasUsbPort,
      hasLargeLuggageSpace: form.hasLargeLuggageSpace,
      hasEtcCard: form.hasEtcCard,
      hasCarplay: form.hasCarplay,
      hasAndroidAuto: form.hasAndroidAuto,
      hasChildSeatCompatible: form.hasChildSeatCompatible,
      canonicalUrl: form.canonicalUrl || undefined,
      deliveryLeadTimeHours: form.deliveryLeadTimeHours ?? undefined,
      deliveryFeeOverride: form.deliveryFeeOverride ?? undefined,
      useGlobalPickupSettings: form.useGlobalPickupSettings,
      pickupLocations: form.useGlobalPickupSettings ? undefined : form.pickupLocations,
      returnLocations: form.useGlobalPickupSettings ? undefined : form.returnLocations,
      afterHoursPickup: form.afterHoursPickup,
      afterHoursReturn: form.afterHoursReturn,
      requiredDocuments: [
        ...(form.requireJapaneseLicense ? ["japanese_license"] : []),
        ...(form.requireForeignLicense ? ["foreign_license"] : []),
        ...(form.requireIdp ? ["idp"] : []),
        ...(form.requirePassport ? ["passport"] : []),
        ...(form.requireResidenceCard ? ["residence_card"] : []),
        ...(form.requireSelfie ? ["selfie"] : []),
        ...(form.requireAdditionalDriverDocs ? ["additional_driver_docs"] : []),
      ],
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
      ogTitle: form.ogTitle || undefined,
      ogDescription: form.ogDescription || undefined,
      ogImage: form.ogImage || undefined,
    };

    setIsSaving(true);
    try {
      let savedId: number;

      if (isNew) {
        const created = await new Promise<RentalVehicle>((resolve, reject) => {
          createVehicle.mutate({ data: payload }, { onSuccess: resolve, onError: reject });
        });
        savedId = created.id;
      } else {
        await new Promise<void>((resolve, reject) => {
          updateVehicle.mutate({ id: vehicleId!, data: payload }, { onSuccess: () => resolve(), onError: reject });
        });
        savedId = vehicleId!;
      }

      await new Promise<void>((resolve, reject) => {
        updatePricing.mutate(
          {
            id: savedId,
            data: {
              basePrice: pricing.basePrice,
              weekendPrice: pricing.weekendPrice ?? undefined,
              holidayPrice: pricing.holidayPrice ?? undefined,
              highSeasonPrice: pricing.highSeasonPrice ?? undefined,
              winterSeasonPrice: pricing.winterSeasonPrice ?? undefined,
              weeklyDiscountPct: pricing.weeklyDiscountPct,
              monthlyDiscountPct: pricing.monthlyDiscountPct,
              minDays: pricing.minDays,
              maxDays: pricing.maxDays ?? undefined,
              cleaningFee: pricing.cleaningFee,
              deliveryFee: pricing.deliveryFee,
              lateReturnFee: pricing.lateReturnFee,
              extraMileageFee: pricing.extraMileageFee,
              securityDeposit: pricing.securityDeposit,
              taxIncluded: pricing.taxIncluded,
              taxRate: pricing.taxRate,
              airportPickupFee: pricing.airportPickupFee,
              airportDropoffFee: pricing.airportDropoffFee,
              manualPriceOverride: pricing.manualPriceOverride,
              manualPriceValue: pricing.manualPriceOverride ? (pricing.manualPriceValue ?? undefined) : undefined,
            },
          },
          { onSuccess: () => resolve(), onError: reject }
        );
      });

      queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehiclesQueryKey() });
      if (!isNew) {
        queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehicleQueryKey(savedId) });
        queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehiclePricingQueryKey(savedId) });
      }

      toast({ title: isNew ? "Vehicle created" : "Vehicle updated" });

      if (!continueEditing) {
        setLocation("/admin/rental-cars");
      } else if (isNew) {
        setLocation(`/admin/rental-cars/${savedId}/edit`);
      }
    } catch {
      toast({ title: "Error", description: "Failed to save vehicle.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  if (!isNew && loadingVehicle) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const pageTitle = isNew ? "Add New Vehicle" : `Edit: ${vehicleDetail?.internalName ?? "Vehicle"}`;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/rental-cars")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">{pageTitle}</h1>
            {!isNew && vehicleDetail && (
              <p className="text-sm text-muted-foreground">
                Status: <span className="font-medium capitalize">{vehicleDetail.status}</span>
                {" · "}ID: {vehicleDetail.id}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleSave(true, true)} disabled={isSaving}>
            <Save className="h-4 w-4 mr-1" />
            Save as Draft
          </Button>
          <Button variant="outline" onClick={() => handleSave(false, true)} disabled={isSaving}>
            Save & Continue
          </Button>
          <Button onClick={() => handleSave(false, false)} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save & Return"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="hokkaido">Hokkaido Features</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="pickup">Pickup & Return</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="publishing">Publishing</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Internal Vehicle Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Alphard-001"
                value={form.internalName}
                onChange={(e) => set("internalName", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Used internally only, not shown publicly.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Public Listing Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Toyota Alphard Executive"
                value={form.publicTitle}
                onChange={(e) => set("publicTitle", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>URL Slug</Label>
            <div className="flex gap-2">
              <Input
                placeholder="auto-generated-from-title"
                value={form.slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  set("slug", e.target.value);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSlugEdited(false);
                  set("slug", slugify(form.publicTitle));
                }}
              >
                Reset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Public URL: /rentalcar/cars/{form.slug || "..."}</p>
          </div>

          <FieldSection title="Vehicle Identity" />

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Brand <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Toyota"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Model <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Alphard"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trim</Label>
              <Input
                placeholder="e.g. Executive Lounge"
                value={form.trim}
                onChange={(e) => set("trim", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <NumberInput
              label="Year *"
              value={form.year}
              onChange={(v) => set("year", v ?? new Date().getFullYear())}
              min={2000}
            />
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Input placeholder="e.g. Pearl White" value={form.color} onChange={(e) => set("color", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Plate Number</Label>
              <Input placeholder="e.g. 札幌 100 あ 1234" value={form.plate} onChange={(e) => set("plate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>VIN / Chassis</Label>
              <Input placeholder="e.g. JN1AZ4EH0FM..." value={form.vin} onChange={(e) => set("vin", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vehicle Class</Label>
            <Select value={form.vehicleClass} onValueChange={(v) => set("vehicleClass", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[["economy","Economy"],["compact","Compact"],["midsize","Midsize"],["fullsize","Fullsize"],["suv","SUV"],["minivan","Minivan"],["van","Van"],["luxury","Luxury"],["sports","Sports"],["truck","Truck"]].map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <FieldSection title="Content" />

          <div className="space-y-1.5">
            <Label>Public Description</Label>
            <Textarea
              placeholder="Describe the vehicle for customers…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea
              placeholder="Notes for staff only — not shown to customers."
              value={form.internalNotes}
              onChange={(e) => set("internalNotes", e.target.value)}
              rows={2}
            />
          </div>
        </TabsContent>

        <TabsContent value="specs" className="space-y-5 pt-4">
          <FieldSection title="Capacity" />
          <div className="grid grid-cols-3 gap-4">
            <NumberInput label="Seats" value={form.seats} onChange={(v) => set("seats", v ?? 5)} min={1} />
            <NumberInput label="Recommended Passengers" value={form.recommendedPassengers} onChange={(v) => set("recommendedPassengers", v ?? 4)} min={1} />
            <NumberInput label="Max Passengers" value={form.maxPassengers} onChange={(v) => set("maxPassengers", v ?? 5)} min={1} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <NumberInput label="Small Luggage Capacity" value={form.smallLuggageCapacity} onChange={(v) => set("smallLuggageCapacity", v ?? 0)} min={0} hint="Number of cabin bags" />
            <NumberInput label="Large Luggage Capacity" value={form.largeLuggageCapacity} onChange={(v) => set("largeLuggageCapacity", v ?? 0)} min={0} hint="Number of checked bags" />
            <NumberInput label="Doors" value={form.doors} onChange={(v) => set("doors", v ?? 4)} min={2} max={6} />
          </div>

          <FieldSection title="Drivetrain" />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Transmission</Label>
              <Select value={form.transmission} onValueChange={(v) => set("transmission", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="cvt">CVT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fuel Type</Label>
              <Select value={form.fuelType} onValueChange={(v) => set("fuelType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasoline">Gasoline</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                  <SelectItem value="plugin_hybrid">Plug-in Hybrid</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Drive Type</Label>
              <Select value={form.driveType} onValueChange={(v) => set("driveType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fwd">FWD</SelectItem>
                  <SelectItem value="rwd">RWD</SelectItem>
                  <SelectItem value="awd">AWD</SelectItem>
                  <SelectItem value="4wd">4WD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Engine Size</Label>
              <Input placeholder="e.g. 2.5L, 3.5L V6" value={form.engineSize} onChange={(e) => set("engineSize", e.target.value)} />
            </div>
            <NumberInput label="Current Mileage (km)" value={form.mileage} onChange={(v) => set("mileage", v)} nullable min={0} />
          </div>

          <FieldSection title="Policies" />
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Fuel Policy</Label>
              <Select value={form.fuelPolicy} onValueChange={(v) => set("fuelPolicy", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_to_full">Full to Full</SelectItem>
                  <SelectItem value="full_to_empty">Full to Empty</SelectItem>
                  <SelectItem value="same_to_same">Same to Same</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Smoking Policy</Label>
              <Select value={form.smokingPolicy} onValueChange={(v) => set("smokingPolicy", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_smoking">No Smoking</SelectItem>
                  <SelectItem value="allowed">Allowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pet Policy</Label>
              <Select value={form.petPolicy} onValueChange={(v) => set("petPolicy", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_pets">No Pets</SelectItem>
                  <SelectItem value="pets_allowed">Pets Allowed</SelectItem>
                  <SelectItem value="small_pets_only">Small Pets Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hokkaido" className="space-y-5 pt-4">
          <p className="text-sm text-muted-foreground">Select all features that apply to this vehicle for Hokkaido travel.</p>

          <FieldSection title="Winter & Off-Road" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField id="has4wd" label="4WD / All-Wheel Drive" checked={form.has4wd} onCheckedChange={(v) => set("has4wd", v)} />
            <CheckboxField id="hasWinterTires" label="Winter Tires" checked={form.hasWinterTires} onCheckedChange={(v) => set("hasWinterTires", v)} />
            <CheckboxField id="hasSnowBrush" label="Snow Brush" checked={form.hasSnowBrush} onCheckedChange={(v) => set("hasSnowBrush", v)} />
            <CheckboxField id="hasIceScraper" label="Ice Scraper" checked={form.hasIceScraper} onCheckedChange={(v) => set("hasIceScraper", v)} />
            <CheckboxField id="isSkiFriendly" label="Ski / Snowboard Friendly" checked={form.isSkiFriendly} onCheckedChange={(v) => set("isSkiFriendly", v)} />
            <CheckboxField id="hasSkiRack" label="Ski Rack" checked={form.hasSkiRack} onCheckedChange={(v) => set("hasSkiRack", v)} />
          </div>

          <FieldSection title="Comfort" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField id="hasHeatedSeats" label="Heated Seats" checked={form.hasHeatedSeats} onCheckedChange={(v) => set("hasHeatedSeats", v)} />
            <CheckboxField id="hasHeatedSteering" label="Heated Steering Wheel" checked={form.hasHeatedSteering} onCheckedChange={(v) => set("hasHeatedSteering", v)} />
          </div>

          <FieldSection title="Technology" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField id="hasEtc" label="ETC Device" checked={form.hasEtc} onCheckedChange={(v) => set("hasEtc", v)} />
            <CheckboxField id="hasNavigation" label="Navigation System" checked={form.hasNavigation} onCheckedChange={(v) => set("hasNavigation", v)} />
            <CheckboxField id="hasBackupCamera" label="Rear Camera" checked={form.hasBackupCamera} onCheckedChange={(v) => set("hasBackupCamera", v)} />
            <CheckboxField id="hasBluetooth" label="Bluetooth" checked={form.hasBluetooth} onCheckedChange={(v) => set("hasBluetooth", v)} />
            <CheckboxField id="hasUsbPort" label="USB Port" checked={form.hasUsbPort} onCheckedChange={(v) => set("hasUsbPort", v)} />
            <CheckboxField id="hasCarplay" label="Apple CarPlay" checked={form.hasCarplay} onCheckedChange={(v) => set("hasCarplay", v)} />
            <CheckboxField id="hasAndroidAuto" label="Android Auto" checked={form.hasAndroidAuto} onCheckedChange={(v) => set("hasAndroidAuto", v)} />
            <CheckboxField id="hasEtcCard" label="ETC Card Included" checked={form.hasEtcCard} onCheckedChange={(v) => set("hasEtcCard", v)} />
          </div>

          <FieldSection title="Cargo &amp; Safety" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <CheckboxField id="hasLargeLuggageSpace" label="Large Luggage Space" checked={form.hasLargeLuggageSpace} onCheckedChange={(v) => set("hasLargeLuggageSpace", v)} />
            <CheckboxField id="hasChildSeatCompatible" label="Child Seat Compatible" checked={form.hasChildSeatCompatible} onCheckedChange={(v) => set("hasChildSeatCompatible", v)} />
          </div>
        </TabsContent>

        <TabsContent value="photos" className="space-y-5 pt-4">
          <PhotosTab vehicleId={vehicleId} images={images} onImagesChange={setImages} />
        </TabsContent>

        <TabsContent value="pricing" className="space-y-5 pt-4">
          <FieldSection title="Base Pricing (¥/day)" />
          <div className="grid grid-cols-3 gap-4">
            <NumberInput label="Base Daily Price *" value={pricing.basePrice} onChange={(v) => setP("basePrice", v ?? 0)} prefix="¥" step={100} />
            <NumberInput label="Weekend Price" value={pricing.weekendPrice} onChange={(v) => setP("weekendPrice", v)} prefix="¥" step={100} nullable hint="Leave blank to use base price" />
            <NumberInput label="Holiday Price" value={pricing.holidayPrice} onChange={(v) => setP("holidayPrice", v)} prefix="¥" step={100} nullable hint="Leave blank to use base price" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="High Season Price" value={pricing.highSeasonPrice} onChange={(v) => setP("highSeasonPrice", v)} prefix="¥" step={100} nullable hint="e.g. Golden Week, summer" />
            <NumberInput label="Winter Season Price" value={pricing.winterSeasonPrice} onChange={(v) => setP("winterSeasonPrice", v)} prefix="¥" step={100} nullable hint="Ski season premium" />
          </div>

          <FieldSection title="Discounts" />
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Weekly Discount %" value={pricing.weeklyDiscountPct} onChange={(v) => setP("weeklyDiscountPct", v ?? 0)} suffix="%" step={1} max={100} />
            <NumberInput label="Monthly Discount %" value={pricing.monthlyDiscountPct} onChange={(v) => setP("monthlyDiscountPct", v ?? 0)} suffix="%" step={1} max={100} />
          </div>

          <FieldSection title="Rental Duration" />
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Min Rental Days" value={pricing.minDays} onChange={(v) => setP("minDays", v ?? 1)} min={1} />
            <NumberInput label="Max Rental Days" value={pricing.maxDays} onChange={(v) => setP("maxDays", v)} nullable hint="Leave blank for no limit" />
          </div>

          <FieldSection title="Additional Fees (¥)" />
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Cleaning Fee" value={pricing.cleaningFee} onChange={(v) => setP("cleaningFee", v ?? 0)} prefix="¥" step={100} />
            <NumberInput label="Delivery Fee" value={pricing.deliveryFee} onChange={(v) => setP("deliveryFee", v ?? 0)} prefix="¥" step={100} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Late Return Fee" value={pricing.lateReturnFee} onChange={(v) => setP("lateReturnFee", v ?? 0)} prefix="¥" step={100} />
            <NumberInput label="Extra Mileage Fee (per km)" value={pricing.extraMileageFee} onChange={(v) => setP("extraMileageFee", v ?? 0)} prefix="¥" step={10} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Security Deposit" value={pricing.securityDeposit} onChange={(v) => setP("securityDeposit", v ?? 0)} prefix="¥" step={1000} />
            <NumberInput label="Tax Rate %" value={pricing.taxRate} onChange={(v) => setP("taxRate", v ?? 10)} suffix="%" step={1} />
          </div>

          <FieldSection title="Airport Fees (¥)" />
          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Airport Pickup Fee" value={pricing.airportPickupFee} onChange={(v) => setP("airportPickupFee", v ?? 0)} prefix="¥" step={100} hint="0 = No airport pickup service" />
            <NumberInput label="Airport Drop-off Fee" value={pricing.airportDropoffFee} onChange={(v) => setP("airportDropoffFee", v ?? 0)} prefix="¥" step={100} hint="0 = No airport drop-off service" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Switch id="taxIncluded" checked={pricing.taxIncluded} onCheckedChange={(v) => setP("taxIncluded", v)} />
            <Label htmlFor="taxIncluded">Tax included in displayed price</Label>
          </div>

          <FieldSection title="Manual Price Override" />
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch id="manualPriceOverride" checked={pricing.manualPriceOverride} onCheckedChange={(v) => setP("manualPriceOverride", v)} />
              <div>
                <Label htmlFor="manualPriceOverride">Override all pricing with a fixed amount</Label>
                <p className="text-xs text-muted-foreground">When enabled, this fixed daily rate replaces all seasonal and weekend pricing rules.</p>
              </div>
            </div>
            {pricing.manualPriceOverride && (
              <NumberInput label="Fixed Override Price (¥/day)" value={pricing.manualPriceValue} onChange={(v) => setP("manualPriceValue", v)} prefix="¥" step={100} nullable hint="This price will be shown to customers regardless of season" />
            )}
          </div>
        </TabsContent>

        <TabsContent value="pickup" className="space-y-5 pt-4">
          <div className="flex items-center gap-3">
            <Switch
              id="useGlobal"
              checked={form.useGlobalPickupSettings}
              onCheckedChange={(v) => set("useGlobalPickupSettings", v)}
            />
            <Label htmlFor="useGlobal">Use global pickup & return settings</Label>
          </div>

          {!form.useGlobalPickupSettings && (
            <>
              <FieldSection title="Supported Pickup Locations" />
              <div className="space-y-2">
                {PICKUP_LOCATIONS.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`pickup-${value}`}
                      checked={form.pickupLocations.includes(value)}
                      onCheckedChange={() => togglePickupLocation(value)}
                    />
                    <Label htmlFor={`pickup-${value}`} className="font-normal cursor-pointer">{label}</Label>
                  </div>
                ))}
              </div>

              <FieldSection title="Supported Return Locations" />
              <div className="space-y-2">
                {PICKUP_LOCATIONS.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`return-${value}`}
                      checked={form.returnLocations.includes(value)}
                      onCheckedChange={() => toggleReturnLocation(value)}
                    />
                    <Label htmlFor={`return-${value}`} className="font-normal cursor-pointer">{label}</Label>
                  </div>
                ))}
              </div>

              <FieldSection title="After-Hours" />
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="afterHoursPickup"
                    checked={form.afterHoursPickup}
                    onCheckedChange={(v) => set("afterHoursPickup", v)}
                  />
                  <Label htmlFor="afterHoursPickup">Allow after-hours pickup</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="afterHoursReturn"
                    checked={form.afterHoursReturn}
                    onCheckedChange={(v) => set("afterHoursReturn", v)}
                  />
                  <Label htmlFor="afterHoursReturn">Allow after-hours return</Label>
                </div>
              </div>
            </>
          )}

          {!form.useGlobalPickupSettings && (
            <>
              <FieldSection title="Delivery Settings" />
              <div className="grid grid-cols-2 gap-4">
                <NumberInput
                  label="Delivery Lead Time (hours)"
                  value={form.deliveryLeadTimeHours}
                  onChange={(v) => set("deliveryLeadTimeHours", v)}
                  nullable
                  min={0}
                  hint="Minimum advance notice required for hotel/office delivery"
                />
                <NumberInput
                  label="Delivery Fee Override (¥)"
                  value={form.deliveryFeeOverride}
                  onChange={(v) => set("deliveryFeeOverride", v)}
                  prefix="¥"
                  step={100}
                  nullable
                  hint="Override the global delivery fee for this vehicle. Leave blank to use global."
                />
              </div>
            </>
          )}

          {form.useGlobalPickupSettings && (
            <p className="text-sm text-muted-foreground bg-muted rounded-md p-4">
              This vehicle will use the global pickup & return settings configured in Rental Cars → Settings.
            </p>
          )}
        </TabsContent>

        <TabsContent value="documents" className="space-y-5 pt-4">
          <p className="text-sm text-muted-foreground">Select the documents required from customers to rent this vehicle.</p>
          <FieldSection title="Required Documents" />
          <div className="space-y-3">
            <CheckboxField id="reqJapanese" label="Japanese Driver's License" checked={form.requireJapaneseLicense} onCheckedChange={(v) => set("requireJapaneseLicense", v)} />
            <CheckboxField id="reqForeign" label="Foreign Driver's License" checked={form.requireForeignLicense} onCheckedChange={(v) => set("requireForeignLicense", v)} />
            <CheckboxField id="reqIdp" label="International Driving Permit (IDP)" checked={form.requireIdp} onCheckedChange={(v) => set("requireIdp", v)} />
            <CheckboxField id="reqPassport" label="Passport" checked={form.requirePassport} onCheckedChange={(v) => set("requirePassport", v)} />
            <CheckboxField id="reqResidenceCard" label="Residence Card" checked={form.requireResidenceCard} onCheckedChange={(v) => set("requireResidenceCard", v)} />
            <CheckboxField id="reqSelfie" label="Selfie with ID" checked={form.requireSelfie} onCheckedChange={(v) => set("requireSelfie", v)} />
            <CheckboxField id="reqAdditional" label="Additional Driver Documents" checked={form.requireAdditionalDriverDocs} onCheckedChange={(v) => set("requireAdditionalDriverDocs", v)} />
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-5 pt-4">
          <div className="space-y-1.5">
            <Label>Canonical URL</Label>
            <Input value={form.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="https://example.com/rentalcar/cars/your-car (leave blank to auto-generate)" />
            <p className="text-xs text-muted-foreground">Override the canonical URL for this vehicle page. Leave blank to use the default.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Meta Title</Label>
            <Input value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} placeholder="Auto-generated if blank" />
            <p className="text-xs text-muted-foreground">{form.metaTitle.length}/60 characters recommended</p>
          </div>
          <div className="space-y-1.5">
            <Label>Meta Description</Label>
            <Textarea rows={3} value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} placeholder="Auto-generated if blank" />
            <p className="text-xs text-muted-foreground">{form.metaDescription.length}/160 characters recommended</p>
          </div>
          <FieldSection title="Open Graph" />
          <div className="space-y-1.5">
            <Label>OG Title</Label>
            <Input value={form.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} placeholder="Falls back to Meta Title" />
          </div>
          <div className="space-y-1.5">
            <Label>OG Description</Label>
            <Textarea rows={2} value={form.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} placeholder="Falls back to Meta Description" />
          </div>
          <div className="space-y-1.5">
            <Label>OG Image URL</Label>
            <Input value={form.ogImage} onChange={(e) => set("ogImage", e.target.value)} placeholder="https://example.com/og-image.jpg" />
          </div>
        </TabsContent>

        <TabsContent value="publishing" className="space-y-5 pt-4">
          {validationErrors.length > 0 && (
            <div className="p-4 rounded-md border border-destructive/40 bg-destructive/5 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                <AlertCircle className="h-4 w-4" />
                Required fields missing — cannot publish
              </div>
              <ul className="text-sm text-destructive/80 space-y-1 ml-6 list-disc">
                {validationErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published" disabled={validationErrors.length > 0}>
                  Published {validationErrors.length > 0 && "(fix required fields first)"}
                </SelectItem>
                <SelectItem value="unpublished">Unpublished</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="featured" checked={form.featured} onCheckedChange={(v) => set("featured", v)} />
            <div>
              <Label htmlFor="featured">Featured Vehicle</Label>
              <p className="text-xs text-muted-foreground">Shows in the featured section on the rental car homepage.</p>
            </div>
          </div>

          <div className="space-y-1.5 max-w-xs">
            <Label>Display Order</Label>
            <Input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-xs text-muted-foreground">Lower numbers appear first.</p>
          </div>

          {!isNew && vehicleDetail && (
            <>
              <FieldSection title="Metadata" />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(vehicleDetail.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p>{new Date(vehicleDetail.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </>
          )}

          <Separator />
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => handleSave(true, false)} disabled={isSaving}>
              Save as Draft
            </Button>
            <Button onClick={() => handleSave(false, false)} disabled={isSaving || (form.status === "published" && validationErrors.length > 0)}>
              {isSaving ? "Saving…" : form.status === "published" ? "Save & Publish" : "Save"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
