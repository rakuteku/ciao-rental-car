import { useGetAdminBookings, getGetAdminBookingsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminBookings() {
  const { data: bookings, isLoading } = useGetAdminBookings({ query: { queryKey: getGetAdminBookingsQueryKey() } });

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Bookings</h1>
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Customer</TableHead><TableHead>Car</TableHead><TableHead>Dates</TableHead></TableRow></TableHeader>
            <TableBody>
              {[1, 2, 3].map(i => (
                <TableRow key={i}><TableCell><Skeleton className="h-4 w-8" /></TableCell><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-48" /></TableCell></TableRow>
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
        <h1 className="text-3xl font-serif font-bold tracking-tight">Recent Bookings</h1>
      </div>

      <div className="rounded-md border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Booking ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Car</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Locations</TableHead>
              <TableHead className="text-right">Total Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings?.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="font-mono text-xs">#{booking.id}</TableCell>
                <TableCell>
                  <div className="font-medium">{booking.name}</div>
                  <div className="text-xs text-muted-foreground">{booking.email}</div>
                  <div className="text-xs text-muted-foreground">{booking.phone}</div>
                </TableCell>
                <TableCell className="font-medium">{booking.carName}</TableCell>
                <TableCell className="text-sm">
                  <div>{format(new Date(booking.pickupDate), "MMM d, yyyy")}</div>
                  <div className="text-muted-foreground">to {format(new Date(booking.returnDate), "MMM d, yyyy")}</div>
                </TableCell>
                <TableCell className="text-sm">
                  <div><span className="text-muted-foreground">From:</span> {booking.pickupLocation}</div>
                  <div><span className="text-muted-foreground">To:</span> {booking.returnLocation}</div>
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  ¥{booking.totalPrice.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {!bookings?.length && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No bookings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}