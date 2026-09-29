import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { PartnerShell, Section, Field, inputClass, textareaClass, PrimaryButton, SecondaryButton, StatusMessage, partnerRequest, usePartnerText, type PartnerIdentity, record } from "./shared";

const emptyApplication = {
  legalName: "", contactEmail: "", contactPhone: "", address: "", permissions: "", serviceAddress: "",
  serviceLocation: "", serviceHours: "", emergencyContactName: "", emergencyContactPhone: "",
  insuranceExpiresAt: "", permissionExpiresAt: "", termsAccepted: false,
};
const documentTypes = ["insurance", "business_license", "vehicle_permission"] as const;

export function PartnerApplyPage() {
  const t = usePartnerText();
  const [identity, setIdentity] = useState<PartnerIdentity | null>(null);
  const [checking, setChecking] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [auth, setAuth] = useState({ name: "", email: "", password: "", businessName: "", legalName: "", contactPhone: "" });
  const [documentFiles, setDocumentFiles] = useState<Record<string, File | null>>({});
  const [application, setApplication] = useState(emptyApplication);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submitForReview = useRef(false);

  const loadIdentity = async () => {
    try {
      const data = await partnerRequest<PartnerIdentity>("/api/partner/me");
      setIdentity(data);
      const operator = record(data.operator);
      const details = record(operator.businessDetails);
      const emergencyContact = record(details.emergencyContact);
      const formatRecord = (value: unknown) => typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
      setApplication({
        legalName: String(operator.legalName ?? ""), contactEmail: String(operator.contactEmail ?? ""),
        contactPhone: String(operator.contactPhone ?? ""), address: String(operator.address ?? ""),
        permissions: formatRecord(details.permissions), serviceAddress: String(details.serviceAddress ?? ""),
        serviceLocation: formatRecord(details.serviceLocation), serviceHours: formatRecord(details.serviceHours),
        emergencyContactName: String(emergencyContact.name ?? ""), emergencyContactPhone: String(emergencyContact.phone ?? ""),
        insuranceExpiresAt: operator.insuranceExpiresAt ? String(operator.insuranceExpiresAt).slice(0, 10) : "",
        permissionExpiresAt: operator.permissionExpiresAt ? String(operator.permissionExpiresAt).slice(0, 10) : "",
        termsAccepted: Boolean(operator.termsAcceptedAt ?? details.termsAcceptedAt),
      });
    } catch (e) {
      if (!(e instanceof Error) || !/401|403|unauthor/i.test(e.message)) setError(e instanceof Error ? e.message : "Could not load partner account.");
    } finally { setChecking(false); }
  };

  useEffect(() => { void loadIdentity(); }, []);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (authMode === "register") {
        await partnerRequest("/api/partner/register", { method: "POST", body: JSON.stringify({
          businessName: auth.businessName, legalName: auth.legalName, email: auth.email, password: auth.password,
          contactPhone: auth.contactPhone, displayName: auth.name,
        }) });
      } else {
        await partnerRequest("/api/partner/login", { method: "POST", body: JSON.stringify({ email: auth.email, password: auth.password }) });
      }
      await loadIdentity();
      setNotice(t("You are signed in. Complete your operator application below.", "ログインしました。以下の事業者申請を入力してください。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Authentication failed."); }
    finally { setBusy(false); }
  };

  const saveApplication = async (event: FormEvent, submit = false) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const payload = {
        legalName: application.legalName, contactEmail: application.contactEmail, contactPhone: application.contactPhone,
        address: application.address, permissions: application.permissions, serviceAddress: application.serviceAddress,
        serviceLocation: application.serviceLocation ? { description: application.serviceLocation } : {},
        serviceHours: application.serviceHours ? { hours: application.serviceHours } : {},
        emergencyContact: { name: application.emergencyContactName, phone: application.emergencyContactPhone },
        insuranceExpiresAt: application.insuranceExpiresAt || undefined,
        permissionExpiresAt: application.permissionExpiresAt || undefined, termsAccepted: application.termsAccepted,
      };
      await partnerRequest("/api/partner/application", { method: "PUT", body: JSON.stringify(payload) });
      if (submit) await partnerRequest("/api/partner/application/submit", { method: "POST", body: JSON.stringify({}) });
      await loadIdentity();
      setNotice(submit
        ? t("Application submitted for review. We will update its status here.", "申請を審査に提出しました。審査状況はこのページで確認できます。")
        : t("Application saved.", "申請内容を保存しました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save application."); }
    finally { setBusy(false); }
  };

  const uploadDocument = async (documentType: typeof documentTypes[number]) => {
    const file = documentFiles[documentType];
    if (!file) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const request = await partnerRequest<{ uploadPath: string }>("/api/partner/application/documents/upload-request", {
        method: "POST",
        body: JSON.stringify({
          documentType, contentType: file.type, originalFileName: file.name,
          ...(documentType === "insurance" && application.insuranceExpiresAt ? { expiresAt: application.insuranceExpiresAt } : {}),
          ...(documentType === "vehicle_permission" && application.permissionExpiresAt ? { expiresAt: application.permissionExpiresAt } : {}),
        }),
      });
      await partnerRequest(request.uploadPath, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setDocumentFiles((current) => ({ ...current, [documentType]: null }));
      await loadIdentity();
      setNotice(t("Supporting document uploaded.", "必要書類をアップロードしました。"));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload document."); }
    finally { setBusy(false); }
  };

  const setApp = (key: keyof typeof emptyApplication, value: string) => setApplication((prev) => ({ ...prev, [key]: value }));
  const operator = record(identity?.operator);
  const appStatus = String(operator.verificationStatus ?? operator.applicationStatus ?? operator.status ?? "");
  const isOwner = record(identity?.staff).role === "owner";
  const requirements = record(identity?.requirements);
  const missingRequirements = Array.isArray(requirements.missing) ? requirements.missing.map(String) : [];
  const requirementLabels: Record<string, [string, string]> = {
    legalName: ["Legal business name", "事業者の正式名称"], contact: ["Contact details", "連絡先"], permissions: ["Rental permissions", "レンタカー許可情報"],
    serviceAddress: ["Service address", "営業所住所"], serviceLocation: ["Service location", "営業エリア"], serviceHours: ["Service hours", "営業時間"],
    emergencyContact: ["Emergency contact", "緊急連絡先"], terms: ["Terms acceptance", "利用規約への同意"], validInsurance: ["Valid insurance", "有効な保険"],
    validPermissions: ["Valid permissions", "有効な許可証"], acceptedEvidence: ["Uploaded supporting documents", "必要書類のアップロード"],
  };

  return <PartnerShell eyebrow={t("Partner application", "パートナー申請")} title={t("Join the rental partner network", "レンタカーパートナーに参加")} description={t("Create a partner account, submit your business details, and track the review before listing vehicles.", "パートナーアカウントを作成し、事業情報を提出してください。車両掲載前に審査状況を確認できます。")}>
    {checking ? <StatusMessage>{t("Loading partner account…", "パートナーアカウントを読み込み中…")}</StatusMessage> : null}
    {error && <div className="mb-5"><StatusMessage error>{error}</StatusMessage></div>}
    {notice && <div className="mb-5"><StatusMessage>{notice}</StatusMessage></div>}
    {!identity && !checking && <div className="mb-6 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
      <Section title={authMode === "register" ? t("Create account", "アカウント作成") : t("Partner sign in", "パートナーログイン")} aside={<button className="text-sm text-amber-800 underline" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setError(""); }}>{authMode === "register" ? t("Already registered? Sign in", "登録済みの方はこちら") : t("New partner? Register", "新規登録はこちら")}</button>}>
        <form onSubmit={submitAuth} className="space-y-4">
          {authMode === "register" && <>
            <Field label={t("Contact name", "担当者名")}><input required autoComplete="name" className={inputClass()} value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></Field>
            <Field label={t("Business name", "事業者名")}><input required className={inputClass()} value={auth.businessName} onChange={(e) => setAuth({ ...auth, businessName: e.target.value })} /></Field>
            <Field label={t("Legal business name", "事業者の正式名称")}><input required className={inputClass()} value={auth.legalName} onChange={(e) => setAuth({ ...auth, legalName: e.target.value })} /></Field>
            <Field label={t("Contact phone", "電話番号")}><input required type="tel" autoComplete="tel" className={inputClass()} value={auth.contactPhone} onChange={(e) => setAuth({ ...auth, contactPhone: e.target.value })} /></Field>
          </>}
          <Field label={t("Email", "メールアドレス")}><input required type="email" autoComplete="email" className={inputClass()} value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} /></Field>
          <Field label={t("Password", "パスワード")} hint={authMode === "register" ? t("At least 12 characters.", "12文字以上で入力してください。") : undefined}><input required type="password" minLength={authMode === "register" ? 12 : 1} autoComplete={authMode === "register" ? "new-password" : "current-password"} className={inputClass()} value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></Field>
          <PrimaryButton disabled={busy}>{busy ? t("Please wait…", "処理中…") : authMode === "register" ? t("Create partner account", "アカウントを作成") : t("Sign in", "ログイン")}</PrimaryButton>
        </form>
      </Section>
      <div className="rounded-xl bg-slate-900 p-6 text-white sm:p-8">
        <p className="text-xs uppercase tracking-[.2em] text-amber-300">CIAO RENTAL</p>
        <h2 className="mt-4 font-serif text-2xl font-semibold">{t("Built for trusted local operators.", "地域の信頼できる事業者のために。")}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{t("Submit your company and compliance details for review. Approved partners can manage private vehicle information, availability, pricing, and maintenance from one place.", "会社情報と必要書類を提出して審査を受けます。承認後は車両情報、空き状況、料金、整備を一元管理できます。")}</p>
        <div className="mt-7 border-t border-white/15 pt-5 text-sm text-slate-300">{t("Have an account?", "アカウントをお持ちですか？")} <Link className="text-amber-300 underline" href="/partner/inventory">{t("Open inventory", "在庫管理へ")}</Link></div>
      </div>
    </div>}

    {identity && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 text-sm">
      <div><span className="font-semibold">{t("Account", "アカウント")}</span> · {String(record(identity.staff).email ?? operator.email ?? "")} {appStatus && <span className="ml-2 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">{appStatus}</span>}</div>
      <div className="flex gap-2">
        <Link href="/partner/inventory"><SecondaryButton>{t("Manage inventory", "車両管理")}</SecondaryButton></Link>
        <SecondaryButton onClick={async () => { await partnerRequest("/api/partner/logout", { method: "POST", body: JSON.stringify({}) }); setIdentity(null); }}>{t("Sign out", "ログアウト")}</SecondaryButton>
      </div>
    </div>}
    {identity && !isOwner && <div className="mb-5"><StatusMessage>{t("Only the partner account owner can edit or submit the application and upload supporting documents. Contact the owner for changes.", "申請情報の編集・提出と書類のアップロードはオーナーのみ可能です。変更はオーナーに依頼してください。")}</StatusMessage></div>}
    {identity && missingRequirements.length > 0 && <div className="mb-5"><StatusMessage>{t("Outstanding items for approval", "承認に必要な項目")}:
      <ul className="mt-2 list-inside list-disc">{missingRequirements.map((item) => <li key={item}>{requirementLabels[item] ? t(...requirementLabels[item]) : item}</li>)}</ul>
    </StatusMessage></div>}
    {identity && <form id="partner-application-form" onSubmit={(e) => { const shouldSubmit = submitForReview.current; submitForReview.current = false; void saveApplication(e, shouldSubmit); }} className="space-y-6">
      <Section title={t("Business and contact", "事業者・連絡先情報")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Representative name", "担当者名")}><input className={inputClass()} readOnly value={String(record(identity.staff).displayName ?? "")} /></Field>
          <Field label={t("Legal business name", "法人・事業者の正式名称")}><input className={inputClass()} required disabled={!isOwner} value={application.legalName} onChange={(e) => setApp("legalName", e.target.value)} /></Field>
          <Field label={t("Contact email", "連絡用メールアドレス")}><input type="email" className={inputClass()} required disabled={!isOwner} value={application.contactEmail} onChange={(e) => setApp("contactEmail", e.target.value)} /></Field>
          <Field label={t("Contact phone", "電話番号")}><input type="tel" className={inputClass()} required disabled={!isOwner} value={application.contactPhone} onChange={(e) => setApp("contactPhone", e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label={t("Business address", "事業所住所")}><input className={inputClass()} required disabled={!isOwner} value={application.address} onChange={(e) => setApp("address", e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label={t("Rental permissions", "レンタカー許可情報")}><textarea className={textareaClass()} required disabled={!isOwner} value={application.permissions} onChange={(e) => setApp("permissions", e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label={t("Service address / rental desk", "営業所・貸出窓口住所")}><input className={inputClass()} required disabled={!isOwner} value={application.serviceAddress} onChange={(e) => setApp("serviceAddress", e.target.value)} /></Field></div>
          <Field label={t("Service location / area", "営業エリア")}><input className={inputClass()} required disabled={!isOwner} value={application.serviceLocation} onChange={(e) => setApp("serviceLocation", e.target.value)} /></Field>
          <Field label={t("Service hours", "営業時間")}><input className={inputClass()} required disabled={!isOwner} value={application.serviceHours} onChange={(e) => setApp("serviceHours", e.target.value)} placeholder="09:00–18:00" /></Field>
          <Field label={t("Emergency contact name", "緊急連絡先担当者")}><input required disabled={!isOwner} className={inputClass()} value={application.emergencyContactName} onChange={(e) => setApp("emergencyContactName", e.target.value)} /></Field>
          <Field label={t("Emergency contact phone", "緊急連絡先電話番号")}><input required disabled={!isOwner} type="tel" className={inputClass()} value={application.emergencyContactPhone} onChange={(e) => setApp("emergencyContactPhone", e.target.value)} /></Field>
        </div>
      </Section>
      <Section title={t("Compliance documents", "許認可・保険の有効期限")} >
        <p className="text-sm text-slate-600">{t("Enter the expiration date for your commercial insurance and rental permission. Dates help reviewers verify that your documents remain current.", "事業用保険とレンタカー許可の有効期限を入力してください。審査担当者が書類の有効性を確認します。")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Insurance expires", "保険有効期限")}><input type="date" className={inputClass()} required disabled={!isOwner} value={application.insuranceExpiresAt.slice(0, 10)} onChange={(e) => setApp("insuranceExpiresAt", e.target.value)} /></Field>
          <Field label={t("Rental permission expires", "レンタカー許可有効期限")}><input type="date" className={inputClass()} required disabled={!isOwner} value={application.permissionExpiresAt.slice(0, 10)} onChange={(e) => setApp("permissionExpiresAt", e.target.value)} /></Field>
        </div>
        <label className="flex items-start gap-3 rounded-lg border bg-slate-50 p-4 text-sm"><input type="checkbox" required disabled={!isOwner} checked={application.termsAccepted} onChange={(e) => setApplication((current) => ({ ...current, termsAccepted: e.target.checked }))} className="mt-1 h-4 w-4 accent-slate-900" /><span>{t("I accept the CIAO rental partner terms and confirm the information provided is accurate.", "CIAOレンタカーパートナー規約に同意し、入力情報が正確であることを確認します。")}</span></label>
      </Section>
      {isOwner && <Section title={t("Supporting documents", "確認書類")} >
        <p className="text-sm text-slate-600">{t("Upload PDF, JPEG, or PNG evidence. Files are sent through the private document upload flow.", "PDF、JPEG、PNG形式の証明書類をアップロードしてください。ファイルは非公開のアップロード機能で送信されます。")}</p>
        <div className="space-y-3">{documentTypes.map((documentType) => {
          const docs = Array.isArray(requirements.documents) ? requirements.documents.filter((item: any) => item.documentType === documentType) : [];
          return <div key={documentType} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0"><p className="font-medium">{documentType === "insurance" ? t("Commercial insurance", "事業用保険") : documentType === "business_license" ? t("Business license", "事業許可証") : t("Vehicle rental permission", "レンタカー許可証")}</p>
              <p className="mt-1 text-xs text-slate-500">{docs.length ? docs.map((doc: any) => `${doc.status}${doc.expiresAt ? ` · ${String(doc.expiresAt).slice(0, 10)}` : ""}`).join(" · ") : t("No document uploaded", "書類未提出")}</p></div>
            <div className="flex flex-wrap items-end gap-2">
              <input type="file" accept="application/pdf,image/jpeg,image/png" className="max-w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1.5" onChange={(e) => setDocumentFiles((current) => ({ ...current, [documentType]: e.target.files?.[0] ?? null }))} />
              <PrimaryButton type="button" disabled={!documentFiles[documentType] || busy} onClick={() => void uploadDocument(documentType)}>{t("Upload", "アップロード")}</PrimaryButton>
            </div>
          </div>;
        })}</div>
      </Section>}
      {isOwner && <div className="flex flex-wrap gap-3">
        <PrimaryButton disabled={busy}>{busy ? t("Saving…", "保存中…") : t("Save application", "申請を保存")}</PrimaryButton>
        <SecondaryButton disabled={busy} onClick={() => {
          submitForReview.current = true;
          (document.getElementById("partner-application-form") as HTMLFormElement | null)?.requestSubmit();
          window.setTimeout(() => { submitForReview.current = false; }, 0);
        }}>{t("Submit for review", "審査に提出")}</SecondaryButton>
      </div>}
    </form>}
  </PartnerShell>;
}