import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLanguage } from "@/lib/language";
import { Section, Field, inputClass, textareaClass, PrimaryButton, SecondaryButton, StatusMessage, partnerRequest, record, arrayFrom } from "@/pages/partner/shared";

type Partner = Record<string, any> & { id: string | number };

export function AdminRentalPartners() {
  const { language } = useLanguage();
  const t = (en: string, ja: string) => language === "ja" ? ja : en;
  const [items, setItems] = useState<Partner[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [reason, setReason] = useState("");
  const [vehicleReasons, setVehicleReasons] = useState<Record<string, string>>({});
  const [documentReasons, setDocumentReasons] = useState<Record<string, string>>({});
  const [payoutForms, setPayoutForms] = useState<Record<string, { status: string; expiresAt: string }>>({});
  const [busyKey, setBusyKey] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [partnerResponse, vehicleResponse, operatorAuditResponse, vehicleAuditResponse, documentAuditResponse] = await Promise.all([
        partnerRequest("/api/admin/rental/partners"),
        partnerRequest("/api/admin/rental/vehicles"),
        partnerRequest("/api/admin/rental/audit?recordType=rental_operator"),
        partnerRequest("/api/admin/rental/audit?recordType=rental_vehicle"),
        partnerRequest("/api/admin/rental/audit?recordType=rental_operator_document"),
      ]);
      const data = record(partnerResponse);
      const allVehicles = arrayFrom(vehicleResponse, ["items"]);
      const operatorAudits = arrayFrom(operatorAuditResponse);
      const vehicleAudits = arrayFrom(vehicleAuditResponse);
      const documentAudits = arrayFrom(documentAuditResponse);
      const next = arrayFrom(data, ["items"]).map((operator) => ({
        ...operator,
        requirements: {
          ...record(operator.requirements),
          documents: arrayFrom(record(operator.requirements).documents).map((document) => ({
            ...document,
            audit: documentAudits.filter((audit) => String(audit.recordId) === String(document.id)).map((audit) => ({
              ...audit, reason: record(audit.newValue).reason,
            })),
          })),
        },
        vehicles: allVehicles.filter((vehicle) => String(vehicle.operatorId) === String(operator.id)).map((vehicle) => ({
          ...vehicle,
          audit: vehicleAudits.filter((audit) => String(audit.recordId) === String(vehicle.id)).map((audit) => ({
            ...audit, reason: record(audit.newValue).reason,
          })),
        })),
        audit: [
          ...operatorAudits.filter((audit) => String(audit.recordId) === String(operator.id)),
          ...arrayFrom(operator.reviewHistory),
        ].map((audit) => ({
          ...audit, reason: record(audit.newValue).reason ?? audit.reviewNotes,
          action: audit.action ?? record(audit.details).action ?? audit.verificationType,
          actorName: audit.adminUser ?? audit.reviewedBy,
        })),
      }));
      setItems(next);
      setAlerts(arrayFrom(data.alerts, ["alerts", "items"]));
      setSelectedId((current) => next.some((item) => String(item.id) === String(current)) ? current : next[0]?.id ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load rental partners."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => items.filter((item) => {
    const verification = String(item.verificationStatus ?? item.applicationStatus ?? record(item.operator).verificationStatus ?? "").toLowerCase();
    const status = String(item.status ?? record(item.operator).status ?? "").toLowerCase();
    if (filter === "all") return true;
    if (filter === "pending") return ["pending", "draft", "submitted", "under_review", "needs_information"].includes(verification) || status === "pending";
    if (filter === "approved") return verification === "approved" || status === "active";
    return verification === "rejected" || status === "rejected";
  }), [items, filter]);
  const selected = items.find((item) => String(item.id) === String(selectedId));

  const review = async (event: FormEvent | undefined, partner: Partner, action: string) => {
    event?.preventDefault();
    if (!reason.trim()) { setError(t("Add a reason before recording a review decision.", "審査結果を記録する前に理由を入力してください。")); return; }
    setBusyKey(`partner-${partner.id}`); setError(""); setNotice("");
    const payout = payoutForms[String(partner.id)] ?? {
      status: String(partner.payoutStatus ?? "pending"),
      expiresAt: partner.payoutExpiresAt ? String(partner.payoutExpiresAt).slice(0, 10) : "",
    };
    const currentExpiry = partner.payoutExpiresAt ? String(partner.payoutExpiresAt).slice(0, 10) : "";
    const payoutChanged = payout.status !== String(partner.payoutStatus ?? "pending") || payout.expiresAt !== currentExpiry;
    if (action === "approve" && (payout.status !== "verified" || (payout.expiresAt && new Date(`${payout.expiresAt}T23:59:59`) <= new Date()))) {
      setError(t("Set payout status to verified and use a future expiry date, if one is specified, before approving.", "承認前に支払先を確認済みにしてください。有効期限を設定する場合は将来の日付を選んでください。"));
      setBusyKey("");
      return;
    }
    if (action === "approve" && payoutChanged) {
      setError(t("Save payout changes first, then approve after the updated status is loaded.", "先に支払先情報を保存し、状況が更新されてから承認してください。"));
      setBusyKey("");
      return;
    }
    try {
      await partnerRequest(`/api/admin/rental/partners/${partner.id}/review`, {
        method: "POST", body: JSON.stringify({ action, reason: reason.trim() }),
      });
      setReason(""); setNotice(t("Review decision, payout status, and audit record saved.", "審査結果・支払先状況・監査記録を保存しました。")); await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save review.");
    }
    finally { setBusyKey(""); }
  };

  const savePayout = async (partner: Partner) => {
    const why = reason.trim();
    if (!why) { setError(t("Add a reason before saving payout verification.", "支払先確認を保存する前に理由を入力してください。")); return; }
    const payout = payoutForms[String(partner.id)] ?? {
      status: String(partner.payoutStatus ?? "pending"),
      expiresAt: partner.payoutExpiresAt ? String(partner.payoutExpiresAt).slice(0, 10) : "",
    };
    if (payout.status === "verified" && payout.expiresAt && new Date(`${payout.expiresAt}T23:59:59`) <= new Date()) {
      setError(t("A verified payout expiry must be in the future.", "確認済み支払先の有効期限は将来の日付にしてください。")); return;
    }
    setBusyKey(`payout-${partner.id}`); setError(""); setNotice("");
    try {
      await partnerRequest(`/api/admin/rental/partners/${partner.id}/payout`, {
        method: "POST",
        body: JSON.stringify({
          payoutStatus: payout.status,
          payoutExpiresAt: payout.expiresAt ? new Date(payout.expiresAt).toISOString() : null,
          reason: why,
        }),
      });
      setNotice(t("Payout verification and audit record saved without changing partner review status.", "パートナー審査状況を変更せず、支払先確認と監査記録を保存しました。"));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save payout verification."); }
    finally { setBusyKey(""); }
  };

  const reviewDocument = async (partner: Partner, document: any, status: string) => {
    const key = `${partner.id}-${document.id}`;
    const why = (documentReasons[key] ?? "").trim();
    if (!why) { setError(t("Add a reason for this evidence decision.", "書類審査の理由を入力してください。")); return; }
    setBusyKey(`document-${key}`); setError(""); setNotice("");
    try {
      await partnerRequest(`/api/admin/rental/partners/${partner.id}/documents/${document.id}/review`, {
        method: "POST", body: JSON.stringify({ status, reason: why }),
      });
      setDocumentReasons((current) => ({ ...current, [key]: "" }));
      setNotice(t("Evidence status and audit record saved.", "書類状況と監査記録を保存しました。")); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not review evidence."); }
    finally { setBusyKey(""); }
  };

  const moderate = async (partner: Partner, vehicle: any, action: string) => {
    const key = `${partner.id}-${vehicle.id}`;
    const why = (vehicleReasons[key] ?? "").trim();
    if (!why) { setError(t("Add a moderation reason for this vehicle.", "この車両の審査理由を入力してください。")); return; }
    setBusyKey(key); setError(""); setNotice("");
    try {
      await partnerRequest(`/api/admin/rental/partners/${partner.id}/vehicles/${vehicle.id}/moderate`, { method: "POST", body: JSON.stringify({ action, reason: why }) });
      setVehicleReasons((prev) => ({ ...prev, [key]: "" })); setNotice(t("Vehicle moderation and audit record saved.", "車両審査と監査記録を保存しました。")); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not moderate vehicle."); }
    finally { setBusyKey(""); }
  };

  const operator = record(selected?.operator);
  const application = record(selected?.application ?? operator.application);
  const businessDetails = record(selected?.businessDetails ?? operator.businessDetails);
  const requirements = record(selected?.requirements ?? operator.requirements);
  const missingRequirements = Array.isArray(requirements.missing) ? requirements.missing : [];
  const reviewMissing = Array.isArray(requirements.reviewMissing) ? requirements.reviewMissing : [];
  const documents = arrayFrom(requirements.documents, ["documents", "items"]);
  const vehicles = arrayFrom(selected?.vehicles, ["vehicles", "items"]);
  const audit = arrayFrom(selected?.audit ?? selected?.reviews ?? selected?.reviewHistory, ["audit", "reviews", "items", "events"]);
  const field = (value: unknown) => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const alertsList = alerts.map((item) => typeof item === "string" ? item : `${item.name ?? ""}${item.verificationStatus ? ` · ${item.verificationStatus}` : ""}${Array.isArray(item.missing) && item.missing.length ? ` · ${item.missing.join(", ")}` : item.message ? ` · ${item.message}` : ""}${Array.isArray(item.expiringDocuments) && item.expiringDocuments.length ? ` · ${t("Expiring evidence", "期限間近の書類")}: ${item.expiringDocuments.join(", ")}` : ""}`);
  const payout = selected ? payoutForms[String(selected.id)] ?? {
    status: String(selected.payoutStatus ?? "pending"),
    expiresAt: selected.payoutExpiresAt ? String(selected.payoutExpiresAt).slice(0, 10) : "",
  } : { status: "pending", expiresAt: "" };

  return <div className="min-h-full bg-[#f7f7f4] p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
    <div className="mb-8">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-700">{t("RENTAL OPERATIONS · PARTNER REVIEW", "レンタカー運営 · パートナー審査")}</p>
      <h1 className="font-serif text-3xl font-bold">{t("Rental partner review", "レンタカーパートナー審査")}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{t("Review operator applications and partner-submitted vehicles. Decisions require a reason and are recorded for audit.", "事業者申請とパートナー登録車両を審査します。判断には理由が必要で、監査記録に保存されます。")}</p>
    </div>
    {error && <div className="mb-5"><StatusMessage error>{error}</StatusMessage></div>}
    {notice && <div className="mb-5"><StatusMessage>{notice}</StatusMessage></div>}
    {alertsList.length > 0 && <div className="mb-5"><Section title={t("Review alerts", "審査アラート")}><ul className="space-y-2">{alertsList.map((alert, index) => <li key={index} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{alert}</li>)}</ul></Section></div>}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {["all", "pending", "approved", "rejected"].map((status) => <button key={status} onClick={() => setFilter(status)} className={`rounded-full border px-4 py-2 text-sm font-medium capitalize ${filter === status ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700"}`}>{status === "all" ? t("All", "すべて") : ({ pending: t("Pending", "審査待ち"), approved: t("Approved", "承認"), rejected: t("Rejected", "却下") } as Record<string, string>)[status]}</button>)}
      </div>
      <SecondaryButton onClick={() => void load()} disabled={loading}>{t("Refresh", "更新")}</SecondaryButton>
    </div>
    {loading && <StatusMessage>{t("Loading partner applications…", "パートナー申請を読み込み中…")}</StatusMessage>}
    {!loading && items.length === 0 && <StatusMessage>{t("No rental partners have applied yet.", "パートナー申請はまだありません。")}</StatusMessage>}
    {!loading && items.length > 0 && visible.length === 0 && <StatusMessage>{t("No partners in this status.", "該当する状況のパートナーはいません。")}</StatusMessage>}
    {!loading && visible.length > 0 && <div className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border bg-white p-3 shadow-sm">
        <h2 className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t("Operators", "事業者")} · {visible.length}</h2>
        <div className="space-y-1">{visible.map((item) => {
          const op = record(item.operator);
          const name = item.businessName ?? item.legalName ?? op.businessName ?? item.name ?? op.name ?? t("Rental operator", "レンタカー事業者");
          const status = item.status ?? item.applicationStatus ?? op.status ?? t("Pending", "審査待ち");
          return <button key={item.id} onClick={() => { setSelectedId(item.id); setReason(""); }} className={`w-full rounded-lg border p-3 text-left ${String(selectedId) === String(item.id) ? "border-amber-600 bg-amber-50" : "border-transparent hover:bg-slate-50"}`}>
            <span className="block truncate font-semibold">{name}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{item.contactEmail ?? op.contactEmail ?? item.email ?? ""}</span>
            <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-1 text-xs">{String(item.verificationStatus ?? status)}</span>
          </button>;
        })}</div>
      </aside>
      {selected && <div className="space-y-6">
        <Section title={String(selected.businessName ?? selected.legalName ?? operator.businessName ?? selected.name ?? t("Partner application", "パートナー申請"))} aside={<span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{String(selected.verificationStatus ?? selected.status ?? selected.applicationStatus ?? operator.verificationStatus ?? t("Pending", "審査待ち"))}</span>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label={t("Representative", "担当者")} value={field(application.name ?? selected.name ?? operator.name)} />
            <Detail label={t("Legal business name", "正式名称")} value={field(application.legalName ?? selected.legalName)} />
            <Detail label={t("Contact email", "連絡先メール")} value={field(application.contactEmail ?? selected.contactEmail ?? selected.email)} />
            <Detail label={t("Phone", "電話番号")} value={field(application.contactPhone ?? selected.contactPhone)} />
            <Detail label={t("Address", "住所")} value={field(application.address ?? selected.address)} />
            <Detail label={t("Service address", "営業所住所")} value={field(businessDetails.serviceAddress)} />
            <Detail label={t("Service location", "営業エリア")} value={field(businessDetails.serviceLocation)} />
            <Detail label={t("Service hours", "営業時間")} value={field(businessDetails.serviceHours)} />
            <Detail label={t("Emergency contact", "緊急連絡先")} value={field(businessDetails.emergencyContact)} />
            <Detail label={t("Insurance expires", "保険有効期限")} value={field(application.insuranceExpiresAt ?? selected.insuranceExpiresAt)} />
            <Detail label={t("Permission expires", "許可有効期限")} value={field(application.permissionExpiresAt ?? selected.permissionExpiresAt)} />
            <div className="sm:col-span-2"><Detail label={t("Business details / permissions", "事業内容・許認可")} value={field(application.businessDetails ?? businessDetails.permissions)} /></div>
          </div>
          {missingRequirements.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">{t("Application details still missing", "申請情報の未入力項目")}</p><ul className="mt-1 list-inside list-disc">{missingRequirements.map((item: unknown, index: number) => <li key={index}>{String(item)}</li>)}</ul></div>}
          {reviewMissing.length > 0 && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900"><p className="font-semibold">{t("Approval blocked until these requirements are satisfied", "以下の要件が満たされるまで承認できません")}</p><ul className="mt-1 list-inside list-disc">{reviewMissing.map((item: unknown, index: number) => <li key={index}>{String(item)}</li>)}</ul></div>}
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold">{t("Evidence review", "提出書類の審査")}</h3>
            {documents.length === 0 ? <p className="text-sm text-slate-500">{t("No documents submitted.", "提出書類はありません。")}</p> : documents.map((doc: any) => {
              const key = `${selected.id}-${doc.id}`;
              const expired = doc.expiresAt && new Date(doc.expiresAt) <= new Date();
              return <article key={doc.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-medium">{doc.documentType}</p><p className="mt-1 text-xs text-slate-600">{t("Status", "状況")}: {doc.status}{doc.expiresAt ? ` · ${t("Expires", "有効期限")} ${String(doc.expiresAt).slice(0, 10)}` : ""}{expired ? ` · ${t("Expired", "期限切れ")}` : ""}</p></div>
                  {doc.status !== "expired" && <a className="text-sm font-medium text-amber-800 underline" href={`/api/admin/rental/partners/${selected.id}/documents/${doc.id}/content`} target="_blank" rel="noreferrer">{t("View private evidence", "非公開書類を表示")}</a>}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
                  <input className={inputClass()} required aria-label={t("Evidence review reason", "書類審査理由")} value={documentReasons[key] ?? ""} onChange={(event) => setDocumentReasons((current) => ({ ...current, [key]: event.target.value }))} placeholder={t("Reason required for status change", "状況変更の理由を入力")} />
                  <SecondaryButton disabled={Boolean(busyKey) || Boolean(expired)} onClick={() => void reviewDocument(selected, doc, "accepted")}>{t("Accept", "承認")}</SecondaryButton>
                  <SecondaryButton disabled={Boolean(busyKey)} onClick={() => void reviewDocument(selected, doc, "under_review")}>{t("Under review", "審査中")}</SecondaryButton>
                  <SecondaryButton disabled={Boolean(busyKey)} onClick={() => void reviewDocument(selected, doc, "rejected")}>{t("Reject", "却下")}</SecondaryButton>
                  <SecondaryButton disabled={Boolean(busyKey)} onClick={() => void reviewDocument(selected, doc, "expired")}>{t("Mark expired", "期限切れ")}</SecondaryButton>
                </div>
                <ReviewTimeline records={arrayFrom(doc.audit)} empty={t("No evidence review history.", "書類審査履歴はありません。")} t={t} />
              </article>;
            })}
          </div>
          <ReviewTimeline records={audit} empty={t("No review history recorded.", "審査履歴はありません。")} t={t} />
          <form onSubmit={(event) => void review(event, selected, "approve")} className="space-y-3 border-t pt-4">
            <div className="rounded-lg border bg-slate-50 p-4">
              <h3 className="font-semibold">{t("Payout verification", "支払先確認")}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t("Payout verification is saved independently and does not change the partner’s review status. Leave expiry blank only when no expiry applies.", "支払先確認は審査状況を変更せずに個別保存されます。有効期限がない場合のみ空欄にしてください。")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={t("Payout status", "支払先状況")}><select className={inputClass()} value={payout.status} disabled={Boolean(busyKey)} onChange={(event) => setPayoutForms((current) => ({ ...current, [String(selected.id)]: { ...payout, status: event.target.value } }))}><option value="pending">{t("Pending", "確認待ち")}</option><option value="verified">{t("Verified", "確認済み")}</option><option value="rejected">{t("Rejected", "却下")}</option><option value="expired">{t("Expired", "期限切れ")}</option></select></Field>
                <Field label={t("Payout verification expires", "支払先確認の有効期限")}><input type="date" className={inputClass()} value={payout.expiresAt} disabled={Boolean(busyKey)} onChange={(event) => setPayoutForms((current) => ({ ...current, [String(selected.id)]: { ...payout, expiresAt: event.target.value } }))} /></Field>
              </div>
              <div className="mt-3"><SecondaryButton disabled={Boolean(busyKey)} onClick={() => void savePayout(selected)}>{t("Save payout verification", "支払先確認を保存")}</SecondaryButton></div>
            </div>
            <Field label={t("Decision reason (required)", "審査理由（必須）")}><textarea className={textareaClass()} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Record evidence reviewed, conditions, or reason for rejection.", "確認した根拠、条件、却下理由などを記録します。")} /></Field>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton disabled={Boolean(busyKey) || reviewMissing.length > 0 || payout.status !== "verified" || (payout.expiresAt && new Date(`${payout.expiresAt}T23:59:59`) <= new Date()) || payout.status !== String(selected.payoutStatus ?? "pending") || payout.expiresAt !== (selected.payoutExpiresAt ? String(selected.payoutExpiresAt).slice(0, 10) : "")}>{t("Approve partner", "パートナーを承認")}</PrimaryButton>
              <SecondaryButton type="button" disabled={Boolean(busyKey)} onClick={() => void review(undefined, selected, "request_changes")}>{t("Request changes", "修正を依頼")}</SecondaryButton>
              <SecondaryButton type="button" disabled={Boolean(busyKey)} onClick={() => void review(undefined, selected, "reject")}>{t("Reject", "却下")}</SecondaryButton>
            </div>
          </form>
        </Section>
        <Section title={t("Partner vehicles", "登録車両")} aside={<span className="text-xs text-slate-500">{vehicles.length} {t("vehicles", "台")}</span>}>
          {vehicles.length === 0 ? <p className="text-sm text-slate-500">{t("No vehicles submitted.", "登録車両はありません。")}</p> : <div className="space-y-4">
            {vehicles.map((vehicle, index) => {
              const key = `${selected.id}-${vehicle.id}`;
              const images = arrayFrom(vehicle.images, ["images", "items"]);
              return <article key={vehicle.id ?? index} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="font-semibold">{(vehicle.publicTitle ?? [vehicle.year, vehicle.brand, vehicle.model].filter(Boolean).join(" ")) || t("Vehicle", "車両")}</h3><p className="mt-1 text-xs text-slate-500">{String(vehicle.moderationStatus ?? vehicle.status ?? t("Pending review", "審査待ち"))} · {vehicle.vehicleClass ?? ""}</p></div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{vehicle.basePrice != null ? `${vehicle.basePrice} JPY / ${t("day", "日")}` : t("Rate not set", "料金未設定")}</span>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <Detail label={t("Private plate", "非公開ナンバー")} value={field(vehicle.licensePlate)} />
                  <Detail label={t("Private VIN", "非公開VIN")} value={field(vehicle.vin)} />
                  <Detail label={t("Pickup location / hours", "場所・営業時間")} value={field([...(Array.isArray(vehicle.pickupLocations) ? vehicle.pickupLocations : []), record(vehicle.hours).pickup].filter(Boolean).join(" · "))} />
                  <Detail label={t("Equipment / extras", "装備・オプション")} value={field([...(Array.isArray(record(vehicle.disclosures).equipment) ? record(vehicle.disclosures).equipment : []), ...(Array.isArray(record(vehicle.disclosures).extras) ? record(vehicle.disclosures).extras : [])].join(", "))} />
                </div>
                {images.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{images.map((image: any, i: number) => image.url || image.imageUrl ? <img key={image.id ?? i} src={image.url ?? image.imageUrl} alt="" className="h-20 w-28 shrink-0 rounded object-cover" /> : null)}</div>}
                <form onSubmit={(event) => { event.preventDefault(); void moderate(selected, vehicle, "approve"); }} className="mt-4 grid gap-3 border-t pt-3 sm:grid-cols-[1fr_auto_auto]">
                  <input aria-label={t("Moderation reason", "審査理由")} className={inputClass()} value={vehicleReasons[key] ?? ""} onChange={(event) => setVehicleReasons((prev) => ({ ...prev, [key]: event.target.value }))} placeholder={t("Reason required for each decision", "判断理由を入力")} />
                  <PrimaryButton disabled={Boolean(busyKey)}>{t("Approve vehicle", "車両を承認")}</PrimaryButton>
                  <SecondaryButton type="button" disabled={Boolean(busyKey)} onClick={() => void moderate(selected, vehicle, "request_changes")}>{t("Request changes", "修正を依頼")}</SecondaryButton>
                  <SecondaryButton type="button" disabled={Boolean(busyKey)} onClick={() => void moderate(selected, vehicle, "reject")}>{t("Reject", "却下")}</SecondaryButton>
                </form>
                <ReviewTimeline records={arrayFrom(vehicle.audit ?? vehicle.moderationHistory, ["audit", "events", "items"])} empty={t("No vehicle moderation history.", "車両審査履歴はありません。")} t={t} />
              </article>;
            })}
          </div>}
        </Section>
      </div>}
    </div>}
  </div></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</p></div>;
}

function ReviewTimeline({ records, empty, t }: { records: any[]; empty: string; t: (en: string, ja: string) => string }) {
  return <div className="mt-5 border-t pt-4">
    <h3 className="mb-2 text-sm font-semibold">{t("Review & audit history", "審査・監査履歴")}</h3>
    {records.length === 0 ? <p className="text-xs text-slate-500">{empty}</p> : <ol className="space-y-2">{records.map((entry, index) => <li key={entry.id ?? index} className="flex flex-wrap justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
      <span><strong>{entry.action ?? entry.event ?? entry.status ?? t("Update", "更新")}</strong>{entry.reason ? ` · ${entry.reason}` : ""}</span>
      <span className="text-slate-500">{[entry.actorName ?? entry.reviewer ?? entry.adminUser, entry.createdAt ?? entry.timestamp].filter(Boolean).join(" · ")}</span>
    </li>)}</ol>}
  </div>;
}