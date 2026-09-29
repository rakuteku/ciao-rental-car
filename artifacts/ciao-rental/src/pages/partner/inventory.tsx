import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useRentalMarketplaceConfig } from "@/hooks/use-rental-operations";
import { formatTokyo, tokyoInstant } from "@/lib/rental-marketplace";
import { PartnerShell, Section, Field, inputClass, textareaClass, PrimaryButton, SecondaryButton, StatusMessage, partnerRequest, usePartnerText, type PartnerIdentity, record, arrayFrom } from "./shared";

type Vehicle = Record<string, any> & { id?: string | number; internalName?: string; publicTitle?: string; brand?: string; model?: string };
type StaffMember = Record<string, any> & { id: string | number; email: string; role: string; active: boolean };
type PartnerAddon = Record<string, any> & { id: string | number; name: string };

function PartnerEarnings({ authenticated }: { authenticated: boolean }) {
  const t = usePartnerText();
  const query = useQuery({
    queryKey: ["partner", "rental", "earnings"],
    queryFn: () => partnerRequest("/api/partner/rental/earnings"),
    enabled: authenticated,
    staleTime: 0,
    refetchOnMount: "always",
  });
  if (!authenticated) return null;
  const payload = record(query.data);
  const summary = record(payload.summary ?? payload.earnings);
  const rows = arrayFrom(query.data, ["entries", "earnings", "payments", "payouts", "transactions", "items"]);
  const totals = [
    ["lifetimeEarnings", t("Lifetime earnings", "累計収益")],
    ["totalEarned", t("Total earned", "総収益")],
    ["paidOut", t("Paid out", "支払済み")],
    ["pendingPayout", t("Pending payout", "支払待ち")],
    ["availableForPayout", t("Available for payout", "支払可能額")],
  ].filter(([key]) => summary[key] != null);
  return <Section title={t("My rental earnings", "レンタカー収益")}>
    {query.isLoading ? <p className="text-sm text-slate-500">{t("Loading earnings…", "収益を読み込み中…")}</p>
      : query.isError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>{query.error.message}</p><SecondaryButton onClick={() => void query.refetch()}>{t("Retry", "再試行")}</SecondaryButton></div>
        : <>
          {totals.length > 0 && <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{totals.map(([key, label]) => <div key={key} className="rounded-md border bg-slate-50 p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-xl font-semibold">{summary.currency || payload.currency || "JPY"} {Number(summary[key]).toLocaleString()}</dd></div>)}</dl>}
          {rows.length > 0 ? <div className="divide-y rounded-md border">{rows.map((entry, index) => {
            const row = record(entry);
            return <div key={row.id ?? row.paymentId ?? row.payoutId ?? index} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
              <span>{row.type || row.kind || row.status || t("Earning", "収益")}{row.reference ? ` · ${row.reference}` : ""}{row.createdAt ? ` · ${new Date(row.createdAt).toLocaleDateString()}` : ""}</span>
              {row.amount != null && <strong>{row.currency || "JPY"} {Number(row.amount).toLocaleString()}</strong>}
            </div>;
          })}</div> : totals.length === 0 && <p className="text-sm text-slate-500">{t("No earnings data has been reported yet.", "収益データはまだありません。")}</p>}
        </>}
  </Section>;
}

const blankAddon = {
  name: "", nameJa: "", description: "", descriptionJa: "", image: "", pricingType: "flat",
  flatFee: "0", perDayFee: "0", maxQty: "1", inventoryLimit: "", vehicleCompatibility: [] as string[],
  required: false, published: false, sortOrder: "0",
};
const blankVehicle = {
  internalName: "", publicTitle: "", brand: "", model: "", year: "", vehicleClass: "", trim: "",
  transmission: "", fuelType: "", driveType: "", seats: "", plate: "", vin: "", color: "", description: "",
  equipment: "", extras: "", pickupLocations: "", returnLocations: "", operatingHours: "",
  afterHoursPickup: false, afterHoursReturn: false, basePrice: "", weekendPrice: "",
  weeklyDiscountPct: "", monthlyDiscountPct: "", minDays: "1", cleaningFee: "", deliveryFee: "", securityDeposit: "",
};
const cleanStrings = (text: string) => text.split(",").map((part) => part.trim()).filter(Boolean);
const requirementLabels: Record<string, [string, string]> = {
  legalName: ["Legal business name", "事業者の正式名称"], contact: ["Contact details", "連絡先"],
  permissions: ["Rental permissions", "レンタカー許可情報"], serviceAddress: ["Service address", "営業所住所"],
  serviceLocation: ["Service location", "営業エリア"], serviceHours: ["Service hours", "営業時間"],
  emergencyContact: ["Emergency contact", "緊急連絡先"], terms: ["Terms acceptance", "利用規約への同意"],
  validInsurance: ["Valid insurance", "有効な保険"], validPermissions: ["Valid permissions", "有効な許可証"],
  acceptedEvidence: ["Uploaded supporting documents", "必要書類のアップロード"],
};

type OperatorRequest = {
  id: number; status: string; vehicleId?: number; vehicleName?: string;
  vehicle?: { publicTitle?: string };
  offer?: { pickupAt?: string; returnAt?: string; pickupLocation?: string; returnLocation?: string; totalPrice?: number };
  pickupAt?: string; returnAt?: string; pickupLocation?: string; returnLocation?: string;
  driver?: { fullName?: string; email?: string }; travelNotes?: string;
  finalTotal?: number; quotedTotal?: number;
};

function PartnerRequestQueue({ role, vehicles }: { role: string; vehicles: Vehicle[] }) {
  const t = usePartnerText();
  const marketplace = useRentalMarketplaceConfig();
  const [requests, setRequests] = useState<OperatorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [offer, setOffer] = useState({ total: "", vehicleId: "", notes: "" });
  const [quote, setQuote] = useState({ vehicleId: "", pickupDate: "", pickupTime: "10:00", returnDate: "", returnTime: "10:00", pickupLocation: "", returnLocation: "", fullName: "", email: "", phone: "", total: "", reason: "", travelNotes: "", marketingConsent: false });
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteLink, setQuoteLink] = useState("");
  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await partnerRequest("/api/partner/rental/requests");
      setRequests(arrayFrom(response, ["requests", "items"]) as OperatorRequest[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load requests."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (marketplace.data?.enabled) void reload(); }, [reload, marketplace.data?.enabled]);
  const action = async (request: OperatorRequest, kind: "confirm" | "offer" | "decline") => {
    const reason = kind === "decline" ? window.prompt(t("Reason for declining this request", "お断りする理由"))?.trim() : undefined;
    if (kind === "decline" && !reason) return;
    setBusyId(request.id); setError(""); setNotice("");
    try {
      await partnerRequest(`/api/partner/rental/requests/${request.id}/${kind === "confirm" ? "accept" : kind}`, {
        method: "POST", body: JSON.stringify(kind === "offer" ? {
          totalPrice: Number(offer.total), reason: offer.notes.trim(), vehicleId: Number(offer.vehicleId),
        } : kind === "decline" ? { reason } : {}),
      });
      setSelected(null); setNotice(t("Request updated. The customer can review its status.", "リクエストを更新しました。お客様は状況を確認できます。"));
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : t("Could not update request.", "更新できませんでした。")); }
    finally { setBusyId(null); }
  };
  const createQuote = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setNotice(""); setQuoteBusy(true); setQuoteLink("");
    try {
      const start = tokyoInstant(quote.pickupDate, quote.pickupTime);
      const end = tokyoInstant(quote.returnDate, quote.returnTime);
      if (start <= new Date().toISOString() || end <= start) throw new Error(t("Choose a future pickup and a later return in Japan time.", "日本時間で現在より後の貸出日時と、その後の返却日時を指定してください。"));
      const created = await partnerRequest<{ id: number; customerAccessToken: string }>("/api/partner/rental/requests/quote", { method: "POST", body: JSON.stringify({
        vehicleId: Number(quote.vehicleId), pickupAt: start, returnAt: end,
        pickupLocation: quote.pickupLocation.trim(), returnLocation: quote.returnLocation.trim(),
        driver: { fullName: quote.fullName.trim(), email: quote.email.trim(), phone: quote.phone.trim() },
        travelNotes: quote.travelNotes.trim() || undefined, marketingConsent: quote.marketingConsent,
        totalPrice: quote.total ? Number(quote.total) : undefined, reason: quote.reason.trim(),
      }) });
      if (!created.id || !created.customerAccessToken) throw new Error(t("Quote created but access link was not supplied. Contact support.", "見積は作成されましたがアクセスリンクがありません。サポートにご連絡ください。"));
      setQuoteLink(`${window.location.origin}/rentalcar/requests/${created.id}?accessCode=${encodeURIComponent(created.customerAccessToken)}`);
      setNotice(t("Quote created. Share the private link with the customer through an agreed service channel only.", "見積を作成しました。お客様が同意された連絡手段でのみ、専用リンクを共有してください。"));
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : t("Could not create quote.", "見積を作成できませんでした。")); }
    finally { setQuoteBusy(false); }
  };
  const canAct = ["owner", "manager", "operations", "counter"].includes(role);
  if (!marketplace.data?.enabled) return null;
  return <Section title={t("Rental requests", "レンタルリクエスト")} aside={<SecondaryButton onClick={() => void reload()} disabled={loading}>{t("Refresh queue", "一覧を更新")}</SecondaryButton>}>
    <p className="text-sm text-slate-600">{t("Review new requests before confirming. Send a revised vehicle or price as an offer for explicit customer approval. No payment is captured here.", "確定前にリクエストを確認してください。車両または料金の変更は、お客様の明示的な承諾を必要とする変更提案として送信します。この画面では決済されません。")}</p>
    {canAct && <form onSubmit={createQuote} className="space-y-4 rounded-lg border border-slate-200 bg-[#faf9f4] p-4 sm:p-5">
      <div><h3 className="font-serif text-xl font-semibold">{t("Create staff quote", "スタッフ見積を作成")}</h3><p className="mt-1 text-xs text-slate-600">{t("For a customer inquiry handled by staff. This creates an offer for customer approval, not a paid booking. Times are Japan Standard Time.", "スタッフが対応したお問い合わせ向けです。お客様の承諾を待つ見積を作成し、決済や予約確定は行いません。日時は日本標準時です。")}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("Vehicle", "車両")}><select required className={inputClass()} value={quote.vehicleId} onChange={e => setQuote({ ...quote, vehicleId: e.target.value })}><option value="">{t("Select your vehicle", "自社の車両を選択")}</option>{vehicles.filter(v => v.id != null && v.status === "published").map(v => <option key={v.id} value={String(v.id)}>{v.publicTitle || `${v.brand} ${v.model}`} · #{v.id}</option>)}</select></Field>
        <Field label={t("Pickup date (JST)", "貸出日（日本時間）")}><input required type="date" className={inputClass()} value={quote.pickupDate} onChange={e => setQuote({ ...quote, pickupDate: e.target.value })} /></Field>
        <Field label={t("Pickup time (JST)", "貸出時刻（日本時間）")}><input required type="time" className={inputClass()} value={quote.pickupTime} onChange={e => setQuote({ ...quote, pickupTime: e.target.value })} /></Field>
        <Field label={t("Return date (JST)", "返却日（日本時間）")}><input required type="date" className={inputClass()} value={quote.returnDate} onChange={e => setQuote({ ...quote, returnDate: e.target.value })} /></Field>
        <Field label={t("Return time (JST)", "返却時刻（日本時間）")}><input required type="time" className={inputClass()} value={quote.returnTime} onChange={e => setQuote({ ...quote, returnTime: e.target.value })} /></Field>
        <Field label={t("Pickup location", "貸出場所")}><input required maxLength={300} className={inputClass()} value={quote.pickupLocation} onChange={e => setQuote({ ...quote, pickupLocation: e.target.value })} /></Field>
        <Field label={t("Return location", "返却場所")}><input required maxLength={300} className={inputClass()} value={quote.returnLocation} onChange={e => setQuote({ ...quote, returnLocation: e.target.value })} /></Field>
        <Field label={t("Customer legal name", "お客様の氏名")}><input required maxLength={200} className={inputClass()} value={quote.fullName} onChange={e => setQuote({ ...quote, fullName: e.target.value })} /></Field>
        <Field label={t("Customer email", "お客様のメール")}><input required type="email" className={inputClass()} value={quote.email} onChange={e => setQuote({ ...quote, email: e.target.value })} /></Field>
        <Field label={t("Customer phone", "お客様の電話番号")}><input required type="tel" className={inputClass()} value={quote.phone} onChange={e => setQuote({ ...quote, phone: e.target.value })} /></Field>
        <Field label={t("Revised total (JPY, optional)", "見積総額（円、任意）")}><input type="number" min="0" step="1" className={inputClass()} value={quote.total} onChange={e => setQuote({ ...quote, total: e.target.value })} /></Field>
        <Field label={t("Reason for quote", "見積の理由")}><input required maxLength={2000} className={inputClass()} value={quote.reason} onChange={e => setQuote({ ...quote, reason: e.target.value })} /></Field>
        <div className="sm:col-span-2 lg:col-span-3"><Field label={t("Travel notes (optional)", "旅程メモ（任意）")}><textarea maxLength={5000} className={textareaClass()} value={quote.travelNotes} onChange={e => setQuote({ ...quote, travelNotes: e.target.value })} /></Field></div>
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={quote.marketingConsent} onChange={e => setQuote({ ...quote, marketingConsent: e.target.checked })} /><span>{t("Customer explicitly opted in to marketing (leave unchecked unless recorded). This does not control essential request communication.", "お客様から販促案内の明示的な同意を得ています（記録がなければ未選択）。見積に必要な連絡とは別です。")}</span></label>
      <PrimaryButton disabled={quoteBusy || !vehicles.length}>{quoteBusy ? t("Creating…", "作成中…") : t("Create quote for approval", "承諾待ち見積を作成")}</PrimaryButton>
      {quoteLink && <div className="rounded-lg border bg-white p-4 text-sm"><p className="font-semibold">{t("Private customer link", "お客様専用リンク")}</p><p className="mt-2 break-all text-slate-600">{quoteLink}</p><SecondaryButton onClick={() => { void navigator.clipboard.writeText(quoteLink).then(() => setNotice(t("Link copied. Share privately with this customer only.", "リンクをコピーしました。対象のお客様にのみ安全に共有してください。"))).catch(() => setError(t("Could not copy. Select and copy the link above.", "コピーできませんでした。上のリンクを選択してコピーしてください。"))); }}>{t("Copy private link", "専用リンクをコピー")}</SecondaryButton></div>}
    </form>}
    {error && <StatusMessage error>{error} <button type="button" className="underline" onClick={() => void reload()}>{t("Retry", "再試行")}</button></StatusMessage>}
    {notice && <StatusMessage>{notice}</StatusMessage>}
    {loading ? <div className="space-y-2"><div className="h-16 animate-pulse rounded bg-slate-100" /><div className="h-16 animate-pulse rounded bg-slate-100" /></div> :
      requests.length === 0 ? <div className="rounded-lg border border-dashed p-7 text-center text-sm text-slate-500">{t("No rental requests in the queue.", "現在リクエストはありません。")}</div> :
      <div className="divide-y rounded-lg border">{requests.map(request => <article key={request.id} className="p-4" data-testid={`request-${request.id}`}>
        <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold">#{request.id} · {request.vehicle?.publicTitle || request.vehicleName || t("Vehicle", "車両")} {request.vehicleId ?? ""}</p><p className="mt-1 text-xs text-slate-500">{request.driver?.fullName} · {request.driver?.email}</p></div><span className="h-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{request.status}</span></div>
        <p className="mt-3 text-sm text-slate-600">{request.offer?.pickupAt || request.pickupAt ? formatTokyo(request.offer?.pickupAt || request.pickupAt!, "en") : "—"} · {request.offer?.pickupLocation || request.pickupLocation || "—"} → {request.offer?.returnAt || request.returnAt ? formatTokyo(request.offer?.returnAt || request.returnAt!, "en") : "—"} · {request.offer?.returnLocation || request.returnLocation || "—"}</p>
        {(request.offer?.totalPrice ?? request.finalTotal ?? request.quotedTotal) != null && <p className="mt-2 text-sm font-semibold">¥{Number(request.offer?.totalPrice ?? request.finalTotal ?? request.quotedTotal).toLocaleString()}</p>}
        {request.travelNotes && <p className="mt-2 whitespace-pre-wrap border-l-2 border-amber-500 pl-3 text-sm">{request.travelNotes}</p>}
        {canAct && request.status === "requested" && <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton type="button" disabled={busyId === request.id} onClick={() => void action(request, "confirm")}>{t("Confirm as requested", "内容どおり確定")}</PrimaryButton>
          <SecondaryButton disabled={busyId === request.id} onClick={() => { setSelected(selected === request.id ? null : request.id); setOffer({ total: String(request.offer?.totalPrice ?? request.finalTotal ?? request.quotedTotal ?? ""), vehicleId: String(request.vehicleId), notes: "" }); }}>{t("Create revised quote", "変更見積を作成")}</SecondaryButton>
          <SecondaryButton disabled={busyId === request.id} onClick={() => void action(request, "decline")}>{t("Decline", "お断りする")}</SecondaryButton>
        </div>}
        {selected === request.id && <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><p className="font-semibold">{t("Revised quote for customer approval", "お客様の承諾を必要とする変更見積")}</p><p className="mt-1 text-xs text-slate-600">{t("Choose a vehicle from your own fleet. Availability and pickup coverage are checked when you send the offer.", "自社の車両から選択してください。提案送信時に空車状況と貸出対応エリアが確認されます。")}</p></div>
          <Field label={t("Proposed vehicle", "提案車両")}><select className={inputClass()} value={offer.vehicleId} onChange={e => setOffer({ ...offer, vehicleId: e.target.value })}>
            {vehicles.filter(vehicle => vehicle.id != null && vehicle.status === "published").map(vehicle => <option key={vehicle.id} value={String(vehicle.id)}>{vehicle.publicTitle || `${vehicle.brand || ""} ${vehicle.model || ""}`} · #{vehicle.id}{String(vehicle.id) === String(request.vehicleId) ? ` (${t("original", "元の車両")})` : ""}</option>)}
          </select></Field>
          <Field label={t("Revised total (JPY)", "変更後の総額（円）")}><input required type="number" min="0" className={inputClass()} value={offer.total} onChange={e => setOffer({ ...offer, total: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label={t("Reason for the revised quote", "見積変更の理由")}><textarea required className={textareaClass()} value={offer.notes} onChange={e => setOffer({ ...offer, notes: e.target.value })} /></Field></div>
          <div className="flex gap-2 sm:col-span-2"><PrimaryButton type="button" disabled={busyId === request.id || offer.total === "" || !offer.vehicleId || !offer.notes.trim()} onClick={() => void action(request, "offer")}>{t("Send revised quote", "変更見積を送信")}</PrimaryButton><SecondaryButton onClick={() => setSelected(null)}>{t("Cancel", "キャンセル")}</SecondaryButton></div>
        </div>}
      </article>)}</div>}
  </Section>;
}

export function PartnerInventoryPage() {
  const t = usePartnerText();
  const [identity, setIdentity] = useState<PartnerIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [form, setForm] = useState(blankVehicle);
  const [editing, setEditing] = useState(false);
  const [auth, setAuth] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [blockForm, setBlockForm] = useState({ startAt: "", endAt: "", reason: "manual", notes: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({ type: "", startsAt: "", endsAt: "", status: "scheduled", note: "" });
  const [imageForm, setImageForm] = useState({ url: "", caption: "", isCover: false });
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffForm, setStaffForm] = useState({ email: "", password: "", displayName: "", role: "manager" });
  const [staffBusy, setStaffBusy] = useState(false);
  const [addons, setAddons] = useState<PartnerAddon[]>([]);
  const [addonLoading, setAddonLoading] = useState(false);
  const [addonForm, setAddonForm] = useState(blankAddon);
  const [selectedAddonId, setSelectedAddonId] = useState<string | number | null>(null);
  const [addonEditing, setAddonEditing] = useState(false);
  const [addonBusy, setAddonBusy] = useState(false);

  const reloadVehicles = useCallback(async (chooseId?: string | number) => {
    const data = await partnerRequest("/api/partner/vehicles");
    const list = arrayFrom(data, ["items", "vehicles"]).map((vehicle) => vehicle as Vehicle);
    setVehicles((current) => list.map((vehicle) => {
      const old = current.find((entry) => String(entry.id) === String(vehicle.id));
      return {
        ...vehicle,
        images: Array.isArray(vehicle.images) ? vehicle.images : old?.images ?? [],
        pricing: vehicle.pricing ?? old?.pricing,
        basePrice: vehicle.basePrice ?? old?.basePrice,
      };
    }));
    const selected = list.find((vehicle) => String(vehicle.id) === String(chooseId)) ?? list[0];
    setSelectedId(selected?.id ?? null);
    setEditing(!selected);
    if (!selected) setForm(blankVehicle);
    return selected;
  }, []);

  const loadRelated = useCallback(async (id: string | number) => {
    try {
      const [blockData, maintenanceData] = await Promise.all([
        partnerRequest(`/api/partner/vehicles/${id}/blocks`),
        partnerRequest(`/api/partner/vehicles/${id}/maintenance`),
      ]);
      setBlocks(arrayFrom(blockData));
      setMaintenance(arrayFrom(maintenanceData));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load availability records.");
    }
  }, []);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const data = await partnerRequest("/api/partner/staff");
      setStaff(arrayFrom(data).map((member) => member as StaffMember));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load staff accounts.");
    } finally { setStaffLoading(false); }
  }, []);

  const loadAddons = useCallback(async () => {
    setAddonLoading(true);
    try {
      const data = await partnerRequest("/api/partner/addons");
      setAddons(arrayFrom(data).map((addon) => addon as PartnerAddon));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load partner extras.");
    } finally { setAddonLoading(false); }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const me = await partnerRequest<PartnerIdentity>("/api/partner/me");
      setIdentity(me);
    } catch (e) {
      if (!(e instanceof Error) || !/401|403|unauthor/i.test(e.message)) setError(e instanceof Error ? e.message : "Could not load partner inventory.");
      setIdentity(null);
      setLoading(false);
      return;
    }
    try {
      const selected = await reloadVehicles();
      await Promise.all([
        selected?.id != null ? loadRelated(selected.id) : Promise.resolve(),
        loadAddons(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load partner vehicles.");
    } finally { setLoading(false); }
  }, [loadAddons, loadRelated, reloadVehicles]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (record(identity?.staff).role === "owner") void loadStaff();
  }, [identity, loadStaff]);

  useEffect(() => {
    const vehicle = vehicles.find((item) => String(item.id) === String(selectedId));
    if (!vehicle) return;
    setForm({
      ...blankVehicle,
      ...Object.fromEntries(Object.entries(blankVehicle).map(([key]) => {
        const value = key === "equipment" ? record(vehicle.disclosures).equipment
          : key === "extras" ? record(vehicle.disclosures).extras
            : key === "operatingHours" ? record(vehicle.hours).pickup
              : key === "pickupLocations" ? vehicle.pickupLocations
                : key === "returnLocations" ? vehicle.returnLocations
                  : vehicle[key];
        const fromList = Array.isArray(value) ? value.join(", ") : value;
        return [key, typeof fromList === "boolean" ? fromList : fromList == null ? "" : String(fromList)];
      })),
      basePrice: String(vehicle.basePrice ?? vehicle.pricing?.basePrice ?? ""),
      weekendPrice: String(vehicle.pricing?.weekendPrice ?? ""),
      weeklyDiscountPct: String(vehicle.pricing?.weeklyDiscountPct ?? ""),
      monthlyDiscountPct: String(vehicle.pricing?.monthlyDiscountPct ?? ""),
      minDays: String(vehicle.pricing?.minDays ?? 1),
      cleaningFee: String(vehicle.pricing?.cleaningFee ?? ""),
      deliveryFee: String(vehicle.pricing?.deliveryFee ?? ""),
      securityDeposit: String(vehicle.pricing?.securityDeposit ?? ""),
    } as typeof blankVehicle);
    setEditing(false);
    if (vehicle.id != null) void loadRelated(vehicle.id);
  }, [selectedId, vehicles, loadRelated]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await partnerRequest("/api/partner/login", { method: "POST", body: JSON.stringify(auth) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed."); }
    finally { setBusy(false); }
  };

  const set = <K extends keyof typeof blankVehicle,>(key: K, value: typeof blankVehicle[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const saveVehicle = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const payload = {
      internalName: form.internalName, publicTitle: form.publicTitle, brand: form.brand, model: form.model,
      year: Number(form.year), vehicleClass: form.vehicleClass || undefined, description: form.description,
      trim: form.trim || null, color: form.color || null, plate: form.plate || null, vin: form.vin || null,
      seats: form.seats ? Number(form.seats) : undefined, transmission: form.transmission || undefined,
      fuelType: form.fuelType || undefined, driveType: form.driveType || undefined,
      disclosures: { equipment: cleanStrings(form.equipment), extras: cleanStrings(form.extras) },
      hours: { pickup: form.operatingHours },
      pickupLocations: cleanStrings(form.pickupLocations), returnLocations: cleanStrings(form.returnLocations),
      afterHoursPickup: form.afterHoursPickup, afterHoursReturn: form.afterHoursReturn,
    };
    try {
      const result = await partnerRequest<any>(selectedId != null
        ? `/api/partner/vehicles/${selectedId}` : "/api/partner/vehicles", {
        method: selectedId != null ? "PUT" : "POST", body: JSON.stringify(payload),
      });
      const createdId = result?.id ?? result?.vehicle?.id;
      const selected = await reloadVehicles(createdId ?? selectedId ?? undefined);
      setNotice(t("Vehicle details saved.", "車両情報を保存しました。"));
      if (selected?.id != null) await loadRelated(selected.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save vehicle."); }
    finally { setBusy(false); }
  };

  const savePricing = async (event: FormEvent) => {
    event.preventDefault(); if (selectedId == null) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await partnerRequest(`/api/partner/vehicles/${selectedId}/pricing`, { method: "PUT", body: JSON.stringify({
        basePrice: Number(form.basePrice), weekendPrice: form.weekendPrice ? Number(form.weekendPrice) : undefined,
        weeklyDiscountPct: form.weeklyDiscountPct ? Number(form.weeklyDiscountPct) : undefined,
        monthlyDiscountPct: form.monthlyDiscountPct ? Number(form.monthlyDiscountPct) : undefined,
        minDays: Number(form.minDays) || 1, cleaningFee: Number(form.cleaningFee) || 0,
        deliveryFee: Number(form.deliveryFee) || 0, securityDeposit: Number(form.securityDeposit) || 0,
      }) });
      setVehicles((current) => current.map((vehicle) => String(vehicle.id) === String(selectedId)
        ? { ...vehicle, basePrice: Number(form.basePrice), pricing: { ...record(vehicle.pricing), basePrice: Number(form.basePrice) } }
        : vehicle));
      setNotice(t("Rates and deposit updated.", "料金とデポジットを更新しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update pricing."); }
    finally { setBusy(false); }
  };

  const uploadImage = async (event: FormEvent) => {
    event.preventDefault(); if (selectedId == null || !imageForm.url.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await partnerRequest<any>(`/api/partner/vehicles/${selectedId}/images`, { method: "POST", body: JSON.stringify({
        url: imageForm.url.trim(), caption: imageForm.caption.trim() || undefined,
        isCover: imageForm.isCover, sortOrder: images.length,
      }) });
      setVehicles((current) => current.map((vehicle) => String(vehicle.id) === String(selectedId)
        ? { ...vehicle, images: [...arrayFrom(vehicle.images), result] }
        : vehicle));
      setImageForm({ url: "", caption: "", isCover: false });
      setNotice(t("Photo URL saved.", "写真URLを保存しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload photo."); }
    finally { setBusy(false); }
  };

  const removeImage = async (imageId: string | number) => {
    if (selectedId == null) return;
    setBusy(true); setError("");
    try {
      await partnerRequest(`/api/partner/vehicles/${selectedId}/images`, { method: "DELETE", body: JSON.stringify({ imageId }) });
      setVehicles((current) => current.map((vehicle) => String(vehicle.id) === String(selectedId)
        ? { ...vehicle, images: arrayFrom(vehicle.images).filter((image) => String(image.id) !== String(imageId)) }
        : vehicle));
    }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove photo."); }
    finally { setBusy(false); }
  };

  const addBlock = async (event: FormEvent) => {
    event.preventDefault(); if (selectedId == null) return;
    setBusy(true); setError("");
    try {
      await partnerRequest(`/api/partner/vehicles/${selectedId}/blocks`, { method: "POST", body: JSON.stringify({
        startAt: new Date(blockForm.startAt).toISOString(), endAt: new Date(blockForm.endAt).toISOString(),
        reason: blockForm.reason, notes: blockForm.notes || undefined,
      }) });
      setBlockForm({ startAt: "", endAt: "", reason: "manual", notes: "" }); await loadRelated(selectedId); setNotice(t("Blackout dates added.", "予約不可期間を追加しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add blackout dates."); }
    finally { setBusy(false); }
  };

  const deleteBlock = async (blockId: string | number) => {
    if (selectedId == null) return;
    setBusy(true); setError("");
    try { await partnerRequest(`/api/partner/vehicles/${selectedId}/blocks`, { method: "DELETE", body: JSON.stringify({ blockId }) }); await loadRelated(selectedId); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not remove blackout."); }
    finally { setBusy(false); }
  };

  const addMaintenance = async (event: FormEvent) => {
    event.preventDefault(); if (selectedId == null) return;
    setBusy(true); setError("");
    try {
      await partnerRequest(`/api/partner/vehicles/${selectedId}/maintenance`, { method: "POST", body: JSON.stringify({
        type: maintenanceForm.type, startAt: maintenanceForm.startsAt || undefined, endAt: maintenanceForm.endsAt || undefined,
        status: maintenanceForm.status, notes: maintenanceForm.note || undefined,
      }) });
      setMaintenanceForm({ type: "", startsAt: "", endsAt: "", status: "scheduled", note: "" }); await loadRelated(selectedId); setNotice(t("Maintenance record added.", "整備記録を追加しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add maintenance record."); }
    finally { setBusy(false); }
  };

  const updateMaintenance = async (item: any, status: string) => {
    if (selectedId == null) return;
    setBusy(true); setError("");
    try {
      await partnerRequest(`/api/partner/vehicles/${selectedId}/maintenance`, { method: "PUT", body: JSON.stringify({ id: item.id, status }) });
      await loadRelated(selectedId);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update maintenance."); }
    finally { setBusy(false); }
  };

  const createStaff = async (event: FormEvent) => {
    event.preventDefault(); setStaffBusy(true); setError(""); setNotice("");
    try {
      await partnerRequest("/api/partner/staff", { method: "POST", body: JSON.stringify({
        email: staffForm.email, password: staffForm.password, displayName: staffForm.displayName || undefined, role: staffForm.role,
      }) });
      setStaffForm({ email: "", password: "", displayName: "", role: "manager" });
      await loadStaff(); setNotice(t("Staff account created.", "スタッフアカウントを作成しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create staff account."); }
    finally { setStaffBusy(false); }
  };

  const updateStaff = async (member: StaffMember, data: Record<string, unknown>) => {
    setStaffBusy(true); setError("");
    try {
      await partnerRequest(`/api/partner/staff/${member.id}`, { method: "PUT", body: JSON.stringify(data) });
      await loadStaff(); setNotice(t("Staff account updated.", "スタッフ情報を更新しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update staff account."); }
    finally { setStaffBusy(false); }
  };

  const revokeStaff = async (member: StaffMember) => {
    if (!window.confirm(t(`Revoke access for ${member.email}?`, `${member.email} のアクセス権を取り消しますか？`))) return;
    setStaffBusy(true); setError("");
    try {
      await partnerRequest(`/api/partner/staff/${member.id}`, { method: "DELETE" });
      await loadStaff(); setNotice(t("Staff access revoked.", "スタッフのアクセス権を取り消しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not revoke staff access."); }
    finally { setStaffBusy(false); }
  };

  const saveAddon = async (event: FormEvent) => {
    event.preventDefault(); setAddonBusy(true); setError(""); setNotice("");
    const payload = {
      name: addonForm.name.trim(),
      nameJa: addonForm.nameJa.trim() || null,
      description: addonForm.description,
      descriptionJa: addonForm.descriptionJa.trim() || null,
      image: addonForm.image.trim() || null,
      pricingType: addonForm.pricingType,
      flatFee: addonForm.pricingType === "flat" ? Number(addonForm.flatFee) : 0,
      perDayFee: addonForm.pricingType === "per_day" ? Number(addonForm.perDayFee) : 0,
      maxQty: Number(addonForm.maxQty) || 1,
      inventoryLimit: addonForm.inventoryLimit === "" ? null : Number(addonForm.inventoryLimit),
      vehicleCompatibility: addonForm.vehicleCompatibility,
      required: addonForm.required,
      published: addonForm.published,
      sortOrder: Number(addonForm.sortOrder) || 0,
    };
    try {
      await partnerRequest(selectedAddonId != null ? `/api/partner/addons/${selectedAddonId}` : "/api/partner/addons", {
        method: selectedAddonId != null ? "PUT" : "POST", body: JSON.stringify(payload),
      });
      await loadAddons();
      setAddonEditing(false); setSelectedAddonId(null); setAddonForm(blankAddon);
      setNotice(selectedAddonId != null ? t("Rental extra updated.", "レンタルオプションを更新しました。") : t("Rental extra created.", "レンタルオプションを作成しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save rental extra."); }
    finally { setAddonBusy(false); }
  };

  const unpublishAddon = async (addon: PartnerAddon) => {
    setAddonBusy(true); setError(""); setNotice("");
    try {
      await partnerRequest(`/api/partner/addons/${addon.id}`, { method: "PUT", body: JSON.stringify({ published: false }) });
      await loadAddons();
      setNotice(t("Rental extra unpublished.", "レンタルオプションを非公開にしました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not unpublish rental extra."); }
    finally { setAddonBusy(false); }
  };

  const editAddon = (addon: PartnerAddon) => {
    setSelectedAddonId(addon.id);
    setAddonForm({
      name: String(addon.name ?? ""), nameJa: String(addon.nameJa ?? ""),
      description: String(addon.description ?? ""), descriptionJa: String(addon.descriptionJa ?? ""),
      image: String(addon.image ?? ""), pricingType: addon.pricingType === "per_day" ? "per_day" : "flat",
      flatFee: String(addon.flatFee ?? 0), perDayFee: String(addon.perDayFee ?? 0),
      maxQty: String(addon.maxQty ?? 1), inventoryLimit: addon.inventoryLimit == null ? "" : String(addon.inventoryLimit),
      vehicleCompatibility: Array.isArray(addon.vehicleCompatibility) ? addon.vehicleCompatibility.map(String) : [],
      required: Boolean(addon.required), published: Boolean(addon.published), sortOrder: String(addon.sortOrder ?? 0),
    });
    setAddonEditing(true);
  };

  const logout = async () => {
    try { await partnerRequest("/api/partner/logout", { method: "POST", body: JSON.stringify({}) }); }
    finally { setIdentity(null); setVehicles([]); setSelectedId(null); }
  };

  const operator = record(identity?.operator);
  const selectedVehicle = vehicles.find((item) => String(item.id) === String(selectedId));
  const images = arrayFrom(selectedVehicle?.images, ["images", "items"]);
  const isApproved = /approved/i.test(String(operator.verificationStatus ?? operator.status ?? operator.applicationStatus ?? ""));
  const staffRole = String(record(identity?.staff).role ?? "");
  const canManageInventory = ["owner", "manager", "operations"].includes(staffRole);
  const isOwner = staffRole === "owner";
  const operatorRequirements = record(identity?.requirements);
  const operatorMissing = Array.isArray(operatorRequirements.missing) ? operatorRequirements.missing.map(String) : [];

  return <PartnerShell eyebrow={t("Inventory", "車両管理")} title={t("Partner inventory", "パートナー車両管理")} description={t("Manage vehicle details, private registration information, photos, prices, availability, and service records.", "車両情報、非公開の登録情報、写真、料金、空き状況、整備記録を管理します。")}>
    {loading && <StatusMessage>{t("Loading partner inventory…", "車両情報を読み込み中…")}</StatusMessage>}
    {error && <div className="mb-5"><StatusMessage error>{error}</StatusMessage></div>}
    {notice && <div className="mb-5"><StatusMessage>{notice}</StatusMessage></div>}
    {!loading && !identity && <div className="mx-auto max-w-lg"><Section title={t("Partner sign in", "パートナーログイン")}>
      <form onSubmit={handleLogin} className="space-y-4">
        <Field label={t("Email", "メールアドレス")}><input type="email" required className={inputClass()} autoComplete="email" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></Field>
        <Field label={t("Password", "パスワード")}><input type="password" required className={inputClass()} autoComplete="current-password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></Field>
        <PrimaryButton disabled={busy}>{busy ? t("Signing in…", "ログイン中…") : t("Sign in", "ログイン")}</PrimaryButton>
        <p className="text-sm text-slate-600">{t("Need an account?", "アカウントが必要ですか？")} <Link className="text-amber-800 underline" href="/partner/apply">{t("Apply to become a partner", "パートナー申請")}</Link></p>
      </form>
    </Section></div>}
    {!loading && identity && <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3">
        <div className="text-sm"><span className="font-semibold">{String(operator.name ?? record(identity.staff).email ?? t("Partner account", "パートナーアカウント"))}</span><span className={`ml-2 rounded-full px-2.5 py-1 text-xs font-semibold ${isApproved ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{String(operator.verificationStatus ?? operator.status ?? operator.applicationStatus ?? t("Application pending", "審査待ち"))}</span></div>
         <div className="flex flex-wrap gap-2"><Link href="/partner/reservations"><SecondaryButton>{t("Rental reservations", "レンタル予約")}</SecondaryButton></Link><Link href="/partner/apply"><SecondaryButton>{t("Application", "申請情報")}</SecondaryButton></Link><SecondaryButton onClick={() => void logout()}>{t("Sign out", "ログアウト")}</SecondaryButton></div>
      </div>
      <div className="mb-6"><PartnerEarnings authenticated /></div>
      {!isApproved && <div className="mb-5"><StatusMessage><strong>{t("Partner application status", "パートナー申請状況")}: {String(operator.verificationStatus ?? operator.status ?? t("Pending review", "審査待ち"))}</strong><p className="mt-1">{t("You can prepare inventory now; vehicles are not publicly listed until the operator is approved.", "車両情報は準備できますが、事業者が承認されるまで公開掲載されません。")}</p>{operatorMissing.length > 0 && <><p className="mt-2 font-medium">{t("Outstanding application requirements", "未対応の申請要件")}:</p><ul className="list-inside list-disc">{operatorMissing.map((item) => <li key={item}>{requirementLabels[item] ? t(...requirementLabels[item]) : item}</li>)}</ul></>}</StatusMessage></div>}
      {!canManageInventory && <div className="mb-5"><StatusMessage>{t(`Your ${staffRole || "staff"} role has read-only inventory access. Contact the account owner for changes.`, `${staffRole || "スタッフ"}権限は在庫の閲覧のみです。変更はオーナーに依頼してください。`)}</StatusMessage></div>}
      <div className="mb-6"><PartnerRequestQueue role={staffRole} vehicles={vehicles} /></div>
      <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="h-fit rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t("Vehicles", "車両")}</h2>{canManageInventory && <SecondaryButton onClick={() => { setSelectedId(null); setForm(blankVehicle); setEditing(true); }}>+ {t("Add", "追加")}</SecondaryButton>}</div>
          {vehicles.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{t("No vehicles yet. Add your first vehicle to get started.", "車両はまだありません。最初の車両を追加してください。")}</p> :
            <div className="space-y-2">{vehicles.map((vehicle, index) => <button key={vehicle.id ?? index} onClick={() => setSelectedId(vehicle.id ?? null)} className={`w-full rounded-lg border p-3 text-left text-sm ${String(selectedId) === String(vehicle.id) ? "border-amber-600 bg-amber-50" : "hover:bg-slate-50"}`}>
              <span className="block font-semibold">{(vehicle.publicTitle ?? [vehicle.year, vehicle.brand, vehicle.model].filter(Boolean).join(" ")) || t("Untitled vehicle", "名称未設定")}</span>
              <span className="mt-1 block text-xs text-slate-500">{vehicle.status ?? t("Draft", "下書き")}</span>
            </button>)}</div>}
        </aside>
        <div className="space-y-6">
          <Section title={t("Vehicle details", "車両情報")} aside={canManageInventory && selectedId != null && !editing ? <SecondaryButton onClick={() => setEditing(true)}>{t("Edit vehicle", "車両を編集")}</SecondaryButton> : undefined}>
            <form onSubmit={saveVehicle} className="space-y-4">
              {!canManageInventory && <p className="text-xs text-slate-500">{t("Your role can view vehicle records but cannot edit them.", "この権限では車両情報の閲覧のみ可能です。")}</p>}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label={t("Internal name", "管理用車両名")}><input required className={inputClass()} value={form.internalName} onChange={(e) => set("internalName", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Public listing title", "掲載タイトル")}><input required className={inputClass()} value={form.publicTitle} onChange={(e) => set("publicTitle", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Make", "メーカー")}><input required className={inputClass()} value={form.brand} onChange={(e) => set("brand", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Model", "車種")}><input required className={inputClass()} value={form.model} onChange={(e) => set("model", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Year", "年式")}><input type="number" min="1900" max="2100" required className={inputClass()} value={form.year} onChange={(e) => set("year", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Vehicle class", "車両クラス")}><select className={inputClass()} value={form.vehicleClass} onChange={(e) => set("vehicleClass", e.target.value)} disabled={!editing || !canManageInventory}><option value="">{t("Select class", "クラスを選択")}</option>{["economy", "compact", "midsize", "fullsize", "suv", "minivan", "van", "luxury", "sports", "truck"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label={t("Trim", "グレード")}><input className={inputClass()} value={form.trim} onChange={(e) => set("trim", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Transmission", "トランスミッション")}><select className={inputClass()} value={form.transmission} onChange={(e) => set("transmission", e.target.value)} disabled={!editing || !canManageInventory}><option value="">{t("Select", "選択")}</option><option value="automatic">Automatic</option><option value="manual">Manual</option><option value="cvt">CVT</option></select></Field>
                <Field label={t("Fuel type", "燃料種別")}><select className={inputClass()} value={form.fuelType} onChange={(e) => set("fuelType", e.target.value)} disabled={!editing || !canManageInventory}><option value="">{t("Select", "選択")}</option>{["gasoline", "diesel", "hybrid", "electric", "plugin_hybrid"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label={t("Drive type", "駆動方式")}><select className={inputClass()} value={form.driveType} onChange={(e) => set("driveType", e.target.value)} disabled={!editing || !canManageInventory}><option value="">{t("Select", "選択")}</option>{["fwd", "rwd", "awd", "4wd"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                <Field label={t("Seats", "乗車定員")}><input type="number" min="1" className={inputClass()} value={form.seats} onChange={(e) => set("seats", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Color", "色")}><input className={inputClass()} value={form.color} onChange={(e) => set("color", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("License plate — private", "ナンバープレート（非公開）")}><input className={inputClass()} value={form.plate} onChange={(e) => set("plate", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("VIN / chassis number — private", "VIN・車台番号（非公開）")}><input className={inputClass()} value={form.vin} onChange={(e) => set("vin", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Pickup locations (comma separated)", "貸出場所（カンマ区切り）")}><input className={inputClass()} value={form.pickupLocations} onChange={(e) => set("pickupLocations", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Return locations (comma separated)", "返却場所（カンマ区切り）")}><input className={inputClass()} value={form.returnLocations} onChange={(e) => set("returnLocations", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <div className="sm:col-span-2 lg:col-span-3"><Field label={t("Pickup hours", "受け渡し営業時間")}><input className={inputClass()} placeholder="09:00–18:00" value={form.operatingHours} onChange={(e) => set("operatingHours", e.target.value)} disabled={!editing || !canManageInventory} /></Field></div>
                <Field label={t("Equipment (comma separated)", "装備（カンマ区切り）")}><input className={inputClass()} placeholder="Navigation, child seat" value={form.equipment} onChange={(e) => set("equipment", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <Field label={t("Optional extras (comma separated)", "追加オプション（カンマ区切り）")}><input className={inputClass()} placeholder="Wi-Fi, snow tires" value={form.extras} onChange={(e) => set("extras", e.target.value)} disabled={!editing || !canManageInventory} /></Field>
                <div className="sm:col-span-2 lg:col-span-3"><Field label={t("Vehicle description", "車両説明")}><textarea className={textareaClass()} value={form.description} onChange={(e) => set("description", e.target.value)} disabled={!editing || !canManageInventory} /></Field></div>
              </div>
              <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.afterHoursPickup} disabled={!editing || !canManageInventory} onChange={(e) => set("afterHoursPickup", e.target.checked)} />{t("After-hours pickup", "営業時間外の貸出")}</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.afterHoursReturn} disabled={!editing || !canManageInventory} onChange={(e) => set("afterHoursReturn", e.target.checked)} />{t("After-hours return", "営業時間外の返却")}</label></div>
              {editing && canManageInventory && <div className="flex gap-2"><PrimaryButton disabled={busy}>{busy ? t("Saving…", "保存中…") : t("Save vehicle", "車両を保存")}</PrimaryButton>{selectedId != null && <SecondaryButton onClick={() => setEditing(false)}>{t("Cancel", "キャンセル")}</SecondaryButton>}</div>}
            </form>
          </Section>
          {selectedId != null && <>
            <Section title={t("Photos", "写真")}>
              {images.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image, index) => <div key={image.id ?? index} className="overflow-hidden rounded-lg border">
                {image.url ? <img src={image.url} alt={image.caption ?? `Vehicle photo ${index + 1}`} className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-slate-100 text-xs text-slate-500">{t("Photo", "写真")}</div>}
                <div className="flex items-center justify-between p-2 text-xs"><span>{image.isCover ? t("Cover photo", "メイン写真") : image.caption || t("Vehicle photo", "車両写真")}</span>{canManageInventory && <button className="text-red-700 underline" disabled={busy} onClick={() => void removeImage(image.id)}>{t("Remove", "削除")}</button>}</div>
              </div>)}</div> : <p className="text-sm text-slate-500">{t("No photos uploaded.", "写真はまだありません。")}</p>}
              {canManageInventory && <form onSubmit={uploadImage} className="flex flex-wrap items-end gap-3">
                <Field label={t("Image URL", "画像URL")}><input required type="url" className={inputClass()} value={imageForm.url} onChange={(e) => setImageForm({ ...imageForm, url: e.target.value })} placeholder="https://…" /></Field>
                <Field label={t("Caption", "キャプション")}><input className={inputClass()} value={imageForm.caption} onChange={(e) => setImageForm({ ...imageForm, caption: e.target.value })} /></Field>
                <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" checked={imageForm.isCover} onChange={(e) => setImageForm({ ...imageForm, isCover: e.target.checked })} />{t("Cover", "メイン")}</label>
                <PrimaryButton disabled={!imageForm.url || busy}>{t("Save photo", "写真を保存")}</PrimaryButton>
              </form>}
            </Section>
            <Section title={t("Rates and rental terms", "料金・貸出条件")}>
              <form onSubmit={savePricing} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label={t("Base rate / day (JPY)", "基本料金／日（円）")}><input type="number" min="0" required className={inputClass()} value={form.basePrice} onChange={(e) => set("basePrice", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Weekend rate (JPY)", "週末料金（円）")}><input type="number" min="0" className={inputClass()} value={form.weekendPrice} onChange={(e) => set("weekendPrice", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Weekly discount (%)", "週間割引（%）")}><input type="number" min="0" max="100" className={inputClass()} value={form.weeklyDiscountPct} onChange={(e) => set("weeklyDiscountPct", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Monthly discount (%)", "月間割引（%）")}><input type="number" min="0" max="100" className={inputClass()} value={form.monthlyDiscountPct} onChange={(e) => set("monthlyDiscountPct", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Minimum rental days", "最短貸出日数")}><input type="number" min="1" className={inputClass()} value={form.minDays} onChange={(e) => set("minDays", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Cleaning fee (JPY)", "清掃料（円）")}><input type="number" min="0" className={inputClass()} value={form.cleaningFee} onChange={(e) => set("cleaningFee", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Delivery fee (JPY)", "配送料（円）")}><input type="number" min="0" className={inputClass()} value={form.deliveryFee} onChange={(e) => set("deliveryFee", e.target.value)} disabled={!canManageInventory} /></Field>
                  <Field label={t("Security deposit (JPY)", "デポジット（円）")}><input type="number" min="0" className={inputClass()} value={form.securityDeposit} onChange={(e) => set("securityDeposit", e.target.value)} disabled={!canManageInventory} /></Field>
                </div>
                {canManageInventory && <PrimaryButton disabled={busy}>{t("Save pricing", "料金を保存")}</PrimaryButton>}
              </form>
            </Section>
            <div className="grid gap-6 xl:grid-cols-2">
              <Section title={t("Blackout dates", "予約不可日")}>
                {canManageInventory && <form onSubmit={addBlock} className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("Starts", "開始")}><input type="datetime-local" required className={inputClass()} value={blockForm.startAt} onChange={(e) => setBlockForm({ ...blockForm, startAt: e.target.value })} /></Field>
                  <Field label={t("Ends", "終了")}><input type="datetime-local" required className={inputClass()} value={blockForm.endAt} onChange={(e) => setBlockForm({ ...blockForm, endAt: e.target.value })} /></Field>
                  <Field label={t("Reason", "理由")}><select className={inputClass()} value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}>{["manual", "maintenance", "cleaning", "buffer", "holiday", "inspection", "other"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
                  <Field label={t("Notes", "メモ")}><input className={inputClass()} value={blockForm.notes} onChange={(e) => setBlockForm({ ...blockForm, notes: e.target.value })} /></Field>
                  <PrimaryButton disabled={busy}>{t("Add blackout", "予約不可期間を追加")}</PrimaryButton>
                </form>}
                <RecordList items={blocks} empty={t("No blackout dates.", "予約不可日はありません。")} label={t("Blackout", "予約不可")} action={t("Remove", "削除")} readOnly={!canManageInventory} onAction={(item) => void deleteBlock(item.id ?? item.blockId)} />
              </Section>
              <Section title={t("Maintenance", "整備記録")}>
                {canManageInventory && <form onSubmit={addMaintenance} className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("Maintenance type", "整備種別")}><input required className={inputClass()} value={maintenanceForm.type} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, type: e.target.value })} placeholder={t("Oil service, inspection…", "オイル交換、点検…")} /></Field>
                  <Field label={t("Starts", "開始")}><input type="datetime-local" className={inputClass()} value={maintenanceForm.startsAt} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, startsAt: e.target.value })} /></Field>
                  <Field label={t("Ends", "終了")}><input type="datetime-local" className={inputClass()} value={maintenanceForm.endsAt} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, endsAt: e.target.value })} /></Field>
                  <Field label={t("Status", "状況")}><select className={inputClass()} value={maintenanceForm.status} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, status: e.target.value })}><option value="scheduled">{t("Scheduled", "予定")}</option><option value="in_progress">{t("In progress", "作業中")}</option><option value="completed">{t("Completed", "完了")}</option><option value="cancelled">{t("Cancelled", "キャンセル")}</option></select></Field>
                  <Field label={t("Note", "メモ")}><input className={inputClass()} value={maintenanceForm.note} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, note: e.target.value })} /></Field>
                  <PrimaryButton disabled={busy}>{t("Add record", "記録を追加")}</PrimaryButton>
                </form>}
                <RecordList items={maintenance} empty={t("No maintenance records.", "整備記録はありません。")} label={t("Maintenance", "整備")} action={t("Mark complete", "完了にする")} readOnly={!canManageInventory} onAction={(item) => void updateMaintenance(item, "completed")} />
              </Section>
            </div>
          </>}
        </div>
      </div>
      <div className="mt-6">
        <Section title={t("Shared rental extras", "レンタル共通オプション")} aside={canManageInventory ? <SecondaryButton onClick={() => { setSelectedAddonId(null); setAddonForm(blankAddon); setAddonEditing(true); }}>+ {t("Add extra", "オプションを追加")}</SecondaryButton> : undefined}>
          <p className="mb-4 text-sm text-slate-600">{t("Create reusable extras such as child seats or GPS. Extras and their prices are stored in the shared rental add-ons catalog; vehicle disclosures remain informational only.", "チャイルドシートやGPSなど、再利用できるオプションを作成します。オプションと料金はレンタル共通オプションとして保存されます。車両の装備欄は説明用です。")}</p>
          {!canManageInventory && <div className="mb-4"><StatusMessage>{t("Your role can view extras but cannot create, edit, or unpublish them.", "この権限ではオプションを閲覧できますが、作成・編集・非公開化はできません。")}</StatusMessage></div>}
          {addonLoading ? <StatusMessage>{t("Loading shared extras…", "共通オプションを読み込み中…")}</StatusMessage> : addons.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">{t("No shared rental extras yet.", "共通オプションはまだありません。")}</p> :
            <div className="mb-5 space-y-3">{addons.map((addon) => {
              const compatibility = Array.isArray(addon.vehicleCompatibility) ? addon.vehicleCompatibility.map(String) : [];
              const compatibleVehicles = compatibility.map((vehicleId) => {
                const vehicle = vehicles.find((item) => String(item.id) === vehicleId);
                return vehicle ? String(vehicle.publicTitle ?? [vehicle.year, vehicle.brand, vehicle.model].filter(Boolean).join(" ")) : vehicleId;
              });
              const rate = addon.pricingType === "per_day" ? `${addon.perDayFee ?? 0} JPY / ${t("day", "日")}` : `${addon.flatFee ?? 0} JPY`;
              return <article key={addon.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t(String(addon.name), String(addon.nameJa || addon.name))}</h3><span className={`rounded-full px-2 py-1 text-xs font-medium ${addon.published ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{addon.published ? t("Published", "公開中") : t("Unpublished", "非公開")}</span>{addon.required && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-900">{t("Required", "必須")}</span>}</div>
                  {addon.description && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{t(String(addon.description), String(addon.descriptionJa || addon.description))}</p>}
                  <p className="mt-2 text-sm font-medium">{rate}{addon.pricingType === "per_day" ? ` · ${t("Max quantity", "最大数量")}: ${addon.maxQty ?? 1}` : ""}{addon.inventoryLimit != null ? ` · ${t("Inventory", "在庫")}: ${addon.inventoryLimit}` : ""}</p>
                  <p className="mt-1 text-xs text-slate-500">{t("Vehicle compatibility", "対応車両")}: {compatibleVehicles.length ? compatibleVehicles.join(", ") : t("No specific vehicle assignment", "特定車両の指定なし")}</p>
                </div>
                {canManageInventory && <div className="flex shrink-0 gap-2"><SecondaryButton disabled={addonBusy} onClick={() => editAddon(addon)}>{t("Edit", "編集")}</SecondaryButton>{addon.published && <SecondaryButton disabled={addonBusy} onClick={() => void unpublishAddon(addon)}>{t("Unpublish", "非公開にする")}</SecondaryButton>}</div>}
              </article>;
            })}</div>}
          {addonEditing && canManageInventory && <form onSubmit={saveAddon} className="space-y-4 rounded-lg border bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{selectedAddonId == null ? t("Create shared extra", "共通オプションを作成") : t("Edit shared extra", "共通オプションを編集")}</h3><SecondaryButton type="button" onClick={() => { setAddonEditing(false); setSelectedAddonId(null); setAddonForm(blankAddon); }}>{t("Cancel", "キャンセル")}</SecondaryButton></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Name (English)", "名称（英語）")}><input required maxLength={200} className={inputClass()} value={addonForm.name} onChange={(event) => setAddonForm({ ...addonForm, name: event.target.value })} /></Field>
              <Field label={t("Name (Japanese)", "名称（日本語）")}><input maxLength={200} className={inputClass()} value={addonForm.nameJa} onChange={(event) => setAddonForm({ ...addonForm, nameJa: event.target.value })} /></Field>
              <Field label={t("Description (English)", "説明（英語）")}><textarea maxLength={5000} className={textareaClass()} value={addonForm.description} onChange={(event) => setAddonForm({ ...addonForm, description: event.target.value })} /></Field>
              <Field label={t("Description (Japanese)", "説明（日本語）")}><textarea maxLength={5000} className={textareaClass()} value={addonForm.descriptionJa} onChange={(event) => setAddonForm({ ...addonForm, descriptionJa: event.target.value })} /></Field>
              <Field label={t("Image URL or app path (optional)", "画像URLまたはアプリ内パス（任意）")}><input type="text" maxLength={2000} className={inputClass()} value={addonForm.image} onChange={(event) => setAddonForm({ ...addonForm, image: event.target.value })} placeholder="https://… or /assets/…" /></Field>
              <Field label={t("Pricing type", "料金種別")}><select className={inputClass()} value={addonForm.pricingType} onChange={(event) => setAddonForm({ ...addonForm, pricingType: event.target.value })}><option value="flat">{t("Flat fee", "定額")}</option><option value="per_day">{t("Per day", "日額")}</option></select></Field>
              {addonForm.pricingType === "flat" ? <Field label={t("Flat rate (JPY)", "定額（円）")}><input type="number" min="0" max="1000000" step="0.01" required className={inputClass()} value={addonForm.flatFee} onChange={(event) => setAddonForm({ ...addonForm, flatFee: event.target.value })} /></Field> :
                <Field label={t("Rate per day (JPY)", "日額（円）")}><input type="number" min="0" max="1000000" step="0.01" required className={inputClass()} value={addonForm.perDayFee} onChange={(event) => setAddonForm({ ...addonForm, perDayFee: event.target.value })} /></Field>}
              <Field label={t("Maximum quantity", "最大数量")}><input type="number" min="1" max="1000" required className={inputClass()} value={addonForm.maxQty} onChange={(event) => setAddonForm({ ...addonForm, maxQty: event.target.value })} /></Field>
              <Field label={t("Inventory limit (blank = unlimited)", "在庫上限（空欄＝無制限）")}><input type="number" min="0" className={inputClass()} value={addonForm.inventoryLimit} onChange={(event) => setAddonForm({ ...addonForm, inventoryLimit: event.target.value })} /></Field>
              <Field label={t("Display order", "表示順")}><input type="number" className={inputClass()} value={addonForm.sortOrder} onChange={(event) => setAddonForm({ ...addonForm, sortOrder: event.target.value })} /></Field>
            </div>
            <fieldset className="rounded-lg border bg-white p-3">
              <legend className="px-1 text-sm font-medium">{t("Vehicle compatibility / assignment", "対応車両・割り当て")}</legend>
              <p className="mb-2 text-xs text-slate-500">{t("Select specific partner vehicles for this extra. Leave all unchecked for no specific assignment. Existing compatibility values are preserved unless changed.", "このオプションを割り当てる自社車両を選択します。特定車両に割り当てない場合は選択せず、既存の対応車両情報は変更しない限り保持されます。")}</p>
              {vehicles.length === 0 ? <p className="text-sm text-slate-500">{t("Add a vehicle first to assign this extra.", "割り当てるには先に車両を追加してください。")}</p> : <div className="grid gap-2 sm:grid-cols-2">{vehicles.filter((vehicle) => vehicle.id != null).map((vehicle) => {
                const vehicleId = String(vehicle.id);
                const title = String(vehicle.publicTitle ?? [vehicle.year, vehicle.brand, vehicle.model].filter(Boolean).join(" ") ?? vehicle.internalName ?? vehicleId);
                return <label key={vehicleId} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" checked={addonForm.vehicleCompatibility.includes(vehicleId)} onChange={(event) => setAddonForm((current) => ({ ...current, vehicleCompatibility: event.target.checked ? [...new Set([...current.vehicleCompatibility, vehicleId])] : current.vehicleCompatibility.filter((value) => value !== vehicleId) }))} />{title}</label>;
              })}</div>}
              {addonForm.vehicleCompatibility.some((id) => !vehicles.some((vehicle) => String(vehicle.id) === id)) && <p className="mt-2 text-xs text-amber-800">{t("Some existing compatibility values do not match a current vehicle and will be preserved.", "現在の車両と一致しない既存の対応情報も保持されます。")}</p>}
            </fieldset>
            <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={addonForm.required} onChange={(event) => setAddonForm({ ...addonForm, required: event.target.checked })} />{t("Required extra", "必須オプション")}</label><label className="flex items-center gap-2"><input type="checkbox" checked={addonForm.published} onChange={(event) => setAddonForm({ ...addonForm, published: event.target.checked })} />{t("Published / available to renters", "公開して利用可能にする")}</label></div>
            <PrimaryButton disabled={addonBusy}>{addonBusy ? t("Saving…", "保存中…") : selectedAddonId == null ? t("Create extra", "オプションを作成") : t("Save extra", "オプションを保存")}</PrimaryButton>
          </form>}
        </Section>
      </div>
      {isOwner && <div className="mt-6">
        <Section title={t("Partner staff", "パートナースタッフ")} aside={<span className="text-xs text-slate-500">{staff.length} {t("accounts", "アカウント")}</span>}>
          <p className="text-sm text-slate-600">{t("Only the owner can create, change, or revoke staff access. Managers and operations staff may edit inventory; counter staff have read-only access.", "スタッフの作成・変更・削除はオーナーのみ可能です。マネージャーと運営スタッフは在庫を編集でき、カウンタースタッフは閲覧のみです。")}</p>
          {staffLoading ? <StatusMessage>{t("Loading staff…", "スタッフを読み込み中…")}</StatusMessage> : staff.length === 0 ? <StatusMessage>{t("No staff accounts.", "スタッフアカウントはありません。")}</StatusMessage> :
            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">{t("Staff member", "スタッフ")}</th><th className="px-3 py-2">{t("Role", "権限")}</th><th className="px-3 py-2">{t("Access", "アクセス")}</th><th className="px-3 py-2">{t("Actions", "操作")}</th></tr></thead>
              <tbody className="divide-y">{staff.map((member) => {
                const self = String(member.id) === String(record(identity.staff).id);
                return <tr key={member.id}>
                  <td className="px-3 py-3"><p className="font-medium">{member.displayName || member.email}{self && <span className="ml-2 text-xs text-slate-500">({t("you", "本人")})</span>}</p><p className="text-xs text-slate-500">{member.email}</p></td>
                  <td className="px-3 py-3">{self || member.role === "owner" ? <span className="capitalize">{member.role}</span> : <select className="h-9 rounded border px-2" value={member.role} disabled={staffBusy || !member.active} onChange={(e) => void updateStaff(member, { role: e.target.value })}><option value="manager">Manager</option><option value="counter">Counter</option><option value="operations">Operations</option></select>}</td>
                  <td className="px-3 py-3">{member.role === "owner" ? t("Owner", "オーナー") : self ? t("Owner cannot change own access", "本人の権限は変更できません") : <label className="flex items-center gap-2"><input type="checkbox" checked={member.active} disabled={staffBusy} onChange={(e) => void updateStaff(member, { active: e.target.checked })} />{member.active ? t("Active", "有効") : t("Suspended", "停止")}</label>}</td>
                  <td className="px-3 py-3">{!self && member.role !== "owner" && <SecondaryButton disabled={staffBusy} onClick={() => void revokeStaff(member)}>{t("Revoke", "削除")}</SecondaryButton>}</td>
                </tr>;
              })}</tbody></table></div>}
          <form onSubmit={createStaff} className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("Email", "メールアドレス")}><input type="email" required className={inputClass()} value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} /></Field>
            <Field label={t("Temporary password", "初期パスワード")} hint={t("At least 12 characters.", "12文字以上") }><input type="password" required minLength={12} className={inputClass()} value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} /></Field>
            <Field label={t("Display name", "表示名")}><input className={inputClass()} value={staffForm.displayName} onChange={(e) => setStaffForm({ ...staffForm, displayName: e.target.value })} /></Field>
            <Field label={t("Role", "権限")}><select className={inputClass()} value={staffForm.role} onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}><option value="manager">Manager</option><option value="counter">Counter</option><option value="operations">Operations</option></select></Field>
            <PrimaryButton disabled={staffBusy}>{staffBusy ? t("Saving…", "保存中…") : t("Create staff account", "スタッフを追加")}</PrimaryButton>
          </form>
        </Section>
      </div>}
    </>}
  </PartnerShell>;
}

function RecordList({ items, empty, label, action, onAction, readOnly = false }: { items: any[]; empty: string; label: string; action: string; onAction: (item: any) => void; readOnly?: boolean }) {
  return items.length === 0 ? <p className="pt-3 text-sm text-slate-500">{empty}</p> : <ul className="divide-y rounded-lg border">
    {items.map((item, index) => <li key={item.id ?? index} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
      <div><p className="font-medium">{item.reason ?? item.notes ?? item.note ?? item.type ?? label}</p><p className="mt-1 text-xs text-slate-500">{[item.startAt ?? item.startsAt ?? item.startDate, item.endAt ?? item.endsAt ?? item.endDate, item.status].filter(Boolean).join(" · ")}</p></div>
      {!readOnly && <SecondaryButton onClick={() => onAction(item)}>{action}</SecondaryButton>}
    </li>)}
  </ul>;
}