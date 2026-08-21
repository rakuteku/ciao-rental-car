import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminRentalAvailabilityBlocksQueryKey,
  getGetAdminRentalReservationsQueryKey,
  getGetAdminRentalVehiclesQueryKey,
  type RentalAvailabilityBlock,
  type RentalReservation,
  type RentalVehicle,
  useCreateAdminRentalAvailabilityBlock,
  useDeleteAdminRentalAvailabilityBlock,
  useGetAdminRentalAvailabilityBlocks,
  useGetAdminRentalReservations,
  useGetAdminRentalVehicles,
  useUpdateAdminRentalAvailabilityBlock,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CopyPlus,
  Hammer,
  Plus,
  Wrench,
} from "lucide-react";

type CalendarView = "timeline" | "day" | "week" | "month";
type Slot = { vehicleId?: number; start: Date; end: Date };
type CalendarEvent =
  | { kind: "block"; id: number; vehicleId: number; start: Date; end: Date; label: string; status: string; block: RentalAvailabilityBlock }
  | { kind: "reservation"; id: number; vehicleId: number; start: Date; end: Date; label: string; status: string; reservation: RentalReservation }
  | { kind: "buffer"; id: number; vehicleId: number; start: Date; end: Date; label: string; status: string };

const BLOCK_REASONS = [
  ["maintenance", "Maintenance"],
  ["inspection", "Inspection"],
  ["cleaning", "Cleaning"],
  ["manual", "Personal use / Admin blocked"],
  ["other", "Accident repair / Other"],
  ["holiday", "Vehicle registration / Shaken / Insurance renewal"],
] as const;

const EVENT_STYLE: Record<string, { bar: string; dot: string; label: string }> = {
  confirmed: { bar: "bg-blue-600 border-blue-700 text-white", dot: "bg-blue-600", label: "Confirmed" },
  pending_payment: { bar: "bg-yellow-400 border-yellow-500 text-yellow-950", dot: "bg-yellow-400", label: "Pending reservation" },
  inquiry: { bar: "bg-yellow-300 border-yellow-400 text-yellow-950", dot: "bg-yellow-300", label: "Inquiry" },
  in_rental: { bar: "bg-teal-600 border-teal-700 text-white", dot: "bg-teal-600", label: "Picked up" },
  overdue: { bar: "bg-amber-500 border-amber-600 text-amber-950", dot: "bg-amber-500", label: "Returned late" },
  return_initiated: { bar: "bg-orange-500 border-orange-600 text-white", dot: "bg-orange-500", label: "Cleaning" },
  maintenance: { bar: "bg-slate-600 border-slate-700 text-white", dot: "bg-slate-600", label: "Maintenance" },
  inspection: { bar: "bg-slate-500 border-slate-600 text-white", dot: "bg-slate-500", label: "Inspection" },
  cleaning: { bar: "bg-orange-500 border-orange-600 text-white", dot: "bg-orange-500", label: "Cleaning" },
  manual: { bar: "bg-red-600 border-red-700 text-white", dot: "bg-red-600", label: "Admin blocked" },
  other: { bar: "bg-red-500 border-red-600 text-white", dot: "bg-red-500", label: "Blocked" },
  holiday: { bar: "bg-red-500 border-red-600 text-white", dot: "bg-red-500", label: "Blocked" },
  buffer: { bar: "border-slate-400 text-slate-700", dot: "bg-slate-400", label: "Cleaning buffer" },
};

function startOfDay(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addHours(value: Date, hours: number) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function startOfWeek(value: Date) {
  const day = startOfDay(value);
  const offset = (day.getDay() + 6) % 7;
  return addDays(day, -offset);
}

function datetimeInputValue(value: Date) {
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function readInitialVehicleId() {
  const raw = new URLSearchParams(window.location.search).get("vehicleId");
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : undefined;
}

function formatDate(value: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-JP", options).format(value);
}

function overlaps(event: CalendarEvent, start: Date, end: Date) {
  return event.start < end && event.end > start;
}

function getEventStyle(status: string) {
  return EVENT_STYLE[status] ?? EVENT_STYLE.other;
}

function BlockForm({
  vehicles,
  initial,
  editing,
  pending,
  onSave,
}: {
  vehicles: RentalVehicle[];
  initial: Slot | RentalAvailabilityBlock;
  editing?: RentalAvailabilityBlock | null;
  pending: boolean;
  onSave: (values: { vehicleIds: number[]; start: string; end: string; reason: string; notes: string; isRecurring: boolean; recurrenceRule?: string; applyFuture?: boolean }) => void;
}) {
  const [vehicleIds, setVehicleIds] = useState<number[]>(() => editing ? [editing.vehicleId] : initial && "vehicleId" in initial && initial.vehicleId ? [initial.vehicleId] : vehicles.slice(0, 1).map((vehicle) => vehicle.id));
  const startValue = initial && "startAt" in initial ? new Date(initial.startAt) : initial.start;
  const endValue = initial && "endAt" in initial ? new Date(initial.endAt) : initial.end;
  const [start, setStart] = useState(datetimeInputValue(startValue));
  const [end, setEnd] = useState(datetimeInputValue(endValue));
  const [reason, setReason] = useState(editing?.reason ?? "manual");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [isRecurring, setIsRecurring] = useState(editing?.isRecurring ?? false);
  const recurringRule = editing?.recurrenceRule?.match(/^FREQ=(DAILY|WEEKLY|MONTHLY);UNTIL=([^;]+)(?:;SERIES=[a-z0-9-]+)?$/i);
  const [frequency, setFrequency] = useState(recurringRule?.[1].toLowerCase() ?? "weekly");
  const [repeatEnd, setRepeatEnd] = useState(() => {
    const until = recurringRule?.[2] ? new Date(recurringRule[2]) : null;
    return datetimeInputValue(until && !Number.isNaN(until.getTime()) ? until : addDays(endValue, 28)).slice(0, 10);
  });
  const [applyFuture, setApplyFuture] = useState(false);

  useEffect(() => {
    if (!editing && initial && "vehicleId" in initial && initial.vehicleId) setVehicleIds([initial.vehicleId]);
  }, [editing, initial]);

  const toggleVehicle = (id: number) => setVehicleIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!vehicleIds.length || !start || !end) return;
    if (new Date(end) <= new Date(start)) return;
    onSave({
      vehicleIds,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      reason,
      notes,
      isRecurring,
      recurrenceRule: isRecurring ? `FREQ=${frequency.toUpperCase()};UNTIL=${new Date(`${repeatEnd}T23:59`).toISOString()}` : undefined,
      applyFuture,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label>Vehicles</Label>
        <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border p-3">
          {vehicles.map((vehicle) => (
            <label key={vehicle.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={vehicleIds.includes(vehicle.id)} onCheckedChange={() => toggleVehicle(vehicle.id)} />
              <span>{vehicle.publicTitle}</span>
              <span className="text-xs text-muted-foreground">{vehicle.vehicleClass}</span>
            </label>
          ))}
        </div>
        {vehicleIds.length > 1 && <p className="text-xs text-muted-foreground">The same block will be created for each selected vehicle.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="block-start">Start date & time</Label>
          <Input id="block-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="block-end">End date & time</Label>
          <Input id="block-end" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Reason</Label>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BLOCK_REASONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        {(reason === "maintenance" || reason === "inspection") && (
          <p className="flex items-center gap-1.5 text-xs text-slate-600"><Wrench className="h-3.5 w-3.5" /> This immediately removes the vehicle from public availability for maintenance handling.</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="block-notes">Notes</Label>
        <Textarea id="block-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note for the operations team…" rows={3} />
      </div>
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="repeat-block">Repeat this block</Label>
            <p className="text-xs text-muted-foreground">Use this for planned recurring work.</p>
          </div>
          <Switch id="repeat-block" checked={isRecurring} onCheckedChange={setIsRecurring} />
        </div>
        {isRecurring && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={repeatEnd} onChange={(event) => setRepeatEnd(event.target.value)} aria-label="Repeat end date" required />
          </div>
        )}
      </div>
      {editing?.isRecurring && (
        <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3">
          <Label>Apply edit to</Label>
          <Select value={applyFuture ? "future" : "this"} onValueChange={(value) => setApplyFuture(value === "future")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this">This block only</SelectItem>
              <SelectItem value="future">This block and all future blocks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending || !vehicleIds.length}>{pending ? "Saving…" : editing ? "Save block" : "Block dates"}</Button>
      </DialogFooter>
    </form>
  );
}

function ManualReservationSheet({
  slot,
  vehicles,
  open,
  onOpenChange,
  onCreated,
}: {
  slot: Slot | null;
  vehicles: RentalVehicle[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const defaultStart = slot?.start ?? new Date();
  const defaultEnd = slot?.end ?? addHours(defaultStart, 1);
  const [vehicleId, setVehicleId] = useState(slot?.vehicleId ? String(slot.vehicleId) : "");
  const [start, setStart] = useState(datetimeInputValue(defaultStart));
  const [end, setEnd] = useState(datetimeInputValue(defaultEnd));
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupLocation, setPickupLocation] = useState("CIAO Rental Sapporo");
  const [returnLocation, setReturnLocation] = useState("CIAO Rental Sapporo");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setVehicleId(slot?.vehicleId ? String(slot.vehicleId) : "");
    setStart(datetimeInputValue(slot?.start ?? new Date()));
    setEnd(datetimeInputValue(slot?.end ?? addHours(slot?.start ?? new Date(), 1)));
  }, [open, slot]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const id = Number(vehicleId);
    if (!id || new Date(end) <= new Date(start)) {
      toast({ title: "Check reservation dates", description: "Choose a vehicle and an end time after the pickup time.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const holdResponse = await fetch("/api/rental/reservations/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: id, pickupAt: new Date(start).toISOString(), returnAt: new Date(end).toISOString() }),
      });
      const hold = await holdResponse.json() as { holdId?: number; error?: string };
      if (!holdResponse.ok || !hold.holdId) throw new Error(hold.error ?? "Unable to reserve this time");

      const reservationResponse = await fetch("/api/rental/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdId: hold.holdId,
          vehicleId: id,
          pickupLocation,
          returnLocation,
          driver: { fullName, email, phone },
          source: "admin_calendar",
        }),
      });
      const reservation = await reservationResponse.json() as { id?: number; error?: string };
      if (!reservationResponse.ok || !reservation.id) throw new Error(reservation.error ?? "Unable to create reservation");
      toast({ title: "Reservation created", description: `Reservation #${reservation.id} is now on the calendar.` });
      onOpenChange(false);
      onCreated();
    } catch (error) {
      toast({ title: "Unable to create reservation", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-serif">Create manual reservation</SheetTitle>
          <SheetDescription>The selected calendar slot is prefilled. A reservation hold is created before the booking is saved.</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Choose a vehicle" /></SelectTrigger>
              <SelectContent>{vehicles.map((vehicle) => <SelectItem key={vehicle.id} value={String(vehicle.id)}>{vehicle.publicTitle}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Pickup</Label><Input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required /></div>
            <div className="space-y-2"><Label>Return</Label><Input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Customer name</Label><Input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={(event) => setPhone(event.target.value)} required /></div>
          </div>
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="space-y-2"><Label>Pickup location</Label><Input value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} required /></div>
          <div className="space-y-2"><Label>Return location</Label><Input value={returnLocation} onChange={(event) => setReturnLocation(event.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creating reservation…" : "Create reservation"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EventBar({ event, rangeStart, rangeEnd, onClick }: { event: CalendarEvent; rangeStart: Date; rangeEnd: Date; onClick?: () => void }) {
  const total = rangeEnd.getTime() - rangeStart.getTime();
  const visibleStart = Math.max(event.start.getTime(), rangeStart.getTime());
  const visibleEnd = Math.min(event.end.getTime(), rangeEnd.getTime());
  if (visibleEnd <= visibleStart) return null;
  const style = getEventStyle(event.status);
  const left = ((visibleStart - rangeStart.getTime()) / total) * 100;
  const width = ((visibleEnd - visibleStart) / total) * 100;
  const isMaintenance = event.status === "maintenance" || event.status === "inspection";
  if (event.kind === "buffer") {
    return <div className="absolute top-2 bottom-2 rounded border border-slate-400 opacity-80" style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundImage: "repeating-linear-gradient(135deg, rgba(100,116,139,.18) 0 4px, transparent 4px 8px)" }} title={`${event.label} — vehicle not available until ${formatDate(event.end, { dateStyle: "medium", timeStyle: "short" })}`} />;
  }
  return (
    <button type="button" onClick={(click) => { click.stopPropagation(); onClick?.(); }} className={`absolute top-2 h-8 overflow-hidden rounded border px-2 text-left text-xs font-medium shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-ring ${style.bar} ${isMaintenance ? "bg-[repeating-linear-gradient(135deg,rgba(255,255,255,.16)_0_5px,transparent_5px_10px)]" : ""}`} style={{ left: `${left}%`, width: `${Math.max(width, 1.2)}%` }} title={`${event.label}: ${formatDate(event.start, { dateStyle: "medium", timeStyle: "short" })} – ${formatDate(event.end, { dateStyle: "medium", timeStyle: "short" })}`}>
      <span className="flex items-center gap-1 whitespace-nowrap">{isMaintenance && <Wrench className="h-3 w-3 shrink-0" />}{event.label}</span>
    </button>
  );
}

export function AdminRentalAvailability() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialVehicleId = useMemo(readInitialVehicleId, []);
  const { data: vehicles = [], isLoading: loadingVehicles } = useGetAdminRentalVehicles({ query: { queryKey: getGetAdminRentalVehiclesQueryKey(), refetchInterval: 30_000 } });
  const { data: blocks = [], isLoading: loadingBlocks } = useGetAdminRentalAvailabilityBlocks(undefined, { query: { queryKey: getGetAdminRentalAvailabilityBlocksQueryKey(), refetchInterval: 30_000 } });
  const { data: reservations = [], isLoading: loadingReservations } = useGetAdminRentalReservations(undefined, { query: { queryKey: getGetAdminRentalReservationsQueryKey(), refetchInterval: 30_000 } });
  const { data: bufferData } = useQuery({
    queryKey: ["admin-rental-turnaround-buffer"],
    queryFn: async () => {
      const response = await fetch("/api/admin/rental/settings/turnaround-buffer");
      if (!response.ok) throw new Error("Unable to load turnaround buffer");
      return response.json() as Promise<{ turnaroundBufferHours: number }>;
    },
    staleTime: 60_000,
  });
  const createBlock = useCreateAdminRentalAvailabilityBlock();
  const updateBlock = useUpdateAdminRentalAvailabilityBlock();
  const deleteBlock = useDeleteAdminRentalAvailabilityBlock();

  const [view, setView] = useState<CalendarView>("timeline");
  const [anchorDate, setAnchorDate] = useState(startOfWeek(new Date()));
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>(initialVehicleId ? [initialVehicleId] : []);
  const [vehicleClass, setVehicleClass] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newSlot, setNewSlot] = useState<Slot | null>(null);
  const [manualSlot, setManualSlot] = useState<Slot | null>(null);
  const [editingBlock, setEditingBlock] = useState<RentalAvailabilityBlock | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dragSlot, setDragSlot] = useState<Slot | null>(null);
  const dragRef = useRef<{ vehicleId: number; start: Date; grid: HTMLDivElement } | null>(null);
  const cellDragRef = useRef<Slot | null>(null);

  const bufferHours = bufferData?.turnaroundBufferHours ?? 2;
  const range = useMemo(() => {
    if (view === "day") {
      const start = startOfDay(anchorDate);
      return { start, end: addDays(start, 1), days: 1 };
    }
    if (view === "month") {
      const start = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const gridStart = startOfWeek(start);
      return { start: gridStart, end: addDays(gridStart, 42), days: 42 };
    }
    const start = startOfWeek(anchorDate);
    return { start, end: addDays(start, 7), days: 7 };
  }, [anchorDate, view]);

  const displayedVehicles = useMemo(() => vehicles.filter((vehicle) =>
    (!selectedVehicleIds.length || selectedVehicleIds.includes(vehicle.id)) &&
    (vehicleClass === "all" || vehicle.vehicleClass === vehicleClass),
  ), [vehicles, selectedVehicleIds, vehicleClass]);
  const displayedVehicleIds = useMemo(() => new Set(displayedVehicles.map((vehicle) => vehicle.id)), [displayedVehicles]);

  const events = useMemo<CalendarEvent[]>(() => {
    const reservationEvents: CalendarEvent[] = reservations
      .filter((reservation) => reservation.status !== "cancelled" && reservation.status !== "refunded")
      .map((reservation) => ({
        kind: "reservation" as const,
        id: reservation.id,
        vehicleId: reservation.vehicleId,
        start: new Date(reservation.pickupAt),
        end: new Date(reservation.returnAt),
        label: `Reservation #${reservation.id}`,
        status: reservation.status,
        reservation,
      }));
    const blockEvents: CalendarEvent[] = blocks.map((block) => ({
      kind: "block" as const,
      id: block.id,
      vehicleId: block.vehicleId,
      start: new Date(block.startAt),
      end: new Date(block.endAt),
      label: getEventStyle(block.reason).label,
      status: block.reason,
      block,
    }));
    const buffers: CalendarEvent[] = reservations
      .filter((reservation) => reservation.status !== "cancelled" && reservation.status !== "refunded")
      .map((reservation) => ({
        kind: "buffer" as const,
        id: reservation.id,
        vehicleId: reservation.vehicleId,
        start: new Date(reservation.returnAt),
        end: addHours(new Date(reservation.returnAt), bufferHours),
        label: "Cleaning buffer",
        status: "buffer",
      }));
    return [...reservationEvents, ...blockEvents, ...buffers].filter((event) =>
      displayedVehicleIds.has(event.vehicleId) &&
      (statusFilter === "all" || event.status === statusFilter || (statusFilter === "reservation" && event.kind === "reservation")) &&
      (!selectedVehicleIds.length || selectedVehicleIds.includes(event.vehicleId)),
    );
  }, [blocks, bufferHours, displayedVehicleIds, reservations, selectedVehicleIds, statusFilter]);

  const invalidateCalendar = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminRentalAvailabilityBlocksQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminRentalVehiclesQueryKey() });
  };

  function movePeriod(direction: -1 | 1) {
    if (view === "month") setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() + direction, 1));
    else setAnchorDate((date) => addDays(date, direction * (view === "day" ? 1 : 7)));
  }

  function openManualReservation(slot: Slot) {
    setManualSlot(slot);
  }

  useEffect(() => {
    function handleKeyboardNavigation(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, [contenteditable='true']")) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        movePeriod(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        movePeriod(1);
      }
    }
    window.addEventListener("keydown", handleKeyboardNavigation);
    return () => window.removeEventListener("keydown", handleKeyboardNavigation);
  });

  function beginTimelineDrag(event: React.MouseEvent<HTMLDivElement>, vehicleId: number) {
    if ((event.target as HTMLElement).closest("button")) return;
    const grid = event.currentTarget;
    const position = Math.max(0, Math.min(1, event.nativeEvent.offsetX / grid.clientWidth));
    const start = new Date(range.start.getTime() + position * (range.end.getTime() - range.start.getTime()));
    start.setMinutes(Math.floor(start.getMinutes() / 30) * 30, 0, 0);
    dragRef.current = { vehicleId, start, grid };
    setDragSlot({ vehicleId, start, end: addHours(start, 1) });
  }

  function updateTimelineDrag(event: React.MouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = drag.grid.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const end = new Date(range.start.getTime() + position * (range.end.getTime() - range.start.getTime()));
    end.setMinutes(Math.ceil(end.getMinutes() / 30) * 30, 0, 0);
    if (end > drag.start) setDragSlot({ vehicleId: drag.vehicleId, start: drag.start, end });
  }

  function endTimelineDrag() {
    if (dragSlot && dragSlot.end > dragSlot.start) setNewSlot(dragSlot);
    dragRef.current = null;
    setDragSlot(null);
  }

  function createFromForm(values: { vehicleIds: number[]; start: string; end: string; reason: string; notes: string; isRecurring: boolean; recurrenceRule?: string }) {
    Promise.all(values.vehicleIds.map((vehicleId) => createBlock.mutateAsync({
      data: { vehicleId, startAt: values.start, endAt: values.end, reason: values.reason, notes: values.notes || undefined, isRecurring: values.isRecurring, recurrenceRule: values.recurrenceRule },
    }))).then(() => {
      toast({ title: "Dates blocked", description: `${values.vehicleIds.length} vehicle${values.vehicleIds.length === 1 ? "" : "s"} updated.` });
      setNewSlot(null);
      invalidateCalendar();
    }).catch(() => toast({ title: "Unable to block dates", description: "Please check the dates and try again.", variant: "destructive" }));
  }

  async function updateFromForm(values: { vehicleIds: number[]; start: string; end: string; reason: string; notes: string; isRecurring: boolean; recurrenceRule?: string; applyFuture?: boolean }) {
    if (!editingBlock) return;
    try {
      const data = {
        vehicleId: values.vehicleIds[0],
        startAt: values.start,
        endAt: values.end,
        reason: values.reason,
        notes: values.notes || undefined,
        isRecurring: values.isRecurring,
        recurrenceRule: values.applyFuture ? values.recurrenceRule : editingBlock.recurrenceRule ?? values.recurrenceRule,
      };
      if (values.applyFuture && editingBlock.isRecurring) {
        const response = await fetch(`/api/admin/rental/availability-blocks/${editingBlock.id}/future`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          throw new Error(result.error ?? "Unable to update future blocks");
        }
        toast({ title: "Recurring blocks updated" });
      } else {
        await updateBlock.mutateAsync({ id: editingBlock.id, data });
        toast({ title: "Block updated" });
      }
      setEditingBlock(null);
      invalidateCalendar();
    } catch (error) {
      toast({ title: "Unable to update block", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  }

  function deleteCurrentBlock() {
    if (!editingBlock) return;
    deleteBlock.mutate({ id: editingBlock.id }, {
      onSuccess: () => {
        toast({ title: "Block deleted" });
        setDeleteConfirm(false);
        setEditingBlock(null);
        invalidateCalendar();
      },
      onError: () => toast({ title: "Unable to delete block", variant: "destructive" }),
    });
  }

  const loading = loadingVehicles || loadingBlocks || loadingReservations;
  const dayColumns = view === "day" ? [range.start] : Array.from({ length: 7 }, (_, index) => addDays(range.start, index));
  const title = view === "month"
    ? formatDate(anchorDate, { month: "long", year: "numeric" })
    : view === "day"
      ? formatDate(range.start, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : `${formatDate(range.start, { month: "short", day: "numeric" })} – ${formatDate(addDays(range.end, -1), { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-6 p-5 md:p-8">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><CalendarDays className="h-4 w-4" /> Rental operations</div>
          <h1 className="font-serif text-3xl font-bold tracking-tight">Availability calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage bookings, maintenance, and time-sensitive vehicle blocks in one place.</p>
        </div>
        <Button onClick={() => setNewSlot({ start: new Date(), end: addHours(new Date(), 1) })} className="gap-2"><Plus className="h-4 w-4" /> Block dates</Button>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1.3fr_repeat(2,minmax(150px,1fr))]">
          <div className="space-y-1.5">
            <Label>Vehicles</Label>
            <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox checked={selectedVehicleIds.length === 0} onCheckedChange={() => setSelectedVehicleIds([])} />
                All
              </label>
              {vehicles.map((vehicle) => (
                <label key={vehicle.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <Checkbox checked={selectedVehicleIds.includes(vehicle.id)} onCheckedChange={() => setSelectedVehicleIds((ids) => ids.includes(vehicle.id) ? ids.filter((id) => id !== vehicle.id) : [...ids, vehicle.id])} />
                  <span className="max-w-28 truncate">{vehicle.publicTitle}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle type</Label>
            <Select value={vehicleClass} onValueChange={setVehicleClass}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {[...new Set(vehicles.map((vehicle) => vehicle.vehicleClass))].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Booking status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="reservation">All reservations</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="pending_payment">Pending</SelectItem>
                <SelectItem value="in_rental">Picked up</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="manual">Admin blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
          {["confirmed", "pending_payment", "in_rental", "cleaning", "maintenance", "manual", "overdue", "buffer"].map((status) => <span key={status} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${getEventStyle(status).dot}`} />{getEventStyle(status).label}</span>)}
          <span className="ml-auto flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {bufferHours}h cleaning buffer</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous period" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setAnchorDate(startOfWeek(new Date()))}>Today</Button>
          <Button variant="outline" size="icon" aria-label="Next period" onClick={() => movePeriod(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Input type="date" value={datetimeInputValue(anchorDate).slice(0, 10)} onChange={(event) => event.target.value && setAnchorDate(startOfWeek(new Date(`${event.target.value}T12:00`)))} className="ml-2 w-36" aria-label="Jump to date" />
        </div>
        <div className="text-center font-semibold">{title}</div>
        <div className="flex rounded-md border p-0.5">
          {(["timeline", "day", "week", "month"] as CalendarView[]).map((item) => <Button key={item} size="sm" variant={view === item ? "default" : "ghost"} className="capitalize" onClick={() => setView(item)}>{item}</Button>)}
        </div>
      </div>

      {loading ? <div className="space-y-3 rounded-lg border p-5">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : displayedVehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">No vehicles match the current filters.</div>
      ) : view === "timeline" ? (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <div className="min-w-[1050px]">
            <div className="grid grid-cols-[250px_1fr] border-b bg-muted/40">
              <div className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vehicle</div>
              <div className="relative grid grid-cols-7">
                {Array.from({ length: 7 }, (_, index) => {
                  const day = addDays(range.start, index);
                  return <div key={index} className="border-l p-2 text-center text-xs"><span className="font-semibold">{formatDate(day, { weekday: "short" })}</span><span className="ml-1 text-muted-foreground">{formatDate(day, { month: "short", day: "numeric" })}</span></div>;
                })}
              </div>
            </div>
            {displayedVehicles.map((vehicle) => {
              const image = vehicle.images?.find((item) => item.isCover)?.url ?? vehicle.images?.[0]?.url;
              const rowEvents = events.filter((event) => event.vehicleId === vehicle.id && overlaps(event, range.start, range.end));
              return (
                <div key={vehicle.id} className="grid grid-cols-[250px_1fr] border-b last:border-b-0">
                  <div className="flex items-center gap-3 p-3">
                    <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-muted">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">CIAO</div>}</div>
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{vehicle.publicTitle}</p><p className="text-xs capitalize text-muted-foreground">{vehicle.vehicleClass} · {vehicle.status}</p></div>
                  </div>
                  <div className="relative h-14 cursor-crosshair bg-[linear-gradient(to_right,transparent_calc(100%_-_1px),hsl(var(--border))_calc(100%_-_1px)] bg-[length:14.2857%_100%]" onMouseDown={(event) => beginTimelineDrag(event, vehicle.id)} onMouseMove={updateTimelineDrag} onMouseUp={endTimelineDrag} onMouseLeave={() => dragRef.current && endTimelineDrag()} onContextMenu={(event) => { if ((event.target as HTMLElement).closest("button")) return; event.preventDefault(); const position = Math.max(0, Math.min(1, event.nativeEvent.offsetX / event.currentTarget.clientWidth)); const start = new Date(range.start.getTime() + position * (range.end.getTime() - range.start.getTime())); start.setMinutes(Math.floor(start.getMinutes() / 30) * 30, 0, 0); openManualReservation({ vehicleId: vehicle.id, start, end: addHours(start, 1) }); }} title="Drag to block time, or right-click to create a reservation">
                    {rowEvents.map((event) => <EventBar key={`${event.kind}-${event.id}`} event={event} rangeStart={range.start} rangeEnd={range.end} onClick={event.kind === "block" ? () => setEditingBlock(event.block) : undefined} />)}
                    {dragSlot?.vehicleId === vehicle.id && <EventBar event={{ kind: "block", id: -1, vehicleId: vehicle.id, start: dragSlot.start, end: dragSlot.end, label: "New block", status: "manual", block: {} as RentalAvailabilityBlock }} rangeStart={range.start} rangeEnd={range.end} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "month" ? (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <div className="grid min-w-[880px] grid-cols-7 border-b bg-muted/40">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="border-r p-2 text-center text-xs font-semibold last:border-r-0">{day}</div>)}</div>
          <div className="grid min-w-[880px] grid-cols-7">
            {Array.from({ length: 42 }, (_, index) => {
              const day = addDays(range.start, index);
              const inMonth = day.getMonth() === anchorDate.getMonth();
              const daily = events.filter((event) => overlaps(event, day, addDays(day, 1)) && event.kind !== "buffer").slice(0, 3);
              return <button type="button" key={day.toISOString()} onClick={() => setNewSlot({ start: addHours(day, 9), end: addHours(day, 17) })} className={`min-h-32 border-b border-r p-2 text-left hover:bg-muted/30 ${inMonth ? "" : "bg-muted/20 text-muted-foreground"}`}><span className="text-sm font-medium">{day.getDate()}</span><div className="mt-2 space-y-1">{daily.map((event) => <span key={`${event.kind}-${event.id}`} className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${getEventStyle(event.status).bar}`}>{event.label}</span>)}</div></button>;
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <div className={`grid min-w-[${view === "day" ? "680" : "960"}px]`} style={{ gridTemplateColumns: `64px repeat(${dayColumns.length}, minmax(130px, 1fr))` }}>
            <div className="border-b bg-muted/40" />
            {dayColumns.map((day) => <div key={day.toISOString()} className="border-b border-l bg-muted/40 p-2 text-center"><p className="text-xs text-muted-foreground">{formatDate(day, { weekday: "short" })}</p><p className="font-semibold">{formatDate(day, { month: "short", day: "numeric" })}</p></div>)}
            {Array.from({ length: 16 }, (_, hourOffset) => {
              const hour = hourOffset + 6;
              return [
                <div key={`label-${hour}`} className="h-16 border-b pr-2 pt-1 text-right text-xs text-muted-foreground">{String(hour).padStart(2, "0")}:00</div>,
                ...dayColumns.map((day) => {
                  const cellStart = addHours(day, hour);
                  const dayEvents = events.filter((event) => event.kind !== "buffer" && overlaps(event, cellStart, addHours(cellStart, 1)));
                  return <button type="button" key={`${day.toISOString()}-${hour}`} onMouseDown={() => { const slot = { vehicleId: selectedVehicleIds[0] ?? displayedVehicles[0]?.id, start: cellStart, end: addHours(cellStart, 1) }; cellDragRef.current = slot; setDragSlot(slot); }} onMouseUp={() => { if (cellDragRef.current) { setNewSlot(cellDragRef.current); cellDragRef.current = null; setDragSlot(null); } }} className="relative h-16 border-b border-l text-left hover:bg-muted/30">{dayEvents.map((event) => <span key={`${event.kind}-${event.id}`} onClick={(click) => { click.stopPropagation(); if (event.kind === "block") setEditingBlock(event.block); }} className={`absolute inset-x-1 top-1 truncate rounded px-1 py-0.5 text-[10px] ${getEventStyle(event.status).bar}`}>{event.label}</span>)}</button>;
                }),
              ];
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:flex-row sm:items-center">
        <div className="flex items-start gap-2"><Hammer className="mt-0.5 h-4 w-4 text-slate-600" /><p><span className="font-medium">Drag an empty timeline slot</span> to block exact times. Hatched grey bars are the required turnaround period after each booking.</p></div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => openManualReservation({ vehicleId: selectedVehicleIds[0] ?? displayedVehicles[0]?.id, start: range.start, end: addHours(range.start, 1) })}><CopyPlus className="h-4 w-4" /> Create reservation</Button>
      </div>

      <Dialog open={Boolean(newSlot)} onOpenChange={(open) => !open && setNewSlot(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif text-xl">Block dates</DialogTitle><DialogDescription>Set an exact unavailable period for one or more vehicles.</DialogDescription></DialogHeader>
          {newSlot && <BlockForm vehicles={vehicles} initial={newSlot} pending={createBlock.isPending} onSave={createFromForm} />}
          {newSlot && <div className="border-t pt-4"><Button variant="link" className="h-auto px-0 text-sm" onClick={() => { setNewSlot(null); openManualReservation(newSlot); }}>Create a manual reservation for this slot instead</Button></div>}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingBlock)} onOpenChange={(open) => !open && setEditingBlock(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif text-xl">Edit availability block</DialogTitle><DialogDescription>{editingBlock?.isRecurring ? "This is a recurring block. Changes apply to this saved block." : "Update the unavailable period or remove it from the calendar."}</DialogDescription></DialogHeader>
          {editingBlock && <BlockForm key={editingBlock.id} vehicles={vehicles} initial={editingBlock} editing={editingBlock} pending={updateBlock.isPending} onSave={updateFromForm} />}
          <div className="border-t pt-4"><Button type="button" variant="destructive" className="gap-2" onClick={() => setDeleteConfirm(true)}><AlertTriangle className="h-4 w-4" /> Delete block</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete this block?</DialogTitle><DialogDescription>This immediately makes the time available again, unless a reservation or another block still overlaps it.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteConfirm(false)}>Keep block</Button><Button variant="destructive" disabled={deleteBlock.isPending} onClick={deleteCurrentBlock}>{deleteBlock.isPending ? "Deleting…" : "Delete block"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualReservationSheet
        slot={manualSlot}
        vehicles={vehicles}
        open={Boolean(manualSlot)}
        onOpenChange={(open) => !open && setManualSlot(null)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: getGetAdminRentalReservationsQueryKey() });
          setManualSlot(null);
        }}
      />
    </div>
  );
}