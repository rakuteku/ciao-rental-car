import { useState, useEffect } from "react";
import { AddonSelector } from "@/components/rental/AddonSelector";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, ChevronRight, ArrowLeft, Mail, Car, Clock, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

import { useCheckoutDraft } from "@/hooks/use-checkout-draft";
import { useCustomerAccount, useRentalMarketplaceConfig } from "@/hooks/use-rental-operations";
import { MarketplaceCheckout } from "./marketplace";
import { localizedPath, useLanguage } from "@/lib/language";
import { useInlineSeoMeta } from "@/hooks/use-seo-meta";
import { localizeAddon, localizeVehicle, rentalCopy } from "@/lib/rental-localization";
import { DEFAULT_RENTAL_LOCATIONS, rentalLocationLabel, useRentalLocations } from "@/lib/rental-locations";
import { formatTokyo, tokyoHour } from "@/lib/rental-marketplace";
import {
  useGetRentalAddons,
  useGetRentalVehicle,
  getGetRentalVehicleQueryKey,
  useGetRentalHold,
  getGetRentalHoldQueryKey,
  useCalculateRentalPrice,
  useCreateRentalReservation,
} from "@workspace/api-client-react";

const driverSchema = (validation: { fullNameRequired: string; emailInvalid: string; phoneRequired: string }) => z.object({
  fullName: z.string().min(2, validation.fullNameRequired),
  email: z.string().email(validation.emailInvalid),
  phone: z.string().min(10, validation.phoneRequired),
  romanizedName: z.string().optional(),
  nationality: z.string().optional(),
  dateOfBirth: z.string().optional(),
  residenceCountry: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  flightNumber: z.string().optional(),
  accommodation: z.string().optional(),
});
type DriverForm = z.infer<ReturnType<typeof driverSchema>>;

const paymentCopy = {
  en: {
    step: "Payment",
    title: "Payment instructions",
    message: "No online payment is taken now. We will confirm your booking and send payment instructions by email.",
    total: "Total (tax included)",
    consentBefore: "I agree to the ",
    terms: "Terms of Service",
    consentBetween: " and ",
    privacy: "Privacy Policy",
    consentAfter: ".",
    submit: "Submit booking",
    submitting: "Submitting...",
  },
  ja: {
    step: "お支払い",
    title: "お支払いのご案内",
    message: "現時点でオンライン決済は行いません。予約内容を確認のうえ、お支払い方法をメールでご案内します。",
    total: "合計（税込）",
    consentBefore: "",
    terms: "利用規約",
    consentBetween: "および",
    privacy: "プライバシーポリシー",
    consentAfter: "に同意します。",
    submit: "予約を送信",
    submitting: "送信中...",
  },
  "zh-TW": {
    step: "付款",
    title: "付款方式",
    message: "目前不會在線上收費。我們確認預約後，會以電子郵件寄送付款方式。",
    total: "總計（含稅）",
    consentBefore: "我同意",
    terms: "服務條款",
    consentBetween: "及",
    privacy: "隱私權政策",
    consentAfter: "。",
    submit: "送出預訂",
    submitting: "送出中...",
  },
} as const;

const documentCopy = {
  en: { title: "Documents", upload: "After booking, upload PDF, JPEG, or PNG files securely from your booking details.", pickup: "Original documents are checked at pickup. Staff will contact you about the documents needed.", driversLicence: "Driver's licence", japaneseLicense: "Japanese driver's licence", creditCard: "Credit card", insurance: "Insurance document", checking: "Checking secure upload…", retry: "Could not check secure upload. Please try again.", tryAgain: "Try again", foreignLicense: "Foreign driver's licence", idp: "International driving permit", passport: "Passport", residenceCard: "Residence card", selfie: "Identity photo", additionalDrivers: "Additional driver's documents", other: "Other document" },
  ja: { title: "書類", upload: "予約後、予約詳細から PDF・JPEG・PNG 形式の書類を安全にアップロードできます。", pickup: "原本は貸出時に確認します。必要書類についてスタッフからご連絡します。", driversLicence: "運転免許証", japaneseLicense: "日本の運転免許証", creditCard: "クレジットカード", insurance: "保険書類", checking: "安全なアップロードを確認しています…", retry: "安全なアップロードを確認できませんでした。もう一度お試しください。", tryAgain: "再試行", foreignLicense: "外国の運転免許証", idp: "国際運転免許証", passport: "パスポート", residenceCard: "在留カード", selfie: "本人確認用写真", additionalDrivers: "追加運転者の書類", other: "その他の書類" },
  "zh-TW": { title: "文件", upload: "預訂後可在預訂詳情安全上傳 PDF、JPEG 或 PNG 文件。", pickup: "取車時會查驗文件正本。工作人員將聯絡您確認所需文件。", driversLicence: "駕駛執照", japaneseLicense: "日本駕駛執照", creditCard: "信用卡", insurance: "保險文件", checking: "正在確認安全上傳…", retry: "無法確認安全上傳，請重試。", tryAgain: "重試", foreignLicense: "外國駕駛執照", idp: "國際駕駛許可證", passport: "護照", residenceCard: "在留卡", selfie: "身分確認照片", additionalDrivers: "其他駕駛人的文件", other: "其他文件" },
} as const;

const checkoutCopy = {
  en: {
    addons: "Add-ons", driverInfo: "Driver Info", pickupDetails: "Pickup Details", summary: "Summary", pickupDetailsSubtitle: "Confirm your locations, times, and delivery notes.", driverInfoSubtitle: "Please provide details for the primary driver.", summarySubtitle: "Please review your booking details.", back: "Back", continue: "Continue", error: "Error", holdInvalid: "Hold expired or invalid", bookingFailed: "Booking failed", bookingRetry: "Please try again later.",
    unavailableTitle: "Checkout temporarily unavailable", unavailableBody: "We could not verify the booking mode. No booking was submitted.", tryAgain: "Try again", noCheckoutTitle: "No active checkout", noCheckoutBody: "Please select a vehicle first.", viewFleet: "View Fleet", held: "Your vehicle is held for you", differentReturn: "I need a different return location. Our team will confirm any applicable delivery fee before pickup.", afterHours: "Your pickup is outside normal desk hours. An after-hours service fee may apply.", pickup: "Pickup", return: "Return",
    fullName: "Full Name (as on Licence)", romanizedName: "Romanized Name (if applicable)", email: "Email Address", phone: "Phone Number", nationality: "Nationality", dateOfBirth: "Date of Birth", residenceCountry: "Country of Residence", address: "Home Address", emergencyContact: "Emergency Contact", emergencyContactPlaceholder: "Name and phone number", flightNumber: "Arrival Flight Number (Optional)", flightNumberPlaceholder: "e.g. JL501", accommodation: "Hotel / Accommodation (Optional)", addDriver: "Add additional driver", additionalDriver: "Additional driver", additionalDriverName: "Full legal name", additionalDriverNameAria: "Additional driver full legal name", additionalDriverEmailAria: "Additional driver email", additionalDriverPhoneAria: "Additional driver phone",
    primaryDriver: "Primary Driver", name: "Name", itinerary: "Itinerary", stayPlanning: "Stay planning", stayPlanningNotice: "Room availability is confirmed separately by the PrimoStay Car Rental team.", selectedAddons: "Selected add-ons", addonsTotal: "Add-ons total", pickupFee: "Pickup Fee", dropoffFee: "Drop-off Fee", pickupLocationFee: "Pickup Location Fee", returnLocationFee: "Return Location Fee", oneWayFee: "One-way Fee", priceUnavailable: "We could not calculate the total.", holdExpiredTitle: "Your reservation hold has expired", holdExpiredBody: "The vehicle may no longer be available for your selected dates.", returnToSearch: "Return to search",
    fullNameRequired: "Full name is required", emailInvalid: "Valid email is required", phoneRequired: "Phone number is required", seoTitle: "Checkout | PrimoStay Car Rental", seoDescription: "Review your PrimoStay Car Rental booking, driver details, add-ons, and pickup information.", seoOgDescription: "Review your PrimoStay Car Rental booking before confirming.", signInTitle: "Sign in before booking", signInBody: "Sign in or create an account to continue this vehicle booking.", signInAction: "Sign in or create account",
  },
  ja: {
    addons: "追加オプション", driverInfo: "運転者情報", pickupDetails: "貸出詳細", summary: "概要", pickupDetailsSubtitle: "場所、日時、配車に関するご要望をご確認ください。", driverInfoSubtitle: "主な運転者の情報を入力してください。", summarySubtitle: "予約内容をご確認ください。", back: "戻る", continue: "次へ", error: "エラー", holdInvalid: "仮予約の有効期限が切れたか、無効です。", bookingFailed: "予約を送信できませんでした", bookingRetry: "しばらくしてからもう一度お試しください。",
    unavailableTitle: "現在チェックアウトをご利用いただけません", unavailableBody: "予約モードを確認できませんでした。予約は送信されていません。", tryAgain: "再試行", noCheckoutTitle: "進行中の予約はありません", noCheckoutBody: "先に車両を選択してください。", viewFleet: "車両一覧を見る", held: "車両を仮押さえしています", differentReturn: "返却場所を変更したい。該当する配車料金は、貸出前にスタッフが確認します。", afterHours: "貸出時間が通常の営業時間外です。時間外対応料金がかかる場合があります。", pickup: "貸出", return: "返却",
    fullName: "氏名（免許証の表記どおり）", romanizedName: "ローマ字氏名（該当する場合）", email: "メールアドレス", phone: "電話番号", nationality: "国籍", dateOfBirth: "生年月日", residenceCountry: "居住国", address: "住所", emergencyContact: "緊急連絡先", emergencyContactPlaceholder: "氏名と電話番号", flightNumber: "到着便名（任意）", flightNumberPlaceholder: "例：JL501", accommodation: "ホテル・宿泊先（任意）", addDriver: "追加運転者を追加", additionalDriver: "追加運転者", additionalDriverName: "正式な氏名", additionalDriverNameAria: "追加運転者の正式な氏名", additionalDriverEmailAria: "追加運転者のメールアドレス", additionalDriverPhoneAria: "追加運転者の電話番号",
    primaryDriver: "主な運転者", name: "氏名", itinerary: "旅程", stayPlanning: "宿泊のご計画", stayPlanningNotice: "客室の空室状況は、PrimoStay Car Rental チームが別途確認します。", selectedAddons: "選択した追加オプション", addonsTotal: "追加オプション合計", pickupFee: "貸出料金", dropoffFee: "返却料金", pickupLocationFee: "貸出場所料金", returnLocationFee: "返却場所料金", oneWayFee: "乗り捨て料金", priceUnavailable: "料金を計算できませんでした。", holdExpiredTitle: "車両の仮押さえ期限が切れました", holdExpiredBody: "選択した日程では車両をご利用いただけない場合があります。", returnToSearch: "車両を検索する",
    fullNameRequired: "氏名を入力してください", emailInvalid: "有効なメールアドレスを入力してください", phoneRequired: "電話番号を入力してください", seoTitle: "チェックアウト | PrimoStay Car Rental", seoDescription: "PrimoStay Car Rental の予約、運転者情報、追加オプション、貸出情報を確認します。", seoOgDescription: "予約を確定する前に PrimoStay Car Rental の予約内容を確認します。", signInTitle: "予約にはログインが必要です", signInBody: "ログインまたはアカウントを作成すると、この車両の予約を続けられます。", signInAction: "ログイン・アカウント作成",
  },
  "zh-TW": {
    addons: "加購項目", driverInfo: "駕駛人資料", pickupDetails: "取車詳情", summary: "摘要", pickupDetailsSubtitle: "請確認地點、時間和交車備註。", driverInfoSubtitle: "請提供主要駕駛人的資料。", summarySubtitle: "請確認您的預訂詳情。", back: "返回", continue: "繼續", error: "錯誤", holdInvalid: "保留已過期或無效。", bookingFailed: "預訂失敗", bookingRetry: "請稍後再試。",
    unavailableTitle: "目前無法結帳", unavailableBody: "無法確認預訂模式。尚未送出任何預訂。", tryAgain: "重試", noCheckoutTitle: "沒有進行中的結帳", noCheckoutBody: "請先選擇車輛。", viewFleet: "查看車隊", held: "已為您保留車輛", differentReturn: "我需要不同的還車地點。團隊會在取車前確認適用的交車費用。", afterHours: "您的取車時間在一般服務時間外，可能需要支付非營業時間服務費。", pickup: "取車", return: "還車",
    fullName: "全名（須與駕照相同）", romanizedName: "羅馬拼音姓名（如適用）", email: "電子郵件地址", phone: "電話號碼", nationality: "國籍", dateOfBirth: "出生日期", residenceCountry: "居住國", address: "住址", emergencyContact: "緊急聯絡人", emergencyContactPlaceholder: "姓名和電話號碼", flightNumber: "抵達航班號碼（選填）", flightNumberPlaceholder: "例如 JL501", accommodation: "飯店／住宿地點（選填）", addDriver: "新增其他駕駛人", additionalDriver: "其他駕駛人", additionalDriverName: "法定全名", additionalDriverNameAria: "其他駕駛人的法定全名", additionalDriverEmailAria: "其他駕駛人的電子郵件地址", additionalDriverPhoneAria: "其他駕駛人的電話號碼",
    primaryDriver: "主要駕駛人", name: "姓名", itinerary: "行程", stayPlanning: "住宿規劃", stayPlanningNotice: "PrimoStay Car Rental 團隊將另行確認客房供應情況。", selectedAddons: "已選加購項目", addonsTotal: "加購項目合計", pickupFee: "取車費", dropoffFee: "還車費", pickupLocationFee: "取車地點費", returnLocationFee: "還車地點費", oneWayFee: "異地還車費", priceUnavailable: "無法計算總額。", holdExpiredTitle: "您的車輛保留已過期", holdExpiredBody: "您選擇的日期可能已沒有可用車輛。", returnToSearch: "返回搜尋",
    fullNameRequired: "請輸入全名", emailInvalid: "請輸入有效的電子郵件地址", phoneRequired: "請輸入電話號碼", seoTitle: "結帳 | PrimoStay Car Rental", seoDescription: "確認您的 PrimoStay Car Rental 預訂、駕駛人資料、加購項目和取車資訊。", seoOgDescription: "確認預訂前，請先檢視您的 PrimoStay Car Rental 預訂詳情。", signInTitle: "請先登入再預訂", signInBody: "登入或建立帳戶後，即可繼續此車輛的預訂。", signInAction: "登入或建立帳戶",
  },
} as const;

function documentName(value: string, language: keyof typeof documentCopy): string {
  const names = documentCopy[language];
  const key = value.toLowerCase().replaceAll(/[\s'-]+/g, "_");
  if (key === "japanese_license") return names.japaneseLicense;
  if (key === "drivers_license" || key === "driver_s_license") return names.driversLicence;
  if (key === "foreign_license") return names.foreignLicense;
  if (key === "idp" || key === "international_license") return names.idp;
  if (key.includes("passport")) return names.passport;
  if (key === "residence_card") return names.residenceCard;
  if (key === "selfie") return names.selfie;
  if (key === "additional_driver_docs") return names.additionalDrivers;
  if (key === "credit_card") return names.creditCard;
  if (key === "insurance") return names.insurance;
  return names.other;
}

export function CheckoutPage() {
  const { language } = useLanguage();
  const checkout = checkoutCopy[language];
  const account = useCustomerAccount();
  const config = useRentalMarketplaceConfig();
  if (config.isLoading || account.isLoading) return <div className="container min-h-[60dvh] space-y-4 py-20"><div className="h-10 w-56 animate-pulse bg-muted" /><div className="h-48 max-w-3xl animate-pulse bg-muted" /></div>;
  if (config.isError || !config.data) return <div className="container min-h-[60dvh] py-20"><h1 className="font-serif text-2xl">{checkout.unavailableTitle}</h1><p className="my-4 text-muted-foreground">{checkout.unavailableBody}</p><Button onClick={() => config.refetch()}>{checkout.tryAgain}</Button></div>;
  if (!account.data?.account) {
    const next = localizedPath("/rentalcar/checkout", language);
    return <div className="container grid min-h-[65dvh] place-items-center py-16"><Card className="w-full max-w-lg"><CardContent className="space-y-5 p-8 text-center"><h1 className="font-serif text-3xl font-bold">{checkout.signInTitle}</h1><p className="text-muted-foreground">{checkout.signInBody}</p><Button asChild className="w-full"><Link href={`${localizedPath("/rentalcar/my-bookings", language)}?next=${encodeURIComponent(next)}`}>{checkout.signInAction}</Link></Button></CardContent></Card></div>;
  }
  return config.data.enabled ? <MarketplaceCheckout /> : <LegacyCheckout />;
}

function LegacyCheckout() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { draft, updateDraft, clearDraft } = useCheckoutDraft();
  const { toast } = useToast();
  const { language } = useLanguage();
  const copy = rentalCopy(language);
  const payment = paymentCopy[language];
  const checkout = checkoutCopy[language];
  const customer = useCustomerAccount().data?.account as { email?: string; fullName?: string; phone?: string } | undefined;
  const { data: configuredLocations } = useRentalLocations();
  const locations = configuredLocations ?? DEFAULT_RENTAL_LOCATIONS;
  const locationLabel = (value: string) => rentalLocationLabel(value, locations, language);
  useInlineSeoMeta({
    metaTitle: checkout.seoTitle,
    metaDescription: checkout.seoDescription,
    ogTitle: checkout.seoTitle,
    ogDescription: checkout.seoOgDescription,
    ogImage: "",
  });
  
  const [step, setStep] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [holdExpired, setHoldExpired] = useState(false);
  const [differentReturnLocation, setDifferentReturnLocation] = useState(draft?.differentReturnLocation ?? false);
  const [additionalDriver, setAdditionalDriver] = useState({ fullName: "", email: "", phone: "" });
  const [selectedAddons, setSelectedAddons] = useState<Record<number, number>>(
    draft?.addons.reduce((acc, curr) => ({ ...acc, [curr.addonId]: curr.qty }), {}) || {}
  );
  const [agreedTerms, setAgreedTerms] = useState(false);
  
  const { data: addons } = useGetRentalAddons();
  useEffect(() => {
    if (!addons) return;
    const available = new Set(addons.map(addon => addon.id));
    setSelectedAddons(current => Object.keys(current).some(id => !available.has(Number(id)))
      ? Object.fromEntries(Object.entries(current).filter(([id]) => available.has(Number(id))))
      : current);
  }, [addons]);
  const { data: marketplaceConfig, isLoading: isMarketplaceConfigLoading, isError: isMarketplaceConfigError, refetch: refetchMarketplaceConfig } = useRentalMarketplaceConfig();
  const { data: car } = useGetRentalVehicle(draft?.vehicleSlug || "", {
    query: { enabled: !!draft?.vehicleSlug, queryKey: getGetRentalVehicleQueryKey(draft?.vehicleSlug || "") }
  });
  const localizedCar = car ? localizeVehicle(car, language) : undefined;
  const addonName = (addonId: number, fallback: string) => {
    const addon = addons?.find((candidate) => candidate.id === addonId);
    return addon ? localizeAddon(addon, language).name : fallback;
  };
  const { data: holdStatus } = useGetRentalHold(draft?.holdId ?? 0, {
    request: { headers: { "X-Hold-Token": draft?.holdToken ?? "" } },
    query: {
      queryKey: [...getGetRentalHoldQueryKey(draft?.holdId ?? 0), draft?.holdToken],
      refetchInterval: 30_000,
      enabled: Boolean(draft?.holdId && draft?.holdToken),
    },
  });

  const createReservation = useCreateRentalReservation();

  const form = useForm<DriverForm>({
    resolver: zodResolver(driverSchema(checkout)),
    defaultValues: draft?.driver || {
      fullName: customer?.fullName || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      romanizedName: "",
      nationality: "",
      flightNumber: "",
      accommodation: "",
    },
  });

  const priceQuote = useCalculateRentalPrice();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (holdStatus?.expired || (draft?.heldUntil && new Date(draft.heldUntil).getTime() <= now)) {
      setHoldExpired(true);
    }
  }, [draft?.heldUntil, holdStatus?.expired, now]);

  useEffect(() => {
    if (customer?.email) form.setValue("email", customer.email);
    if (customer?.fullName && !form.getValues("fullName")) form.setValue("fullName", customer.fullName);
    if (customer?.phone && !form.getValues("phone")) form.setValue("phone", customer.phone);
  }, [customer?.email, customer?.fullName, customer?.phone, form]);

  useEffect(() => {
    if (draft) {
      priceQuote.mutate({
        data: {
          vehicleId: draft.vehicleId,
          pickupAt: draft.pickupAt,
          returnAt: draft.returnAt,
          pickupLocation: draft.pickupLocation,
          returnLocation: draft.returnLocation,
          addons: Object.entries(selectedAddons)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
        }
      });
    }
  }, [draft?.vehicleId, draft?.pickupAt, draft?.returnAt, draft?.pickupLocation, draft?.returnLocation, JSON.stringify(selectedAddons)]);

  const priceData = priceQuote.data;

  if (!draft) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center space-y-4">
        <h1 className="text-2xl font-serif">{checkout.noCheckoutTitle}</h1>
        <p className="text-muted-foreground">{checkout.noCheckoutBody}</p>
        <Button onClick={() => setLocation(localizedPath("/rentalcar/cars", language))}>{checkout.viewFleet}</Button>
      </div>
    );
  }

  const handleNext = () => {
    if (step === 1) {
      updateDraft({
        addons: Object.entries(selectedAddons)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
      });
      setStep(2);
    } else if (step === 2) {
      form.handleSubmit((data) => {
        updateDraft({ driver: data });
        setStep(3);
      })();
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      updateDraft({ differentReturnLocation });
      setStep(5);
    } else if (step < 6) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleConfirm = () => {
    if (!draft.holdId || !draft.holdToken || holdExpired) {
      toast({ title: checkout.error, description: checkout.holdInvalid, variant: "destructive" });
      return;
    }
    
    createReservation.mutate({
      data: {
        holdId: draft.holdId,
        holdToken: draft.holdToken,
        vehicleId: draft.vehicleId,
        pickupAt: draft.pickupAt,
        returnAt: draft.returnAt,
        pickupLocation: draft.pickupLocation,
        returnLocation: draft.returnLocation,
        driver: draft.driver,
        additionalDrivers: draft.additionalDrivers ? [additionalDriver] : [],
         addons: Object.entries(selectedAddons)
           .filter(([, qty]) => qty > 0)
           .map(([id, qty]) => ({ addonId: parseInt(id), qty })),
        source: "web",
      }
    }, {
      onSuccess: (reservation) => {
        queryClient.invalidateQueries({ queryKey: ["rental", "customer-account"] });
        window.sessionStorage.setItem("ciao_rental_confirmation", JSON.stringify({
          reservation,
           selectedRoom: draft.selectedRoom ?? null,
          draft: {
            pickupAt: draft.pickupAt,
            returnAt: draft.returnAt,
            pickupLocation: draft.pickupLocation,
            returnLocation: draft.returnLocation,
          },
          vehicle: car ? { title: car.publicTitle || car.model, image: car.images?.[0]?.url } : null,
           pricing: reservation.pricing,
        }));
        clearDraft();
        setLocation(`${localizedPath("/rentalcar/booking/confirmation", language)}?id=${reservation.id}`);
      },
      onError: () => {
        toast({ title: checkout.bookingFailed, description: checkout.bookingRetry, variant: "destructive" });
      }
    });
  };

  const steps = [
    checkout.addons,
    checkout.driverInfo,
    documentCopy[language].title,
    checkout.pickupDetails,
    checkout.summary,
    payment.step
  ];
  const secondsRemaining = draft.heldUntil
    ? Math.max(0, Math.ceil((new Date(draft.heldUntil).getTime() - now) / 1_000))
    : 0;
  const holdLabel = `${String(Math.floor(secondsRemaining / 60)).padStart(2, "0")}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-[100dvh] bg-muted/10 py-12">
      <div className="container max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 text-sm shadow-sm">
          <div className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4" /> {checkout.held}</div>
          <span className="font-mono text-base font-bold">{holdLabel}</span>
        </div>
        
        {/* Progress Bar */}
        <div className="relative">
          <div className="absolute top-1/2 left-0 w-full h-1 -translate-y-1/2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-in-out"
              style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%` }}
            />
          </div>
          <div className="relative flex justify-between">
            {steps.map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors z-10
                  ${step > i + 1 ? 'bg-primary text-primary-foreground' : step === i + 1 ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'}`}
                >
                  {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${step >= i + 1 ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-8">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 4: Pickup details */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{checkout.pickupDetails}</h2>
                  <p className="text-muted-foreground">{checkout.pickupDetailsSubtitle}</p>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-background p-4">
                  <Checkbox id="different-return" checked={differentReturnLocation} onCheckedChange={(checked) => setDifferentReturnLocation(Boolean(checked))} />
                  <label htmlFor="different-return" className="text-sm leading-relaxed">
                    {checkout.differentReturn}
                  </label>
                </div>
                {((tokyoHour(draft.pickupAt) ?? 10) < 8 || (tokyoHour(draft.pickupAt) ?? 10) >= 19) && (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm">
                    {checkout.afterHours}
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{checkout.pickup}</div>
                      <div className="font-bold text-lg">{formatTokyo(draft.pickupAt, language)}</div>
                      <div className="text-sm text-muted-foreground">{locationLabel(draft.pickupLocation)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-6 space-y-2">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{checkout.return}</div>
                      <div className="font-bold text-lg">{formatTokyo(draft.returnAt, language)}</div>
                      <div className="text-sm text-muted-foreground">{locationLabel(draft.returnLocation)}</div>
                    </CardContent>
                  </Card>
                </div>
                {car && (
                  <Card>
                    <CardContent className="p-6 flex items-center gap-6">
                      <div className="w-32 aspect-[4/3] bg-muted rounded-md overflow-hidden shrink-0">
                        <img src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"} alt={car.model} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{car.brand} · {car.year}</p>
                        <h3 className="font-serif font-bold text-xl">{localizedCar?.title || car.model}</h3>
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5"><Car className="w-4 h-4"/> {car.seats} {copy.passengers}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Step 1: Add-ons */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{checkout.addons}</h2>
                  <p className="text-muted-foreground">{copy.enhanceTripHelp}</p>
                </div>
                <div className="space-y-4">
                  <AddonSelector addons={addons ?? []} selected={selectedAddons} onChange={setSelectedAddons} />
                  {!addons?.length && (
                    <div className="p-8 text-center bg-white border rounded-xl text-muted-foreground">
                      {copy.noAddons}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 2: Driver Details */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{checkout.driverInfo}</h2>
                  <p className="text-muted-foreground">{checkout.driverInfoSubtitle}</p>
                </div>
                <Card>
                  <CardContent className="p-6">
                    <Form {...form}>
                      <form className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="fullName" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.fullName}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="romanizedName" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.romanizedName}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="email" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.email}</FormLabel><FormControl><Input type="email" readOnly className="bg-muted" {...field} value={customer?.email || field.value} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="phone" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.phone}</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="nationality" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.nationality}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.dateOfBirth}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="residenceCountry" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.residenceCountry}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="address" render={({ field }) => (
                            <FormItem className="sm:col-span-2"><FormLabel>{checkout.address}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="emergencyContact" render={({ field }) => (
                            <FormItem className="sm:col-span-2"><FormLabel>{checkout.emergencyContact}</FormLabel><FormControl><Input placeholder={checkout.emergencyContactPlaceholder} {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                        <Separator />
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField control={form.control} name="flightNumber" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.flightNumber}</FormLabel><FormControl><Input placeholder={checkout.flightNumberPlaceholder} {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                          <FormField control={form.control} name="accommodation" render={({ field }) => (
                            <FormItem><FormLabel>{checkout.accommodation}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                          )} />
                        </div>
                      </form>
                    </Form>
                    <Button variant="outline" className="mt-5" onClick={() => updateDraft({ additionalDrivers: true })}>+ {checkout.addDriver}</Button>
                    {draft.additionalDrivers && (
                      <div className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2">
                        <p className="sm:col-span-2 text-sm font-medium">{checkout.additionalDriver}</p>
                        <Input placeholder={checkout.additionalDriverName} aria-label={checkout.additionalDriverNameAria} value={additionalDriver.fullName} onChange={(event) => setAdditionalDriver((driver) => ({ ...driver, fullName: event.target.value }))} />
                        <Input type="email" placeholder={checkout.email} aria-label={checkout.additionalDriverEmailAria} value={additionalDriver.email} onChange={(event) => setAdditionalDriver((driver) => ({ ...driver, email: event.target.value }))} />
                        <Input type="tel" placeholder={checkout.phone} aria-label={checkout.additionalDriverPhoneAria} value={additionalDriver.phone} onChange={(event) => setAdditionalDriver((driver) => ({ ...driver, phone: event.target.value }))} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 3: Documents */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{documentCopy[language].title}</h2>
                  <p className="text-muted-foreground">{isMarketplaceConfigLoading ? documentCopy[language].checking : isMarketplaceConfigError ? documentCopy[language].retry : marketplaceConfig?.privateDocumentUploadAvailable ? documentCopy[language].upload : documentCopy[language].pickup}</p>
                  {isMarketplaceConfigError && <Button className="mt-3 min-h-11" variant="outline" disabled={isMarketplaceConfigLoading} onClick={() => void refetchMarketplaceConfig()}>{documentCopy[language].tryAgain}</Button>}
                </div>
                {(car?.requiredDocuments?.length ? car.requiredDocuments : ["drivers_license", "passport"]).map((document, index) => (
                  <Card key={`${document}-${index}`}>
                    <CardContent className="p-5 font-medium">{documentName(document, language)}</CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Step 5: Summary */}
            {step === 5 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{checkout.summary}</h2>
                  <p className="text-muted-foreground">{checkout.summarySubtitle}</p>
                </div>

                <div className="grid gap-6">
                  <Card>
                    <CardContent className="p-6 space-y-6">
                      <div>
                        <h3 className="font-bold text-lg mb-4 border-b pb-2">{checkout.primaryDriver}</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">{checkout.name}</span>
                            <span className="font-medium">{draft.driver.fullName}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">{checkout.email}</span>
                            <span className="font-medium">{draft.driver.email}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">{checkout.phone}</span>
                            <span className="font-medium">{draft.driver.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-lg mb-4 border-b pb-2">{checkout.itinerary}</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs">{checkout.pickup}</span>
                            <span className="font-medium">{formatTokyo(draft.pickupAt, language)}</span><br/>
                            <span className="text-xs text-muted-foreground">{locationLabel(draft.pickupLocation)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block text-xs">{checkout.return}</span>
                            <span className="font-medium">{formatTokyo(draft.returnAt, language)}</span><br/>
                            <span className="text-xs text-muted-foreground">{locationLabel(draft.returnLocation)}</span>
                          </div>
                        </div>
                      </div>
                      {draft.selectedRoom && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{checkout.stayPlanning}</p>
                          <p className="mt-1 font-semibold">{draft.selectedRoom.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {checkout.stayPlanningNotice}
                          </p>
                        </div>
                      )}
                      {priceData?.addons && priceData.addons.length > 0 && (
                        <div>
                          <h3 className="font-bold text-lg mb-4 border-b pb-2">{checkout.selectedAddons}</h3>
                          <div className="space-y-2 text-sm">
                            {priceData.addons.map((addon) => (
                              <div key={addon.addonId} className="flex justify-between gap-4">
                                <span>{addonName(addon.addonId, addon.name)} × {addon.qty}</span>
                                <span className="tabular-nums">¥{addon.totalPrice.toLocaleString()}</span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t pt-2 font-medium">
                              <span>{checkout.addonsTotal}</span>
                              <span className="tabular-nums">¥{priceData.addonsTotal.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* Step 6: Payment */}
            {step === 6 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div>
                  <h2 className="text-2xl font-serif font-bold">{payment.step}</h2>
                </div>
                
                <Card>
                  <CardContent className="p-8 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                      <Mail className="w-8 h-8" />
                    </div>
                    <h3 className="font-bold text-xl">{payment.title}</h3>
                    <p className="text-muted-foreground max-w-sm">
                      {payment.message}
                    </p>
                    <div className="w-full max-w-sm rounded-lg bg-muted/50 px-4 py-3 text-left">
                      <div className="flex items-center justify-between gap-4 font-semibold">
                        <span>{payment.total}</span>
                        <span className="tabular-nums">{priceData ? `¥${priceData.finalTotal.toLocaleString()}` : copy.calculating}</span>
                      </div>
                    </div>
                    
                    <div className="pt-6 w-full max-w-sm text-left">
                      <div className="flex items-start gap-3">
                        <Checkbox id="terms" checked={agreedTerms} onCheckedChange={(c) => setAgreedTerms(!!c)} />
                        <label htmlFor="terms" className="text-sm text-muted-foreground leading-snug">
                          {payment.consentBefore}<a href={localizedPath("/terms", language)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">{payment.terms}</a>{payment.consentBetween}<a href={localizedPath("/privacy-policy", language)} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">{payment.privacy}</a>{payment.consentAfter}
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Button variant="ghost" onClick={handleBack} disabled={step === 1} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> {checkout.back}
              </Button>
              {step < 6 ? (
                <Button onClick={handleNext} className="gap-2" size="lg">
                  {checkout.continue} <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={handleConfirm} disabled={!agreedTerms || !priceData || createReservation.isPending} className="gap-2 px-8" size="lg">
                  {createReservation.isPending ? payment.submitting : payment.submit} <Check className="w-4 h-4" />
                </Button>
              )}
            </div>

          </div>

          {/* Sidebar / Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardContent className="p-6 space-y-6">
                <div>
                  <h3 className="font-serif font-bold text-lg">{copy.bookingSummary}</h3>
                </div>
                
                {car && (
                  <div className="flex gap-4 items-center">
                    <div className="w-16 h-12 bg-muted rounded overflow-hidden">
                      <img src={car.images?.[0]?.url || "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80"} alt={car.model} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-bold text-sm leading-tight">{localizedCar?.title || car.model}</div>
                      <div className="text-xs text-muted-foreground">{car.vehicleClass}</div>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-3 text-sm">
                  {priceData ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{copy.rental} ({priceData.days} {copy.days})</span>
                        <span>¥{priceData.subtotal.toLocaleString()}</span>
                      </div>
                      {priceData.addonsTotal > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{copy.addons}</span>
                            <span>¥{priceData.addonsTotal.toLocaleString()}</span>
                          </div>
                          {priceData.addons?.map((addon) => (
                            <div key={addon.addonId} className="flex justify-between pl-3 text-xs">
                              <span className="text-muted-foreground">{addonName(addon.addonId, addon.name)} × {addon.qty}</span>
                              <span>¥{addon.totalPrice.toLocaleString()}</span>
                            </div>
                          ))}
                        </>
                      )}
                      {priceData.airportPickupFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{checkout.pickupFee}</span>
                          <span>¥{priceData.airportPickupFee.toLocaleString()}</span>
                        </div>
                      )}
                      {priceData.airportDropoffFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{checkout.dropoffFee}</span>
                          <span>¥{priceData.airportDropoffFee.toLocaleString()}</span>
                        </div>
                      )}
                      {(priceData as any).pickupLocationFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{checkout.pickupLocationFee}</span><span>¥{(priceData as any).pickupLocationFee.toLocaleString()}</span></div>}
                      {(priceData as any).returnLocationFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{checkout.returnLocationFee}</span><span>¥{(priceData as any).returnLocationFee.toLocaleString()}</span></div>}
                      {(priceData as any).oneWayFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{checkout.oneWayFee}</span><span>¥{(priceData as any).oneWayFee.toLocaleString()}</span></div>}
                      <Separator className="my-2" />
                      <div className="flex justify-between font-bold text-lg">
                        <span>{payment.total}</span>
                        <span>¥{priceData.finalTotal.toLocaleString()}</span>
                      </div>
                    </>
                  ) : priceQuote.isError ? (
                    <div className="space-y-3 py-3 text-center text-sm text-destructive">
                      <p>{checkout.priceUnavailable}</p>
                      <Button variant="outline" size="sm" onClick={() => priceQuote.mutate({ data: { vehicleId: draft.vehicleId, pickupAt: draft.pickupAt, returnAt: draft.returnAt, pickupLocation: draft.pickupLocation, returnLocation: draft.returnLocation, addons: Object.entries(selectedAddons).filter(([, qty]) => qty > 0).map(([id, qty]) => ({ addonId: Number(id), qty })) } })}>{checkout.tryAgain}</Button>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      {copy.calculating}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      {holdExpired && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <Card className="max-w-md">
            <CardContent className="space-y-5 p-7">
              <Clock className="h-8 w-8 text-destructive" />
              <div>
                <h2 className="font-serif text-2xl font-bold">{checkout.holdExpiredTitle}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{checkout.holdExpiredBody}</p>
              </div>
        <Button className="w-full" onClick={() => { clearDraft(); setLocation(`${localizedPath("/rentalcar", language)}?hold=expired`); }}>{checkout.returnToSearch}</Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
