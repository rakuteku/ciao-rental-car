import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, ArrowRight, Clock3, MapPin, ShieldCheck } from "lucide-react";
import { useCalculateRentalPrice, useGetRentalVehicle, getGetRentalVehicleQueryKey, useGetRentalAddons } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useCheckoutDraft } from "@/hooks/use-checkout-draft";
import { useLanguage, localizedPath } from "@/lib/language";
import { localizeVehicle, localizeAddon } from "@/lib/rental-localization";
import { captureRentalAttribution, createRentalRequest, formatTokyo } from "@/lib/rental-marketplace";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";

const schema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().email(),
  phone: z.string().trim().min(7),
  romanizedName: z.string().optional(),
  nationality: z.string().optional(),
  flightNumber: z.string().optional(),
  accommodation: z.string().optional(),
});
type Driver = z.infer<typeof schema>;

export function MarketplaceCheckout() {
  const { language } = useLanguage();
  const ja = language === "ja";
  const { data: configuredLocations } = useRentalLocations();
  const locations = configuredLocations ?? DEFAULT_RENTAL_LOCATIONS;
  const locationLabel = (value: string) => rentalLocationLabel(value, locations, language);
  const { draft, updateDraft, clearDraft } = useCheckoutDraft();
  const [, navigate] = useLocation();
  const [extra, setExtra] = useState({ fullName: "", email: "", phone: "" });
  const [showExtra, setShowExtra] = useState(false);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const { data: vehicle } = useGetRentalVehicle(draft?.vehicleSlug || "", { query: { enabled: !!draft?.vehicleSlug, queryKey: getGetRentalVehicleQueryKey(draft?.vehicleSlug || "") } });
  const { data: addons } = useGetRentalAddons();
  const quote = useCalculateRentalPrice();
  const calculate = useRef(quote.mutate);
  calculate.current = quote.mutate;
  const form = useForm<Driver>({ resolver: zodResolver(schema), defaultValues: {
    fullName: draft?.driver.fullName || "", email: draft?.driver.email || "", phone: draft?.driver.phone || "",
    romanizedName: draft?.driver.romanizedName || "", nationality: draft?.driver.nationality || "",
    flightNumber: draft?.driver.flightNumber || "", accommodation: draft?.driver.accommodation || "",
  } });

  useEffect(() => { captureRentalAttribution(); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const vehicleId = draft?.vehicleId, pickupAt = draft?.pickupAt, returnAt = draft?.returnAt;
  const pickupLocation = draft?.pickupLocation, returnLocation = draft?.returnLocation;
  const addonsKey = JSON.stringify(draft?.addons || []);
  useEffect(() => {
    if (vehicleId && pickupAt && returnAt) calculate.current({ data: { vehicleId, pickupAt, returnAt, pickupLocation, returnLocation, addons: JSON.parse(addonsKey) } });
  }, [vehicleId, pickupAt, returnAt, pickupLocation, returnLocation, addonsKey]);
  const expired = !draft?.heldUntil || new Date(draft.heldUntil).getTime() <= now;
  const remaining = draft?.heldUntil ? Math.max(0, Math.ceil((new Date(draft.heldUntil).getTime() - now) / 60000)) : 0;

  async function submit(driver: Driver) {
    if (!draft || !draft.holdId || expired || busy) return;
    if (showExtra && (!extra.fullName.trim() || !extra.email.trim() || !extra.phone.trim())) {
      setError(ja ? "追加運転者の氏名、メールアドレス、電話番号を入力してください。" : "Enter the additional driver's name, email and phone."); return;
    }
    if (!terms) { setError(ja ? "貸渡条件をご確認ください。" : "Please review and agree to the rental terms."); return; }
    setBusy(true); setError("");
    try {
      updateDraft({ driver });
      const result = await createRentalRequest({
        holdId: draft.holdId, vehicleId: draft.vehicleId, pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation, driver,
        additionalDrivers: showExtra ? [extra] : undefined,
        travelNotes: notes.trim() || undefined, marketingConsent: consent,
        attribution: captureRentalAttribution(), addons: draft.addons,
      }, ja ? "ja" : "en");
      const request = "request" in result && result.request ? result.request as typeof result : result;
      const code = result.customerAccessToken || result.accessCode || request.customerAccessToken || request.accessCode;
      if (!request.id || !code) throw new Error(ja ? "受付番号を確認できません。サポートにお問い合わせください。" : "The request was received, but its access code is missing. Please contact support.");
      clearDraft();
      navigate(`${localizedPath(`/rentalcar/requests/${request.id}`, language)}?accessCode=${encodeURIComponent(code)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit request."); }
    finally { setBusy(false); }
  }

  if (!draft) return <div className="marketplace-flow min-h-[70dvh] grid place-items-center px-5"><div className="marketplace-panel max-w-md p-8 text-center"><h1 className="text-3xl">{ja ? "お申し込み情報がありません" : "No active request"}</h1><p className="my-5 text-sm text-slate-600">{ja ? "車両を選択してからお進みください。" : "Choose a vehicle to begin."}</p><Link className="text-primary underline" href={localizedPath("/rentalcar/cars", language)}>{ja ? "車両を探す" : "Browse vehicles"}</Link></div></div>;

  return <div className="marketplace-flow min-h-[100dvh] py-10 md:py-16">
    <div className="container max-w-6xl">
      <Link href={localizedPath(`/rentalcar/cars/${draft.vehicleSlug}`, language)} className="mb-8 inline-flex items-center gap-2 text-sm text-[#ab593d] hover:underline"><ArrowLeft size={16} />{ja ? "車両に戻る" : "Back to vehicle"}</Link>
      <p className="marketplace-kicker">{ja ? "CIAO 札幌 · お申し込み" : "CIAO SAPPORO · RENTAL REQUEST"}</p>
      <h1 className="mt-3 max-w-3xl text-4xl leading-tight md:text-5xl">{ja ? "旅の予定をお聞かせください。" : "Tell us about your trip."}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{ja ? "これは予約リクエストです。送信時に決済は行われません。事業者が空き状況と条件を確認し、確定または変更提案をご案内します。" : "This is a request, not a paid reservation. No charge is made now. The operator will confirm availability and terms, or send a revised offer for your approval."}</p>
      <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {expired && <div role="alert" className="border border-[#bb755c] bg-[#fff4e9] p-5 text-sm">{ja ? "車両の仮押さえ期限が切れました。車両ページから再度お試しください。" : "Your vehicle hold has expired. Return to the vehicle to try again."}</div>}
          <section className="marketplace-panel p-5 sm:p-8">
            <p className="marketplace-kicker">01 / {ja ? "運転者" : "DRIVER"}</p>
            <h2 className="mt-2 mb-5 text-2xl">{ja ? "主な運転者" : "Primary driver"}</h2>
            <Form {...form}><form id="marketplace-request-form" onSubmit={form.handleSubmit(submit)} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ["fullName", ja ? "免許証記載の氏名" : "Name as shown on licence", "text"],
                  ["romanizedName", ja ? "ローマ字氏名（任意）" : "Romanized name (optional)", "text"],
                  ["email", ja ? "メールアドレス" : "Email address", "email"],
                  ["phone", ja ? "電話番号（国番号を含む）" : "Phone with country code", "tel"],
                  ["nationality", ja ? "国籍（任意）" : "Nationality (optional)", "text"],
                  ["flightNumber", ja ? "到着便（任意）" : "Arrival flight (optional)", "text"],
                  ["accommodation", ja ? "宿泊先（任意）" : "Accommodation (optional)", "text"],
                ] as const).map(([name, label, type]) => <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem><FormLabel>{label}</FormLabel><FormControl><Input data-testid={`input-${name}`} type={type} className="h-11 bg-[#fffdf8]" {...field} /></FormControl><FormMessage /></FormItem>} />)}
              </div>
              <div className="border-t pt-5">
                <label className="flex items-center gap-3 text-sm"><Checkbox checked={showExtra} onCheckedChange={v => setShowExtra(v === true)} data-testid="checkbox-additional-driver" />{ja ? "追加運転者がいます" : "I have an additional driver"}</label>
                {showExtra && <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Input aria-label={ja ? "追加運転者の氏名" : "Additional driver name"} placeholder={ja ? "氏名" : "Full legal name"} value={extra.fullName} onChange={e => setExtra({ ...extra, fullName: e.target.value })} />
                  <Input aria-label={ja ? "追加運転者のメール" : "Additional driver email"} type="email" placeholder={ja ? "メール" : "Email"} value={extra.email} onChange={e => setExtra({ ...extra, email: e.target.value })} />
                  <Input aria-label={ja ? "追加運転者の電話" : "Additional driver phone"} type="tel" placeholder={ja ? "電話番号" : "Phone"} value={extra.phone} onChange={e => setExtra({ ...extra, phone: e.target.value })} />
                </div>}
              </div>
            </form></Form>
          </section>
          <section className="marketplace-panel p-5 sm:p-8">
            <p className="marketplace-kicker">02 / {ja ? "旅程" : "YOUR TRIP"}</p>
            <h2 className="mt-2 mb-4 text-2xl">{ja ? "お迎えとご返却" : "Pickup & return"}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="border-l-2 border-[#b5593d] pl-4"><p className="text-xs uppercase tracking-wide text-slate-500">{ja ? "貸出" : "Pickup"}</p><p className="mt-2 font-medium">{formatTokyo(draft.pickupAt, language)}</p><p className="text-sm text-slate-600">{locationLabel(draft.pickupLocation)}</p></div>
              <div className="border-l-2 border-[#b5593d] pl-4"><p className="text-xs uppercase tracking-wide text-slate-500">{ja ? "返却" : "Return"}</p><p className="mt-2 font-medium">{formatTokyo(draft.returnAt, language)}</p><p className="text-sm text-slate-600">{locationLabel(draft.returnLocation)}</p></div>
            </div>
            <label htmlFor="travel-notes" className="mt-7 block text-sm font-semibold">{ja ? "旅程メモ（任意）" : "Travel notes (optional)"}</label>
            <textarea id="travel-notes" data-testid="input-travel-notes" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="mt-2 min-h-28 w-full rounded-sm border border-[#dcded8] bg-[#fffdf8] p-3 text-sm" placeholder={ja ? "便名、スキー用荷物、お迎えのご希望など" : "Flight details, ski equipment, pickup questions or accessibility needs"} />
            <p className="mt-4 flex gap-2 text-sm text-slate-600"><MapPin size={17} className="shrink-0" />{ja ? "お迎え場所と対応範囲は事業者が確認します。空港・ホテルへの配車や時間外対応は確約ではありません。" : "The operator will confirm the exact meeting point and service coverage. Airport, hotel and after-hours delivery are subject to confirmation."}</p>
          </section>
          <section className="marketplace-panel p-5 sm:p-8">
            <p className="marketplace-kicker">03 / {ja ? "確認" : "BEFORE YOU SEND"}</p>
            <h2 className="mt-2 mb-4 text-2xl">{ja ? "貸渡条件の確認" : "Know before you go"}</h2>
            <div className="space-y-3 text-sm leading-6 text-slate-600">
              <p><strong className="text-[#1d3041]">{ja ? "必要書類：" : "Original documents: "}</strong>{ja ? "貸出時に運転免許証、必要に応じて国際運転免許証・パスポートの原本をお持ちください。画像だけでは貸出できません。" : "Bring your original driving licence and, where applicable, original international driving permit and passport. Photos alone are not sufficient."}</p>
              <p><strong className="text-[#1d3041]">{ja ? "補償・免責・NOC：" : "Coverage, deductible & NOC: "}</strong>{ja ? "車両ごとの保険範囲、免責額、休業補償料（NOC）は確定前に必ずご確認ください。未提示の条件は事業者へお問い合わせください。" : "Review the operator's vehicle-specific coverage, deductible and non-operation charge before accepting. Ask the operator about any missing terms."}</p>
              <p><strong className="text-[#1d3041]">{ja ? "キャンセル：" : "Cancellation: "}</strong>{ja ? "キャンセルの期限と料金は事業者の提示条件に従います。変更提案を承諾するまで変更後の条件では確定しません。" : "Cancellation cutoff and charges follow the operator's stated policy. A changed offer is not accepted until you explicitly approve it."}</p>
            </div>
            <label className="mt-6 flex items-start gap-3 text-sm"><Checkbox checked={terms} onCheckedChange={v => setTerms(v === true)} data-testid="checkbox-terms" /><span>{ja ? "貸渡条件、補償・免責、NOC、キャンセル規定を確認し、問い合わせとして送信することに同意します。" : "I have reviewed the rental, coverage, deductible, NOC and cancellation information, and agree to submit this request."}</span></label>
            <label className="mt-5 flex items-start gap-3 text-sm"><Checkbox checked={consent} onCheckedChange={v => setConsent(v === true)} data-testid="checkbox-marketing" /><span>{ja ? "CIAOからの旅行情報やご案内メールを希望します（任意）。予約に必要な連絡とは別です。" : "I would like optional travel news and offers from CIAO. This is separate from messages needed to process my request."}</span></label>
            {error && <p role="alert" className="mt-5 border-l-2 border-[#a84736] bg-[#fff1e8] p-3 text-sm text-[#8f3529]">{error}</p>}
            <Button form="marketplace-request-form" type="submit" size="lg" disabled={busy || expired || quote.isPending || !quote.data} className="mt-7 w-full gap-2">{busy ? ja ? "送信中…" : "Sending request…" : ja ? "予約リクエストを送信" : "Send rental request"}<ArrowRight size={17} /></Button>
            <p className="mt-3 text-center text-xs text-slate-500">{ja ? "この画面では決済・請求は行われません。" : "No payment or charge is taken on this page."}</p>
          </section>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="marketplace-panel overflow-hidden">
            {vehicle?.images?.[0]?.url && <img src={vehicle.images[0].url} alt={vehicle.publicTitle || vehicle.model} className="h-48 w-full object-cover" />}
            <div className="p-6">
              <p className="marketplace-kicker">{ja ? "ご依頼内容" : "YOUR REQUEST"}</p>
              <h3 className="mt-2 text-2xl">{vehicle ? localizeVehicle(vehicle, language).title : ja ? "車両" : "Vehicle"}</h3>
              {(vehicle as typeof vehicle & { operatorName?: string } | undefined)?.operatorName && <p className="mt-1 text-xs text-slate-500">{ja ? "運営事業者：" : "Operated by "}{(vehicle as typeof vehicle & { operatorName?: string }).operatorName}</p>}
              <div className="mt-5 flex items-center gap-2 border-y py-4 text-sm"><Clock3 size={17} /><span>{ja ? `仮押さえ残り約${remaining}分` : `Hold expires in about ${remaining} min`}</span></div>
              <div className="mt-4 space-y-2 text-sm">{draft.addons.map(line => {
                const item = addons?.find(a => a.id === line.addonId);
                return <div key={line.addonId} className="flex justify-between"><span>{item ? localizeAddon(item, language).name : `Extra ${line.addonId}`} × {line.qty}</span><span>{quote.data?.addons?.find(a => a.addonId === line.addonId)?.totalPrice?.toLocaleString() ?? "—"} JPY</span></div>;
              })}</div>
              <div className="mt-5 flex items-end justify-between border-t pt-5"><span className="text-sm">{ja ? "見積合計" : "Estimated total"}</span><strong className="text-2xl">{quote.data ? `¥${quote.data.finalTotal.toLocaleString()}` : "—"}</strong></div>
              {quote.isError && <p role="alert" className="mt-3 text-sm text-[#a84736]">{ja ? "見積を取得できません。再読み込みしてください。" : "Could not retrieve pricing. Please reload."}</p>}
              <p className="mt-3 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={18} className="shrink-0" />{ja ? "料金と空き状況は事業者の確認後に確定します。" : "Price and availability are confirmed by the operator."}</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>;
}
