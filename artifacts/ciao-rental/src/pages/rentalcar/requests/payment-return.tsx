import { useParams, useSearch, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLanguage, localizedPath } from "@/lib/language";
import { getRentalPaymentState } from "@/lib/rental-marketplace";

const confirmedReservationStatuses = new Set([
  "confirmed",
  "driver_documents_pending",
  "driver_documents_under_review",
  "driver_documents_rejected",
  "awaiting_pickup",
  "vehicle_dispatched",
  "in_rental",
  "overdue",
  "return_initiated",
  "return_completed",
  "inspection_pending",
  "damage_assessed",
  "deposit_refunded",
]);
const terminalPaymentStatuses = new Set(["paid", "succeeded", "payment_succeeded", "failed", "expired", "canceled", "cancelled", "refunded"]);

export function RentalPaymentReturn() {
  const { language } = useLanguage();
  const ja = language === "ja";
  const params = new URLSearchParams(useSearch());
  const routeParams = useParams<{ id?: string }>();
  const id = Number(routeParams.id || params.get("requestId") || params.get("id"));
  const accessCode = params.get("accessCode") || "";
  const request = useQuery({
    queryKey: ["rental-payment-state", id, accessCode],
    queryFn: () => getRentalPaymentState(id, accessCode),
    enabled: Number.isInteger(id) && id > 0 && !!accessCode,
    refetchInterval: (query) => {
      const value = query.state.data as any;
      const payment = value?.payment || value?.paymentState || value;
      const paymentStatus = String(payment?.paymentStatus || payment?.status || "").toLowerCase();
      const reservationStatus = String(payment?.reservationStatus || "").toLowerCase();
      const isConfirmed = payment?.verified === true && confirmedReservationStatuses.has(reservationStatus);
      const isTerminal = payment?.terminal === true || isConfirmed
        || terminalPaymentStatuses.has(paymentStatus)
        || ["expired", "cancelled", "refunded", "payment_failed"].includes(reservationStatus);
      return isTerminal ? false : 8_000;
    },
  });
  const response = request.data as any;
  const data = response?.payment || response?.paymentState || response;
  const paymentStatus = String(data?.paymentStatus || data?.status || "");
  const reservationStatus = String(data?.reservationStatus || "");
  const paymentConfirmed = data?.verified === true && confirmedReservationStatuses.has(reservationStatus.toLowerCase());
  const terminal = data?.terminal === true || paymentConfirmed
    || terminalPaymentStatuses.has(paymentStatus.toLowerCase())
    || ["expired", "cancelled", "refunded", "payment_failed"].includes(reservationStatus.toLowerCase());
  const statusHref = localizedPath(`/rentalcar/requests/${id}?accessCode=${encodeURIComponent(accessCode)}`, language);

  return <div className="marketplace-flow min-h-[100dvh] py-12 md:py-20">
    <div className="container max-w-2xl">
      <p className="marketplace-kicker">CIAO SAPPORO / {ja ? "決済状況" : "PAYMENT STATUS"}</p>
      <section className="marketplace-panel mt-5 p-6 sm:p-9">
        <h1 className="text-3xl">{paymentConfirmed
          ? ja ? "予約が確定しました" : "Reservation confirmed"
          : terminal
            ? ja ? "決済状況を確認しました" : "Payment status received"
            : ja ? "決済状況を確認しています" : "Checking your payment status"}</h1>
        {!accessCode || !Number.isInteger(id) || id <= 0
          ? <p role="alert" className="mt-4 text-sm text-[#a84736]">{ja ? "リクエストIDとアクセスコードが必要です。" : "A request ID and access code are required to check payment status."}</p>
          : request.isLoading
            ? <p role="status" className="mt-4 text-sm text-slate-600">{ja ? "最新状況を取得しています…" : "Loading the latest request status…"}</p>
            : request.isError
              ? <div role="alert" className="mt-4 space-y-3 text-sm"><p>{ja ? "決済状況を確認できませんでした。" : "We could not verify your payment status."}</p><p className="text-[#a84736]">{request.error.message}</p><Button variant="outline" onClick={() => void request.refetch()}>{ja ? "再試行" : "Try again"}</Button></div>
              : <>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {paymentConfirmed
                    ? ja ? "サーバーが決済を検証し、予約が確定済みであることを確認しました。" : "The server verified the payment and confirmed the reservation."
                    : ja ? "Stripeから戻りました。リダイレクトだけでは決済完了になりません。下記の最新リクエスト状況を確認してください。" : "You returned from Stripe. A redirect alone does not confirm payment; check the latest request status below."}
                </p>
                <div className="mt-5 rounded border bg-[#faf8f1] p-4 text-sm">
                  <p><strong>{ja ? "リクエスト" : "Request"} #{id}</strong></p>
                  <p className="mt-1">{ja ? "決済状況：" : "Payment status: "}<span className="font-semibold">{paymentStatus ? paymentStatus.replaceAll("_", " ") : (ja ? "不明" : "Unavailable")}</span></p>
                  <p className="mt-1">{ja ? "予約状況：" : "Reservation status: "}<span className="font-semibold">{reservationStatus ? reservationStatus.replaceAll("_", " ") : (ja ? "不明" : "Unavailable")}</span></p>
                  {!paymentConfirmed && !terminal && <p className="mt-2 text-slate-600">{ja ? "決済反映には少し時間がかかる場合があります。このページは自動で再確認します。" : "Payment processing may take a short time. This page will check again automatically."}</p>}
                  {!paymentConfirmed && terminal && <p className="mt-2 text-slate-600">{ja ? "決済は確定していません。必要に応じてリクエスト状況を確認するか、サポートへお問い合わせください。" : "Payment has not been confirmed. Check the request details or contact support if needed."}</p>}
                </div>
                <Link href={statusHref} className="mt-6 inline-block"><Button>{ja ? "リクエスト詳細を見る" : "View request details"}</Button></Link>
              </>}
      </section>
    </div>
  </div>;
}