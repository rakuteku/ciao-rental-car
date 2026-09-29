import { Link } from "wouter";
import { CalendarClock, CarFront, ChevronRight, RefreshCw } from "lucide-react";
import { usePartnerReservations } from "@/hooks/use-rental-operations";
import { arrayFrom, record, usePartnerText } from "./shared";

export function PartnerReservationsPage() {
  const text = usePartnerText();
  const query = usePartnerReservations();
  const reservations = arrayFrom(query.data, ["reservations", "items"]);
  return <main className="min-h-screen bg-[#f7f7f4] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-amber-700">Partner operations</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">{text("Rental reservations", "レンタル予約")}</h1>
          <p className="mt-2 text-sm text-slate-600">{text("Prepare a secure pickup handover, record return condition, and close trips from their audit-ready ledger.", "貸渡準備、返却状態の記録、監査可能な台帳に基づくトリップの締め処理を行います。")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/partner/inventory" className="inline-flex min-h-10 items-center rounded-md border bg-white px-4 text-sm font-medium">{text("Partner dashboard", "パートナーダッシュボード")}</Link>
          <button data-testid="button-refresh-reservations" type="button" onClick={() => void query.refetch()} disabled={query.isFetching} className="inline-flex min-h-10 items-center gap-2 rounded-md border bg-white px-4 text-sm font-medium disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />{text("Refresh", "更新")}
          </button>
        </div>
      </header>
      {query.isLoading ? <p role="status" className="rounded-lg border bg-white p-5">{text("Loading reservations…", "予約を読み込み中…")}</p>
        : query.isError ? <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p>{query.error instanceof Error ? query.error.message : text("Could not load reservations.", "予約を読み込めませんでした。")}</p>
          <button type="button" className="rounded border border-red-300 bg-white px-3 py-2" onClick={() => void query.refetch()}>{text("Try again", "再試行")}</button>
        </div>
          : reservations.length === 0 ? <p className="rounded-lg border bg-white p-5 text-sm text-slate-600">{text("No rental reservations are assigned to this operator yet.", "この事業者に割り当てられたレンタル予約はまだありません。")}</p>
            : <div className="grid gap-4">{reservations.map((item, index) => {
              const row = record(item);
              const reservation = record(row.reservation);
              const id = Number(reservation.id ?? row.id);
              const readiness = record(row.readiness);
              const ready = Boolean(readiness.ready);
              const missing = Array.isArray(readiness.missing) ? readiness.missing as string[] : [];
              const driverNames = Array.isArray(row.drivers) ? row.drivers.map((driver: Record<string, any>) => driver.fullName).filter(Boolean).join(", ") : "";
              return <Link key={id || index} href={`/partner/reservations/${id}`} data-testid={`link-partner-reservation-${id}`} className="block rounded-xl border bg-white p-5 shadow-sm transition hover:border-amber-400 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold"><CarFront className="h-4 w-4" />{text("Reservation", "予約")} #{id} · {reservation.status ?? "unknown"}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><CalendarClock className="h-4 w-4" />{reservation.pickupAt ? new Date(reservation.pickupAt).toLocaleString() : "—"} → {reservation.returnAt ? new Date(reservation.returnAt).toLocaleString() : "—"}</p>
                    <p className="mt-1 text-sm text-slate-600">{reservation.pickupLocation ?? "—"} → {reservation.returnLocation ?? "—"}</p>
                    {driverNames && <p className="mt-2 text-sm text-slate-700">{text("Drivers", "運転者")}: {driverNames}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span data-testid={`status-pickup-readiness-${id}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                      {ready ? text("Pickup ready", "貸渡準備完了") : text(`${missing.length} pickup item(s) outstanding`, `未完了項目 ${missing.length} 件`)}
                    </span><ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>;
            })}</div>}
    </div>
  </main>;
}