import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminCars,
  useCreateAdminCar,
  useUpdateAdminCar,
  useDeleteAdminCar,
  useSetCarAvailability,
  getGetAdminCarsQueryKey,
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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Pencil, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type CarFormData = {
  model: string;
  name: string;
  year: number;
  passengerCapacity: number;
  fuelEfficiency: number;
  pricePerDay: number;
  airportPickupFee: number;
  airportDropoffFee: number;
  imageUrls: string;
  description: string;
  isAvailable: boolean;
};

const defaultFormData: CarFormData = {
  model: "Toyota",
  name: "",
  year: new Date().getFullYear(),
  passengerCapacity: 5,
  fuelEfficiency: 12,
  pricePerDay: 10000,
  airportPickupFee: 9800,
  airportDropoffFee: 9800,
  imageUrls: "",
  description: "",
  isAvailable: true,
};

function CarForm({
  initial,
  onSubmit,
  isPending,
  submitLabel,
}: {
  initial: CarFormData;
  onSubmit: (data: CarFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<CarFormData>(initial);

  const set = (field: keyof CarFormData, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 mt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Car Model</Label>
          <Input
            placeholder="e.g. Toyota"
            value={form.model}
            onChange={(e) => set("model", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Car Name</Label>
          <Input
            placeholder="e.g. Alphard"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Year</Label>
          <Input
            type="number"
            min={2000}
            max={2030}
            value={form.year}
            onChange={(e) => set("year", parseInt(e.target.value) || 2024)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Max Passengers</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={form.passengerCapacity}
            onChange={(e) => set("passengerCapacity", parseInt(e.target.value) || 1)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Fuel Efficiency (km/L)</Label>
          <Input
            type="number"
            min={1}
            step={0.1}
            value={form.fuelEfficiency}
            onChange={(e) => set("fuelEfficiency", parseFloat(e.target.value) || 10)}
            required
          />
        </div>
      </div>

      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Rate Per Day (¥)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
            <Input
              type="number"
              min={0}
              step={100}
              className="pl-7"
              value={form.pricePerDay}
              onChange={(e) => set("pricePerDay", parseInt(e.target.value) || 0)}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Airport Pickup Fee (¥)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
            <Input
              type="number"
              min={0}
              step={100}
              className="pl-7"
              value={form.airportPickupFee}
              onChange={(e) => set("airportPickupFee", parseInt(e.target.value) || 0)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">0 = No airport service</p>
        </div>
        <div className="space-y-1.5">
          <Label>Airport Drop-off Fee (¥)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
            <Input
              type="number"
              min={0}
              step={100}
              className="pl-7"
              value={form.airportDropoffFee}
              onChange={(e) => set("airportDropoffFee", parseInt(e.target.value) || 0)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">0 = No airport service</p>
        </div>
      </div>

      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Images & Details</p>

      <div className="space-y-1.5">
        <Label>Image URLs</Label>
        <Textarea
          placeholder="One URL per line&#10;https://example.com/car1.jpg&#10;https://example.com/car2.jpg"
          value={form.imageUrls}
          onChange={(e) => set("imageUrls", e.target.value)}
          rows={3}
        />
        <p className="text-xs text-muted-foreground">Enter one image URL per line. The first image will be used as the main image.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea
          placeholder="Brief description of the vehicle..."
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={form.isAvailable}
          onCheckedChange={(v) => set("isAvailable", v)}
          id="is-available"
        />
        <Label htmlFor="is-available">Available for booking</Label>
      </div>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

export function AdminFleet() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cars, isLoading } = useGetAdminCars({
    query: { queryKey: getGetAdminCarsQueryKey() },
  });

  const createCar = useCreateAdminCar();
  const updateCar = useUpdateAdminCar();
  const deleteCar = useDeleteAdminCar();
  const setCarAvailability = useSetCarAvailability();

  const [addOpen, setAddOpen] = useState(false);
  const [editCar, setEditCar] = useState<(typeof cars extends (infer T)[] | undefined ? T : never) | null>(null);
  const [deleteCarId, setDeleteCarId] = useState<number | null>(null);
  const [availabilityCar, setAvailabilityCar] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetAdminCarsQueryKey() });

  function parseImageUrls(raw: string): string[] {
    return raw.split("\n").map(s => s.trim()).filter(Boolean);
  }

  function handleCreate(data: CarFormData) {
    const imageUrls = parseImageUrls(data.imageUrls);
    createCar.mutate({
      data: {
        model: data.model,
        name: data.name,
        year: data.year,
        passengerCapacity: data.passengerCapacity,
        fuelEfficiency: data.fuelEfficiency,
        pricePerDay: data.pricePerDay,
        airportPickupFee: data.airportPickupFee,
        airportDropoffFee: data.airportDropoffFee,
        imageUrls,
        imageUrl: imageUrls[0] ?? "",
        isAvailable: data.isAvailable,
        description: data.description || null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Car added", description: `${data.model} ${data.name} has been added to the fleet.` });
        setAddOpen(false);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add car.", variant: "destructive" });
      }
    });
  }

  function handleEdit(data: CarFormData) {
    if (!editCar) return;
    const imageUrls = parseImageUrls(data.imageUrls);
    updateCar.mutate({
      id: editCar.id,
      data: {
        model: data.model,
        name: data.name,
        year: data.year,
        passengerCapacity: data.passengerCapacity,
        fuelEfficiency: data.fuelEfficiency,
        pricePerDay: data.pricePerDay,
        airportPickupFee: data.airportPickupFee,
        airportDropoffFee: data.airportDropoffFee,
        imageUrls,
        imageUrl: imageUrls[0] ?? editCar.imageUrl,
        isAvailable: data.isAvailable,
        description: data.description || null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Car updated" });
        setEditCar(null);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update car.", variant: "destructive" });
      }
    });
  }

  function handleDelete() {
    if (!deleteCarId) return;
    deleteCar.mutate({ id: deleteCarId }, {
      onSuccess: () => {
        toast({ title: "Car removed from fleet" });
        setDeleteCarId(null);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete car.", variant: "destructive" });
      }
    });
  }

  function handleToggleAvailability(carId: number, current: boolean) {
    updateCar.mutate({ id: carId, data: { isAvailable: !current } }, {
      onSuccess: () => {
        toast({ title: "Availability updated" });
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update availability.", variant: "destructive" });
      }
    });
  }

  function handleSetAvailabilityDates(isAvailable: boolean) {
    if (!availabilityCar || !dateRange.from || !dateRange.to) return;
    setCarAvailability.mutate({
      id: availabilityCar,
      data: {
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        isAvailable,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Date availability updated" });
        setAvailabilityCar(null);
        setDateRange({});
      }
    });
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Fleet Management</h1>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {["Car", "Year", "Capacity", "Fuel", "Rate/Day", "Airport Pickup", "Airport Drop-off", "Status", "Actions"].map(h => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map(i => (
                <TableRow key={i}>
                  {Array(9).fill(0).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
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
          <h1 className="text-3xl font-serif font-bold tracking-tight">Fleet Management</h1>
          <p className="text-muted-foreground text-sm mt-1">{cars?.length ?? 0} vehicles in fleet</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Car
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">Add New Car</DialogTitle>
            </DialogHeader>
            <CarForm
              initial={defaultFormData}
              onSubmit={handleCreate}
              isPending={createCar.isPending}
              submitLabel="Add to Fleet"
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Year</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Fuel (km/L)</TableHead>
              <TableHead>Rate/Day</TableHead>
              <TableHead>Airport Pickup</TableHead>
              <TableHead>Airport Drop-off</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cars?.map((car) => {
              const displayImage = car.imageUrls?.[0] || car.imageUrl;
              return (
                <TableRow key={car.id}>
                  <TableCell>
                    <div className="w-20 h-12 rounded overflow-hidden bg-muted">
                      {displayImage
                        ? <img src={displayImage} alt={car.name} className="object-cover w-full h-full" />
                        : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No image</div>
                      }
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{car.model} {car.name}</p>
                      {car.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-[160px]">{car.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{car.year}</TableCell>
                  <TableCell>{car.passengerCapacity} pax</TableCell>
                  <TableCell>{car.fuelEfficiency}</TableCell>
                  <TableCell className="font-mono">¥{car.pricePerDay.toLocaleString()}</TableCell>
                  <TableCell className="font-mono">
                    {car.airportPickupFee > 0
                      ? `¥${car.airportPickupFee.toLocaleString()}`
                      : <Badge variant="secondary" className="text-xs">Free</Badge>
                    }
                  </TableCell>
                  <TableCell className="font-mono">
                    {car.airportDropoffFee > 0
                      ? `¥${car.airportDropoffFee.toLocaleString()}`
                      : <Badge variant="secondary" className="text-xs">Free</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={car.isAvailable}
                      onCheckedChange={() => handleToggleAvailability(car.id, car.isAvailable)}
                      disabled={updateCar.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Dialog open={editCar?.id === car.id} onOpenChange={(open) => !open && setEditCar(null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setEditCar(car)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="font-serif text-xl">Edit {car.model} {car.name}</DialogTitle>
                          </DialogHeader>
                          {editCar?.id === car.id && (
                            <CarForm
                              initial={{
                                model: car.model,
                                name: car.name,
                                year: car.year,
                                passengerCapacity: car.passengerCapacity,
                                fuelEfficiency: car.fuelEfficiency,
                                pricePerDay: car.pricePerDay,
                                airportPickupFee: car.airportPickupFee,
                                airportDropoffFee: car.airportDropoffFee,
                                imageUrls: (car.imageUrls ?? []).join("\n"),
                                description: car.description ?? "",
                                isAvailable: car.isAvailable,
                              }}
                              onSubmit={handleEdit}
                              isPending={updateCar.isPending}
                              submitLabel="Save Changes"
                            />
                          )}
                        </DialogContent>
                      </Dialog>

                      <Dialog open={availabilityCar === car.id} onOpenChange={(open) => !open && setAvailabilityCar(null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setAvailabilityCar(car.id)} title="Date availability overrides">
                            <CalendarIcon className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Date Availability — {car.model} {car.name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <Calendar
                              mode="range"
                              selected={dateRange as any}
                              onSelect={(range: any) => setDateRange(range || {})}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              numberOfMonths={2}
                            />
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                onClick={() => handleSetAvailabilityDates(true)}
                                disabled={!dateRange.from || !dateRange.to || setCarAvailability.isPending}
                              >
                                Mark Available
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleSetAvailabilityDates(false)}
                                disabled={!dateRange.from || !dateRange.to || setCarAvailability.isPending}
                              >
                                Mark Unavailable
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteCarId(car.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!cars?.length && (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                  No cars in the fleet yet. Click "Add New Car" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteCarId !== null} onOpenChange={(open) => !open && setDeleteCarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove car from fleet?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this car and cannot be undone. Existing bookings will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCar.isPending ? "Removing…" : "Remove Car"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
