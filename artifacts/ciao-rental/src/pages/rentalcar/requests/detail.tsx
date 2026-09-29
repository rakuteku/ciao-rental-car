import { useState } from "react";
import { useParams, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetRentalVehicles } from "@workspace/api-client-react";
import { ArrowRight, RefreshCw, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage, localizedPath } from "@/lib/language";
import { getRentalRequest, getRentalPaymentState, acceptRentalOffer, createRentalCheckout, formatTokyo } from "@/lib/rental-marketplace";
import { MarketplaceTerms } from "@/components/rental/MarketplaceTerms";

export function RentalRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const params = new URLSearchParams(useSearch());
  const code = params.get("accessCode") || "";
  const requestId = Number(id);
  const { language } = useLanguage();
  const ja = language === "ja";
  const [agreed, setAgreed] = useState(false);
  const client = useQueryClient();
  const { data: fleet } = useGetRentalVehicles();
  const query = useQuery({
    queryKey: ["rental-request", requestId, code],
    queryFn: () => getRentalRequest(requestId, code),
    enabled: Number.isInteger(requestId) && requestId > 0 && !!code,
    refetchInterval: 30_000,
  });
  const paymentQuery = useQuery({
    queryKey: ["rental-payment-state", requestId, code],
    queryFn: () => getRentalPaymentState(requestId, code),
    enabled: Number.isInteger(requestId) && requestId > 0 && !!code,
    refetchInterval: 15_000,
  });
  const accept = useMutation({
    mutationFn: () => acceptRentalOffer(requestId, code),
    onSuccess: (updated) => {
      client.setQueryData(["rental-request", requestId, code], (old: typeof updated | undefined) => ({ ...old, ...updated }));
      void query.refetch();
    },
  });
  const checkout = useMutation({
    mutationFn: () => createRentalCheckout(requestId, code),
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const data = query.data && "request" in query.data && query.data.request ? query.data.request as typeof query.data : query.data;
  const status = data?.status || "";
  const rawPaymentState = paymentQuery.data as any;
  const paymentState = rawPaymentState?.payment || rawPaymentState?.paymentState || rawPaymentState;
  const paymentStatus = paymentState?.paymentStatus || paymentState?.status;
  const normalizedPaymentStatus = String(paymentStatus || "").toLowerCase();
  const paymentTerminal = ["paid", "succeeded", "payment_succeeded", "confirmed", "failed", "expired", "canceled", "cancelled", "refunded"].includes(normalizedPaymentStatus)
    || ["payment_failed", "expired", "confirmed", "driver_documents_pending", "driver_documents_under_review", "driver_documents_rejected", "awaiting_pickup", "vehicle_dispatched", "in_rental", "overdue", "return_initiated", "return_completed", "inspection_pending", "damage_assessed", "deposit_refunded", "cancelled", "refunded"].includes(String(paymentState?.reservationStatus || "").toLowerCase());
  const paymentAvailable = status === "awaiting_payment" && !paymentTerminal && paymentState?.configured !== false && (
    paymentState?.checkoutAvailable === true ||
    (paymentState?.paymentAvailable === true && paymentState?.configured === true)
  );
  const paymentEmailStatus = data?.paymentEmailStatus || data?.paymentEmailDeliveryStatus || data?.paymentEmail?.status || data?.emailDeliveryStatus || paymentState?.emailDeliveryStatus || paymentState?.paymentEmailStatus;
  const emailPending = typeof paymentEmailStatus === "string" && (paymentEmailStatus.toLowerCase().includes("pending") || paymentEmailStatus.toLowerCase() === "queued");
  const changed = ["offer_pending", "offer_sent", "counter_offered", "change_proposed", "awaiting_customer_acceptance", "offer_pending_acceptance"].includes(status);
  const offeredVehicleId = data?.offer?.vehicleId ?? data?.offer?.vehicle?.id ?? data?.vehicleId;
  const originalVehicleId = data?.originalOffer?.vehicleId;
  const offeredVehicle = fleet?.find(vehicle => vehicle.id === offeredVehicleId);
  const originalVehicle = fleet?.find(vehicle => vehicle.id === originalVehicleId);
  const label = ({
    pending: ja ? "確認待ち" : "Awaiting operator review",
    requested: ja ? "依頼受付済み" : "Request received",
    awaiting_payment: ja ? "事業者が承諾しました" : "Accepted by operator",
    accepted: ja ? "受付確定" : "Confirmed",
    confirmed: ja ? "予約確定" : "Confirmed",
    declined: ja ? "受付不可" : "Unable to fulfil",
    cancelled: ja ? "キャンセル済み" : "Cancelled",
    expired: ja ? "期限切れ" : "Expired",
  } as Record<string, string>)[status] || (changed ? ja ? "変更提案を確認してください" : "A revised offer needs your approval" : status.replaceAll("_", " "));

  return <div className="marketplace-flow min-h-[100dvh] py-12 md:py-20"><div className="container max-w-3xl">
    <p className="marketplace-kicker">CIAO SAPPORO / {ja ? "リクエスト状況" : "REQUEST STATUS"}</p>
    <h1 className="mt-3 text-4xl md:text-5xl">{ja ? "旅の準備、進行中です。" : "Your trip is taking shape."}</h1>
    <p className="mt-4 text-sm text-slate-600">{ja ? "このページのURLを保存しておくと、後から最新の状況を確認できます。アクセスコードを他人に共有しないでください。" : "Save this page's URL to check your request after a reload. Keep its access code private."}</p>
    {!code || !Number.isInteger(requestId) || requestId <= 0 ? <div role="alert" className="marketplace-panel mt-8 p-7">{ja ? "有効なリクエストURLとアクセスコードが必要です。" : "A valid request URL and access code are required."}</div> :
    query.isLoading ? <div className="marketplace-panel mt-8 space-y-4 p-7"><div className="h-7 w-1/2 animate-pulse bg-[#e9e7de]" /><div className="h-4 w-full animate-pulse bg-[#e9e7de]" /><div className="h-4 w-3/4 animate-pulse bg-[#e9e7de]" /></div> :
    query.isError ? <div role="alert" className="marketplace-panel mt-8 p-7"><h2 className="text-xl">{ja ? "状況を取得できません" : "We couldn't load your request"}</h2><p className="mt-2 text-sm text-slate-600">{query.error.message}</p><Button onClick={() => query.refetch()} className="mt-5">{ja ? "再試行" : "Try again"}</Button></div> :
    <div className="mt-8 space-y-5">
      <section className="marketplace-panel p-6 sm:p-9" data-testid="status-rental-request">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="marketplace-kicker">{ja ? "リクエスト" : "REQUEST"} #{requestId}</p><h2 className="mt-2 text-2xl">{label}</h2></div><Button variant="outline" onClick={() => query.refetch()} className="gap-2"><RefreshCw size={15} />{ja ? "更新" : "Refresh"}</Button></div>
         <p className="mt-5 text-sm leading-6 text-slate-600">{changed ? ja ? "事業者から変更後の条件が提示されました。以下をご確認のうえ、承諾する場合のみボタンを押してください。" : "The operator proposed different terms. Review them below and accept only if they work for you." : status === "awaiting_payment" ? ja ? "事業者が依頼を承諾しました。お支払いはStripeの安全な決済ページで行います。" : "The operator accepted your request. Pay securely on Stripe to continue." : status === "declined" || status === "expired" ? ja ? "このリクエストでは予約できません。車両を再検索して新しいリクエストをお送りください。" : "This request can no longer be booked. Search again and submit a new request for an available vehicle." : ja ? "事業者からの回答をお待ちください。依頼時点では決済されず、車両はまだ確定していません。" : "Please wait for the operator's response. Your request has not been charged, and a vehicle is not yet confirmed."}</p>
         {status === "awaiting_payment" && <div className="mt-5 border-l-2 border-[#b5593d] bg-[#faf8f1] p-4 text-sm"><strong>{ja ? "決済状況" : "Payment availability"}: </strong>{paymentQuery.isLoading ? ja ? "確認中…" : "Checking…" : paymentAvailable ? ja ? "決済可能です" : "Payment is available" : ja ? "現在決済を開始できません" : "Payment is not currently available"}{paymentStatus && <p className="mt-2"><strong>{ja ? "決済ステータス" : "Payment status"}: </strong>{String(paymentStatus).replaceAll("_", " ")}</p>}{paymentQuery.isError && <p role="alert" className="mt-2 text-[#a84736]">{ja ? "決済状況を確認できません。" : "Payment availability could not be verified."}</p>}<p className="mt-2"><strong>{ja ? "決済期限" : "Payment deadline"}: </strong>{data?.paymentDeadline ? formatTokyo(data.paymentDeadline, language) : ja ? "まだ提示されていません" : "Not yet supplied"}</p>{paymentEmailStatus && <p className="mt-2"><strong>{ja ? "決済案内メール" : "Payment email delivery"}: </strong>{emailPending ? ja ? "送信待ち" : "Delivery pending" : paymentEmailStatus}</p>}<p className="mt-2 text-slate-600">{ja ? "期限後は空車状況を再確認してください。" : "After the deadline, availability must be checked again."}</p></div>}
         {status === "awaiting_payment" && <div className="mt-5">
           {checkout.isError && <p role="alert" className="mb-3 text-sm text-[#a84736]">{checkout.error.message}</p>}
            <Button disabled={!paymentAvailable || paymentQuery.isFetching || paymentQuery.isError || checkout.isPending} onClick={() => checkout.mutate()} className="gap-2">
             <CreditCard size={16} />{checkout.isPending ? ja ? "Stripeへ接続中…" : "Connecting to Stripe…" : ja ? "安全に決済する" : "Continue to secure payment"}
           </Button>
         </div>}
        {status === "declined" && <div className="mt-5 border-l-2 border-[#a84736] bg-[#fff4e9] p-4 text-sm"><strong>{ja ? "お断りの理由：" : "Reason for decline: "}</strong>{data?.declinedReason || (ja ? "理由は提示されていません。" : "No reason was supplied.")}</div>}
         {status !== "awaiting_payment" && paymentStatus && <div className="mt-5 border-l-2 border-[#b5593d] bg-[#faf8f1] p-4 text-sm"><strong>{ja ? "決済ステータス：" : "Payment status: "}</strong>{String(paymentStatus).replaceAll("_", " ")}{paymentState?.reservationStatus && <p className="mt-1"><strong>{ja ? "予約状況：" : "Reservation status: "}</strong>{String(paymentState.reservationStatus).replaceAll("_", " ")}</p>}</div>}
        {(status === "declined" || status === "expired") && <Link href={localizedPath("/rentalcar", language)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#ab593d] underline">{ja ? "別の車両を探す" : "Search for another vehicle"}<ArrowRight size={15} /></Link>}
      </section>
      <section className="marketplace-panel p-6 sm:p-9">
        <h2 className="text-2xl">{changed ? ja ? "変更後の条件" : "Revised offer" : ja ? "ご依頼の旅程" : "Your itinerary"}</h2>
        {offeredVehicleId && <div className="mt-5 border-l-2 border-[#b5593d] bg-[#faf8f1] p-4 text-sm">
          <span className="text-slate-500">{ja ? "提示車両" : "Offered vehicle"}</span>
          <p className="mt-1 font-semibold">{data?.offer?.vehicleTitle || data?.offer?.vehicle?.publicTitle || data?.offer?.vehicle?.title || offeredVehicle?.publicTitle || data?.vehicleTitle || data?.vehicle?.publicTitle || (ja ? "車両" : "Vehicle")} #{offeredVehicleId}</p>
          {changed && originalVehicleId && offeredVehicleId !== originalVehicleId && <p className="mt-2 text-[#a84736]">{ja ? `当初の車両：${originalVehicle?.publicTitle || "車両"} #${originalVehicleId}。変更後の車両をご確認ください。` : `Changed from ${originalVehicle?.publicTitle || "vehicle"} #${originalVehicleId}. Review the alternate car before accepting.`}</p>}
        </div>}
        <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          {(data?.offer?.pickupAt || data?.pickupAt) && <div><dt className="text-slate-500">{ja ? "貸出" : "Pickup"}</dt><dd className="mt-1 font-semibold">{formatTokyo(data.offer?.pickupAt || data.pickupAt!, language)}</dd></div>}
          {(data?.offer?.returnAt || data?.returnAt) && <div><dt className="text-slate-500">{ja ? "返却" : "Return"}</dt><dd className="mt-1 font-semibold">{formatTokyo(data.offer?.returnAt || data.returnAt!, language)}</dd></div>}
          {(data?.offer?.pickupLocation || data?.pickupLocation) && <div><dt className="text-slate-500">{ja ? "貸出場所" : "Pickup location"}</dt><dd className="mt-1 font-semibold">{data.offer?.pickupLocation || data.pickupLocation}</dd></div>}
          {(data?.offer?.returnLocation || data?.returnLocation) && <div><dt className="text-slate-500">{ja ? "返却場所" : "Return location"}</dt><dd className="mt-1 font-semibold">{data.offer?.returnLocation || data.returnLocation}</dd></div>}
          {(data?.offer?.totalPrice ?? data?.offer?.finalTotal ?? data?.offer?.total ?? data?.offerTotal ?? data?.finalTotal ?? data?.pricing?.finalTotal) != null && <div><dt className="text-slate-500">{ja ? "提示総額" : "Quoted total"}</dt><dd className="mt-1 text-2xl font-semibold">¥{Number(data?.offer?.totalPrice ?? data?.offer?.finalTotal ?? data?.offer?.total ?? data?.offerTotal ?? data?.finalTotal ?? data?.pricing?.finalTotal).toLocaleString()}</dd></div>}
        </dl>
        {changed && data?.originalOffer?.totalPrice != null && <p className="mt-5 rounded-sm bg-[#f2f0e9] px-4 py-3 text-sm">{ja ? "当初の見積：" : "Original quote: "}¥{Number(data.originalOffer.totalPrice).toLocaleString()} → {ja ? "変更後：" : "Revised: "}¥{Number(data.offer?.totalPrice ?? 0).toLocaleString()}</p>}
        <div className="mt-6 border-t pt-5 text-sm">
          <h3 className="text-lg">{ja ? "適用される貸渡条件" : "Rental terms supplied by the operator"}</h3>
          <p className="mt-2 text-slate-600">{ja ? "補償、免責額、NOC、キャンセル、対応エリアについて不明な点は承諾前に事業者へご確認ください。" : "Ask the operator to clarify coverage, deductible, NOC, cancellation and pickup coverage before accepting if any terms are unclear."}</p>
          <div className="mt-4"><MarketplaceTerms disclosures={data?.offer?.policy?.vehicle} policy={data?.offer?.policy?.marketplace} pickupLocations={data?.offer?.pickupLocation ? [data.offer.pickupLocation] : null} returnLocations={data?.offer?.returnLocation ? [data.offer.returnLocation] : null} language={language} /></div>
        </div>
        {(data?.offer?.partnerReason || data?.offer?.notes) && <p className="mt-5 whitespace-pre-wrap border-l-2 border-[#b5593d] pl-4 text-sm">{data.offer.partnerReason || data.offer.notes}</p>}
        {(data?.respondBy || data?.offer?.expiresAt) && <p className="mt-5 text-sm text-slate-600">{ja ? "回答期限：" : "Respond by: "}{formatTokyo(data.respondBy || data.offer!.expiresAt!, language)}</p>}
        {changed && <div className="mt-7 border-t pt-6">
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 accent-[#1d3041]" checked={agreed} onChange={e => setAgreed(e.target.checked)} data-testid="checkbox-accept-offer" />{ja ? "変更後の日時・場所・料金・貸渡条件を確認し、承諾します。" : "I have reviewed the changed dates, locations, price and rental terms, and accept this offer."}</label>
          {accept.isError && <p role="alert" className="mt-3 text-sm text-[#a84736]">{accept.error.message}</p>}
          <Button disabled={!agreed || accept.isPending} onClick={() => accept.mutate()} className="mt-5 gap-2">{accept.isPending ? ja ? "承諾中…" : "Accepting…" : ja ? "変更提案を承諾する" : "Accept revised offer"}<ArrowRight size={16} /></Button>
        </div>}
      </section>
      <p className="flex items-start gap-2 text-xs leading-5 text-slate-600"><ShieldCheck size={17} className="shrink-0" />{ja ? "決済はStripeの安全なページで行われます。必要書類の原本を貸出時にお持ちください。" : "Payment takes place on Stripe's secure checkout page. Bring original driving documents at pickup."}</p>
    </div>}
    <Link href={localizedPath("/rentalcar", language)} className="mt-9 inline-block text-sm font-semibold text-[#ab593d] underline">{ja ? "レンタカーのトップへ" : "Back to rental cars"}</Link>
  </div></div>;
}