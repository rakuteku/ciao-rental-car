import type { Language } from "@/lib/language";

type VehicleText = {
  publicTitle?: string;
  publicTitleJa?: string | null;
  publicTitleZhTw?: string | null;
  description?: string;
  descriptionJa?: string | null;
  descriptionZhTw?: string | null;
  metaTitle?: string;
  metaTitleJa?: string | null;
  metaTitleZhTw?: string | null;
  metaDescription?: string;
  metaDescriptionJa?: string | null;
  metaDescriptionZhTw?: string | null;
};

type AddonText = {
  name: string;
  nameJa?: string | null;
  nameZhTw?: string | null;
  description?: string;
  descriptionJa?: string | null;
  descriptionZhTw?: string | null;
};

function translated(english: string | undefined, japanese: string | null | undefined, chinese: string | null | undefined, language: Language) {
  if (language === "ja") return japanese?.trim() || english || "";
  if (language === "zh-CN") return chinese?.trim() || english || "";
  return english || "";
}

export function localizeVehicle<T extends VehicleText>(vehicle: T, language: Language) {
  return {
    title: translated(vehicle.publicTitle, vehicle.publicTitleJa, vehicle.publicTitleZhTw, language),
    description: translated(vehicle.description, vehicle.descriptionJa, vehicle.descriptionZhTw, language),
    metaTitle: translated(vehicle.metaTitle, vehicle.metaTitleJa, vehicle.metaTitleZhTw, language),
    metaDescription: translated(vehicle.metaDescription, vehicle.metaDescriptionJa, vehicle.metaDescriptionZhTw, language),
  };
}

export function localizeAddon<T extends AddonText>(addon: T, language: Language) {
  return {
    name: translated(addon.name, addon.nameJa, addon.nameZhTw, language),
    description: translated(addon.description, addon.descriptionJa, addon.descriptionZhTw, language),
  };
}

const COPY = {
  en: {
    fleet: "Fleet", vehicles: "Our Vehicles", vehiclesIntro: "Premium vehicles, meticulously maintained for your Hokkaido journey.", available: "Available Vehicles", unavailable: "Not available for your selected dates", selectVehicle: "Select Vehicle", selectDates: "Select dates for a total", calculating: "Calculating total…", estimatedTotal: "estimated total", perDay: "/day", passengers: "pax", noVehicles: "No vehicles found", adjustSearch: "Try adjusting your search criteria or dates.", backToSearch: "Back to Search", editSearch: "Edit Search",
    description: "Description", reserve: "Reserve this Vehicle", reserveHelp: "Select dates to check availability and calculate price", pickup: "Pickup Location", return: "Return Location", pickupDate: "Pickup Date", returnDate: "Return Date", addons: "Add-ons", optional: "Optional", perBooking: "/ booking", rental: "Rental", days: "days", insurance: "Insurance & Taxes", included: "Included", total: "Total", continueBooking: "Continue to Booking", flatFee: "Flat fee", enhanceTrip: "Enhance Your Trip", enhanceTripHelp: "Add extras to make your journey more comfortable.", noAddons: "No add-ons are currently available.", bookingSummary: "Booking Summary",
  },
  ja: {
    fleet: "車両一覧", vehicles: "レンタカー車両", vehiclesIntro: "北海道の旅に向けて丁寧に整備された車両をご用意しています。", available: "利用可能な車両", unavailable: "選択した日程では利用できません", selectVehicle: "この車両を選ぶ", selectDates: "日程を選択すると合計が表示されます", calculating: "料金を計算中…", estimatedTotal: "合計見積り", perDay: "/日", passengers: "名", noVehicles: "車両が見つかりません", adjustSearch: "検索条件または日程を変更してください。", backToSearch: "検索に戻る", editSearch: "検索を変更",
    description: "車両説明", reserve: "この車両を予約", reserveHelp: "日程を選択して空き状況と料金をご確認ください", pickup: "受取場所", return: "返却場所", pickupDate: "受取日", returnDate: "返却日", addons: "追加オプション", optional: "任意", perBooking: "/予約", rental: "レンタル", days: "日", insurance: "保険・税金", included: "込み", total: "合計", continueBooking: "予約手続きへ", flatFee: "予約ごとの定額", enhanceTrip: "旅をもっと快適に", enhanceTripHelp: "必要な追加オプションをお選びください。", noAddons: "現在利用できる追加オプションはありません。", bookingSummary: "予約内容",
  },
  "zh-CN": {
    fleet: "車輛一覽", vehicles: "租車車輛", vehiclesIntro: "為北海道旅程精心保養的優質車輛。", available: "可預訂車輛", unavailable: "所選日期無法預訂", selectVehicle: "選擇車輛", selectDates: "選擇日期以查看總價", calculating: "正在計算…", estimatedTotal: "預估總價", perDay: "/天", passengers: "人", noVehicles: "找不到車輛", adjustSearch: "請調整搜尋條件或日期。", backToSearch: "返回搜尋", editSearch: "修改搜尋",
    description: "車輛說明", reserve: "預訂此車輛", reserveHelp: "選擇日期以確認供應情況與價格", pickup: "取車地點", return: "還車地點", pickupDate: "取車日期", returnDate: "還車日期", addons: "加購項目", optional: "選填", perBooking: "/次預訂", rental: "租車", days: "天", insurance: "保險與稅金", included: "已包含", total: "總計", continueBooking: "繼續預訂", flatFee: "每次預訂固定費用", enhanceTrip: "讓旅程更舒適", enhanceTripHelp: "選擇需要的加購服務。", noAddons: "目前沒有可用的加購項目。", bookingSummary: "預訂摘要",
  },
} as const;

export function rentalCopy(language: Language) {
  return COPY[language];
}
