import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { HALF_HOUR_TIMES, formatRentalTime, isRentalTime } from "@/lib/rental-time";

export const RentalTimeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }>(
  ({ className, placeholder, value, ...props }, ref) => (
    <select ref={ref} value={isRentalTime(String(value)) ? String(value) : ""} className={cn("h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>
      <option value="" disabled>{placeholder || "10:00 AM - 7:00 PM"}</option>
      {HALF_HOUR_TIMES.map(time => <option key={time} value={time}>{formatRentalTime(time)}</option>)}
    </select>
  ),
);
RentalTimeSelect.displayName = "RentalTimeSelect";
