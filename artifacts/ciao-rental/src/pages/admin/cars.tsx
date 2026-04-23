import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetAdminCars, useUpdateAdminCar, useSetCarAvailability, getGetAdminCarsQueryKey } from "@workspace/api-client-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";

export function AdminCars() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cars, isLoading } = useGetAdminCars({ query: { queryKey: getGetAdminCarsQueryKey() } });
  const updateCar = useUpdateAdminCar();
  const setCarAvailability = useSetCarAvailability();
  
  const [editingPrice, setEditingPrice] = useState<{id: number, value: string} | null>(null);
  const [availabilityCar, setAvailabilityCar] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState<{from?: Date, to?: Date}>({});

  const handleToggleAvailability = (carId: number, currentStatus: boolean) => {
    updateCar.mutate({ id: carId, data: { isAvailable: !currentStatus } }, {
      onSuccess: () => {
        toast({ title: "Car updated", description: `Availability changed successfully.` });
        queryClient.invalidateQueries({ queryKey: getGetAdminCarsQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update availability", variant: "destructive" });
      }
    });
  };

  const handleSavePrice = (carId: number) => {
    if (!editingPrice) return;
    const price = parseInt(editingPrice.value, 10);
    
    if (isNaN(price)) {
      toast({ title: "Invalid price", variant: "destructive" });
      return;
    }

    updateCar.mutate({ id: carId, data: { pricePerDay: price } }, {
      onSuccess: () => {
        toast({ title: "Price updated successfully" });
        setEditingPrice(null);
        queryClient.invalidateQueries({ queryKey: getGetAdminCarsQueryKey() });
      },
      onError: () => {
        toast({ title: "Error updating price", variant: "destructive" });
      }
    });
  };

  const handleSetAvailabilityDates = (isAvailable: boolean) => {
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
        toast({ title: "Availability updated for selected dates" });
        setAvailabilityCar(null);
        setDateRange({});
      }
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Fleet Management</h1>
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Car</TableHead><TableHead>Price</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {[1, 2, 3].map(i => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-16" /></TableCell></TableRow>
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
        <h1 className="text-3xl font-serif font-bold tracking-tight">Fleet Management</h1>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead>Price Per Day (¥)</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cars?.map((car) => (
              <TableRow key={car.id}>
                <TableCell>
                  <div className="w-20 h-12 rounded overflow-hidden bg-muted">
                    <img src={car.imageUrl} alt={car.name} className="object-cover w-full h-full" />
                  </div>
                </TableCell>
                <TableCell className="font-medium">{car.name}</TableCell>
                <TableCell>{car.passengerCapacity}</TableCell>
                <TableCell>
                  {editingPrice?.id === car.id ? (
                    <div className="flex items-center gap-2">
                      <Input 
                        value={editingPrice.value} 
                        onChange={(e) => setEditingPrice({ ...editingPrice, value: e.target.value })}
                        className="w-24 h-8"
                        type="number"
                      />
                      <Button size="sm" variant="outline" onClick={() => handleSavePrice(car.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingPrice(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setEditingPrice({ id: car.id, value: car.pricePerDay.toString() })}>
                      <span>¥{car.pricePerDay.toLocaleString()}</span>
                      <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Switch 
                    checked={car.isAvailable} 
                    onCheckedChange={() => handleToggleAvailability(car.id, car.isAvailable)}
                    disabled={updateCar.isPending}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Dialog open={availabilityCar === car.id} onOpenChange={(open) => !open && setAvailabilityCar(null)}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => setAvailabilityCar(car.id)}>Date Overrides</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Set Availability Dates for {car.name}</DialogTitle>
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
                          <Button variant="outline" onClick={() => handleSetAvailabilityDates(true)} disabled={!dateRange.from || !dateRange.to || setCarAvailability.isPending}>
                            Mark Available
                          </Button>
                          <Button variant="destructive" onClick={() => handleSetAvailabilityDates(false)} disabled={!dateRange.from || !dateRange.to || setCarAvailability.isPending}>
                            Mark Unavailable
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
            {!cars?.length && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No cars found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}