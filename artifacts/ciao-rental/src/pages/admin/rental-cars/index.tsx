import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminRentalVehicles,
  useDuplicateAdminRentalVehicle,
  useDeleteAdminRentalVehicle,
  useUpdateAdminRentalVehicle,
  getGetAdminRentalVehiclesQueryKey,
  type RentalVehicle,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Eye,
  Globe,
  EyeOff,
  Calendar,
  ClipboardList,
  Search,
  Ban,
  LayoutGrid,
  List,
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  published: "bg-green-100 text-green-800 border-green-200",
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  unpublished: "bg-yellow-100 text-yellow-800 border-yellow-200",
  archived: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  unpublished: "Unpublished",
  archived: "Archived",
};

const CLASS_LABELS: Record<string, string> = {
  economy: "Economy",
  compact: "Compact",
  midsize: "Midsize",
  fullsize: "Fullsize",
  suv: "SUV",
  minivan: "Minivan",
  van: "Van",
  luxury: "Luxury",
  sports: "Sports",
  truck: "Truck",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function AdminRentalCars() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vehicles, isLoading } = useGetAdminRentalVehicles({
    query: { queryKey: getGetAdminRentalVehiclesQueryKey() },
  });

  const duplicateVehicle = useDuplicateAdminRentalVehicle();
  const deleteVehicle = useDeleteAdminRentalVehicle();
  const updateVehicle = useUpdateAdminRentalVehicle();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [featuredFilter, setFeaturedFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [opStatusFilter, setOpStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehiclesQueryKey() });

  function handleDuplicate(v: RentalVehicle) {
    duplicateVehicle.mutate(
      { id: v.id },
      {
        onSuccess: (dup) => {
          toast({
            title: "Vehicle duplicated as draft",
            description: `"${dup.publicTitle}" is ready to edit.`,
          });
          invalidate();
          setLocation(`/admin/rental-cars/${dup.id}/edit`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to duplicate vehicle.", variant: "destructive" });
        },
      }
    );
  }

  function handleDelete() {
    if (deleteId === null) return;
    deleteVehicle.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Vehicle archived" });
          setDeleteId(null);
          invalidate();
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to archive vehicle.", variant: "destructive" });
        },
      }
    );
  }

  function handleTogglePublish(v: RentalVehicle) {
    const newStatus = v.status === "published" ? "unpublished" : "published";
    if (newStatus === "published") {
      const missing: string[] = [];
      if (!v.internalName) missing.push("Internal name");
      if (!v.publicTitle) missing.push("Public title");
      if (!v.brand) missing.push("Brand");
      if (!v.model) missing.push("Model");
      if (!v.year) missing.push("Year");
      if (missing.length > 0) {
        toast({
          title: "Cannot publish — required fields missing",
          description: missing.join(", "),
          variant: "destructive",
        });
        return;
      }
    }
    updateVehicle.mutate(
      { id: v.id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: `Vehicle ${newStatus === "published" ? "published" : "unpublished"}` });
          invalidate();
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
        },
      }
    );
  }

  const distinctModels = Array.from(new Set((vehicles ?? []).map((v) => v.model))).sort();

  const filtered = (vehicles ?? []).filter((v) => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (classFilter !== "all" && v.vehicleClass !== classFilter) return false;
    if (featuredFilter === "featured" && !v.featured) return false;
    if (featuredFilter === "not_featured" && v.featured) return false;
    if (modelFilter !== "all" && v.model !== modelFilter) return false;
    if (opStatusFilter !== "all" && v.operationalStatus !== opStatusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matches =
        v.internalName.toLowerCase().includes(q) ||
        v.publicTitle.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.plate?.toLowerCase().includes(q) ?? false) ||
        String(v.id).includes(q);
      if (!matches) return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Rental Cars</h1>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {["Photo", "Vehicle", "Brand/Model", "Class", "Status", "Price", "Actions"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Rental Cars</h1>
          <p className="text-muted-foreground text-sm mt-1">{vehicles?.length ?? 0} vehicles total</p>
        </div>
        <Button className="gap-2" onClick={() => setLocation("/admin/rental-cars/new")}>
          <Plus className="h-4 w-4" />
          Add Vehicle
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, model, plate, ID…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="unpublished">Unpublished</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {Object.entries(CLASS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={featuredFilter} onValueChange={setFeaturedFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Featured" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="featured">Featured only</SelectItem>
            <SelectItem value="not_featured">Not featured</SelectItem>
          </SelectContent>
        </Select>
        {distinctModels.length > 1 && (
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {distinctModels.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={opStatusFilter} onValueChange={setOpStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Availability</SelectItem>
            <SelectItem value="available">Available</SelectItem>
            <SelectItem value="cleaning">Cleaning</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center border rounded-md overflow-hidden">
          <Button
            variant={viewMode === "table" ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-none"
            onClick={() => setViewMode("table")}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "card" ? "default" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-none"
            onClick={() => setViewMode("card")}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === "card" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12">
              {vehicles?.length === 0 ? "No vehicles yet. Add your first vehicle." : "No vehicles match your search."}
            </p>
          )}
          {filtered.map((v) => {
            const coverImage = v.images?.find((img) => img.isCover)?.url ?? v.images?.[0]?.url;
            return (
              <div key={v.id} className="border rounded-lg overflow-hidden bg-card group">
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {coverImage ? (
                    <img src={coverImage} alt={v.publicTitle} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No photo</div>
                  )}
                  <div className="absolute top-1 left-1 flex gap-1">
                    <StatusBadge status={v.status} />
                  </div>
                  {v.featured && (
                    <div className="absolute top-1 right-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-600 text-white font-medium">★</span>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="font-medium text-sm truncate">{v.publicTitle}</p>
                  <p className="text-xs text-muted-foreground">{v.brand} {v.model} · {v.year}</p>
                  <p className="text-xs text-muted-foreground">{CLASS_LABELS[v.vehicleClass] ?? v.vehicleClass} · {v.seats} seats · {v.smallLuggageCapacity}S/{v.largeLuggageCapacity}L bags</p>
                  <div className="flex gap-1 pt-1">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setLocation(`/admin/rental-cars/${v.id}/edit`)}>
                      <Pencil className="h-3 w-3 mr-1" /> Edit
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setLocation(`/rentalcar/cars/${v.slug}`)}>
                          <Eye className="h-4 w-4 mr-2" /> View on Site
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(v)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleTogglePublish(v)} disabled={updateVehicle.isPending}>
                          {v.status === "published" ? <><EyeOff className="h-4 w-4 mr-2" />Unpublish</> : <><Globe className="h-4 w-4 mr-2" />Publish</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(v.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "table" && (
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Photo</TableHead>
              <TableHead>Internal Name</TableHead>
              <TableHead>Public Title</TableHead>
              <TableHead>Brand / Model</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Luggage</TableHead>
              <TableHead>Plate</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Transmission</TableHead>
              <TableHead>Price/Day</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} className="text-center text-muted-foreground py-12">
                  {vehicles?.length === 0
                    ? "No vehicles yet. Add your first vehicle."
                    : "No vehicles match your search."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((v) => {
              const coverImage = v.images?.find((img) => img.isCover)?.url ?? v.images?.[0]?.url;
              return (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="w-16 h-10 rounded overflow-hidden bg-muted flex-shrink-0">
                      {coverImage ? (
                        <img src={coverImage} alt={v.publicTitle} className="object-cover w-full h-full" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                          No img
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{v.internalName}</p>
                    <p className="text-xs text-muted-foreground">ID: {v.id}</p>
                  </TableCell>
                  <TableCell className="max-w-[160px]">
                    <p className="text-sm truncate">{v.publicTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">/rentalcar/cars/{v.slug}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{v.brand}</p>
                    <p className="text-xs text-muted-foreground">{v.model}{v.trim ? ` ${v.trim}` : ""}</p>
                  </TableCell>
                  <TableCell className="text-sm">{v.year}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {CLASS_LABELS[v.vehicleClass] ?? v.vehicleClass}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {v.smallLuggageCapacity}S / {v.largeLuggageCapacity}L
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.plate ?? "—"}</TableCell>
                  <TableCell className="text-sm">{v.seats}</TableCell>
                  <TableCell className="text-sm capitalize">{v.transmission}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {v.basePrice != null ? `¥${v.basePrice.toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>
                    {v.operationalStatus === "available" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-800 border-green-200">Available</span>
                    )}
                    {v.operationalStatus === "cleaning" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-yellow-100 text-yellow-800 border-yellow-200">Cleaning</span>
                    )}
                    {v.operationalStatus === "maintenance" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-100 text-orange-800 border-orange-200">Maintenance</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={v.status} />
                    {v.featured && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
                        ★ Featured
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setLocation(`/rentalcar/cars/${v.slug}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View on Site
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation(`/admin/rental-cars/${v.id}/edit`)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(v)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setLocation(`/admin/rental-cars/availability`)}
                        >
                          <Calendar className="h-4 w-4 mr-2" />
                          Manage Availability
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setLocation(`/admin/rental-cars/availability?vehicleId=${v.id}`)}
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Block Dates
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setLocation(`/admin/rental-cars/reservations`)}
                        >
                          <ClipboardList className="h-4 w-4 mr-2" />
                          View Reservations
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleTogglePublish(v)}
                          disabled={updateVehicle.isPending}
                        >
                          {v.status === "published" ? (
                            <>
                              <EyeOff className="h-4 w-4 mr-2" />
                              Unpublish
                            </>
                          ) : (
                            <>
                              <Globe className="h-4 w-4 mr-2" />
                              Publish
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(v.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              The vehicle will be soft-deleted and removed from public listings. This action can be reversed by contacting support.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
