import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pageContentTable, pageSeoTable } from "@workspace/db";
import {
  CreateAdminContentPageBody,
  DeleteAdminContentPageParams,
  GetLocalizedHomePageParams,
  GetLocalizedHomePageResponse,
  GetLocalizedPageParams,
  GetLocalizedPageResponse,
  GetPageContentParams,
  GetPageContentResponse,
  ListAdminContentPagesResponse,
  UpdateAdminContentParams,
  UpdateAdminContentBody,
} from "@workspace/api-zod";
import { requireAdminAuth } from "../middlewares/admin-auth";
import {
  DEFAULT_SEO,
  getOrSeedSeo,
  localizedRoute,
  normalizeSeo,
  seoValues,
  validateUniqueSlugs,
  emptyLocalized,
  emptyKeywords,
  type LocalizedString,
  type SupportedLanguage,
} from "./seo";

const router: IRouter = Router();

export const KNOWN_PAGES = ["home", "rentalcar", "lodging"] as const;

export const DEFAULT_CONTENT: Record<string, Record<string, unknown>> = {
  home: {
    hero: {
      title: "All-in-one stay in Hokkaido",
      subtitle:
        "Stay, travel, and explore Sapporo with lodging and rental car service in one building.",
      ctaLodging: "Short-term lodging",
      ctaRentalCar: "I want to rent a car",
    },
    lodging: {
      title: "Short-Term Lodging",
      description:
        "Comfortable, fully-furnished rooms in the heart of Sapporo — perfect for a few nights away. Every stay includes fast Wi-Fi, a kitchenette, and easy access to Sapporo's best neighborhoods.",
    },
    monthlyStay: {
      title: "Monthly Short-Term Stay",
      description:
        "Planning a longer visit? Our monthly stay plans offer discounted rates, flexible move-in dates, and all the comforts of home — ideal for remote workers, seasonal visitors, and Hokkaido road-trippers.",
    },
    rentalCarOverview: {
      title: "Rental Car Service",
      description:
        "Skip the rental counter lines. Pick up your car right from our building and hit the road to explore Hokkaido at your own pace, with easy access from New Chitose Airport.",
    },
    access: {
      title: "Location & Access",
      description:
        "Conveniently located in Sapporo with direct access from New Chitose Airport. Find us easily whether you're arriving by train, car, or plane.",
      address: "Wayado Sapporo Ciao, Sapporo, Hokkaido, Japan",
      mapEmbedUrl:
        "https://www.google.com/maps?q=Wayado+Sapporo+Ciao,+Sapporo,+Hokkaido,+Japan&output=embed",
    },
    whyChooseUs: [
      {
        title: "Located in Sapporo, Hokkaido",
        description: "Right in the heart of Japan's northern island, close to everything Hokkaido has to offer.",
      },
      {
        title: "Convenient for Airport Arrival",
        description: "Easy access to and from New Chitose Airport, so your trip starts the moment you land.",
      },
      {
        title: "Plan Your Stay & Car Together",
        description: "Make one convenient plan for your lodging and rental car, with room availability confirmed separately by our team.",
      },
      {
        title: "Great for Families, Groups & Road Trips",
        description: "Spacious rooms and flexible car options make us ideal for families, groups, and long Hokkaido road trips.",
      },
    ],
    contact: {
      title: "Have Questions?",
      description:
        "Reach out to our team for booking assistance, custom itineraries, or anything else you need for your Hokkaido stay.",
      ctaText: "Contact Us",
    },
    copy: {
      heroEyebrow: "All-in-one package in Hokkaido",
      lodgingEyebrow: "Lodging",
      featuredRooms: "Featured Rooms",
      viewAllRooms: "View all rooms",
      monthlyEyebrow: "Monthly Stay",
      rentalEyebrow: "Rental Car",
      exploreRentalCars: "Explore rental cars",
      whyEyebrow: "Why CIAO",
      whyTitle: "Why Choose Us",
      accessEyebrow: "Access",
      contactEyebrow: "Contact",
      lodgingImageAlt: "Comfortable lodging in Sapporo",
      monthlyImageAlt: "Monthly stay in Sapporo",
      rentalImageAlt: "Rental car in Hokkaido",
      mapTitle: "Location map",
      heroImageAlt: "Sapporo winter cityscape",
      perNight: "/night",
    },
  },
  rentalcar: {
    hero: {
      eyebrow: "Sapporo · Hokkaido",
      title: "Rent a Car in Sapporo with Ease",
      subtitle: "Premium vehicles, flexible pickup, fully insured options.",
    },
    search: {
      pickupDate: "Pickup Date", returnDate: "Return Date", pickupLocation: "Pickup Location", returnLocation: "Return Location",
      pickupTime: "Pickup Time", returnTime: "Return Time", pickDate: "Pick a date", selectLocation: "Select location",
      adults: "Adults", children: "Children", babies: "Babies", largeLuggage: "Large luggage", smallLuggage: "Small luggage",
      optionalFilters: "Optional filters", vehicleClass: "Vehicle class", anyClass: "Any class", searchVehicles: "Search Vehicles",
      fullyInsured: "Fully Insured", fullyInsuredDescription: "Comprehensive coverage included in every booking.",
      multipleLocations: "Multiple Locations", multipleLocationsDescription: "Pickup and drop-off across Sapporo and the airport.",
      airportService: "Airport Service", airportServiceDescription: "Seamless New Chitose Airport connections.",
      easyPayment: "Easy Payment", easyPaymentDescription: "Transparent pricing, no hidden fees.",
      roadImageAlt: "Sapporo winter road", minDailyPrice: "Minimum daily price", maxDailyPrice: "Maximum daily price",
      priceRangeTo: "to", perDay: "/day", compact: "Compact", suv: "SUV", minivan: "Minivan",
      fourWheelDrive: "4WD", winterTires: "Winter tires", childSeat: "Child seat", airportDelivery: "Airport delivery", skiLuggage: "Ski luggage",
    },
    sections: {
      fleetEyebrow: "Our Fleet", featuredVehicles: "Featured Vehicles", viewAll: "View all",
      pricingEyebrow: "Pricing", insurancePlans: "Insurance Plans", addOns: "Add-Ons", importantNotes: "Important Notes",
      passengers: "Passengers", perDay: "/day",
    },
    pricingTable: {
      title: "Rental Pricing",
      description: "Transparent daily rates with no hidden fees. Airport pickup/drop-off fees vary by vehicle.",
      rows: [
        { label: "Compact Cars", value: "From ¥6,000 / day" },
        { label: "Sedans", value: "From ¥9,000 / day" },
        { label: "Minivans & SUVs", value: "From ¥13,000 / day" },
      ],
    },
    plans: [
      {
        name: "Standard Plan",
        description: "Daily rental with basic liability insurance included.",
        price: "Included in daily rate",
      },
      {
        name: "Premium Protection Plan",
        description: "Adds full collision damage waiver and roadside assistance for total peace of mind.",
        price: "+¥1,500 / day",
      },
    ],
    addOns: [
      { name: "Child Safety Seat", description: "Rear-facing or booster seat, installed on request.", price: "¥800 / day" },
      { name: "Winter Tire Upgrade", description: "Studless winter tires for snowy Hokkaido roads.", price: "¥1,000 / day" },
      { name: "Portable Wi-Fi Router", description: "Stay connected on the road with unlimited data.", price: "¥600 / day" },
    ],
    importantNotes: [
      "A valid driver's license (and International Driving Permit for overseas visitors) is required at pickup.",
      "Vehicles must be returned with a full tank of fuel or a refueling fee applies.",
      "Winter driving in Hokkaido can be challenging — we recommend the Winter Tire Upgrade from November to March.",
      "Cancellations within 24 hours of pickup may incur a cancellation fee.",
    ],
  },
  lodging: {
    hero: {
      title: "Short-Term Lodging in Sapporo",
      subtitle: "Comfortable, fully furnished rooms for your Hokkaido stay.",
    },
    overview: {
      title: "Make Yourself at Home",
      description: "Stay in the heart of Sapporo with practical amenities and easy access to Hokkaido.",
    },
    contact: {
      title: "Ready to stay with us?",
      description: "Contact our team for availability and booking assistance.",
      ctaText: "Contact Us",
    },
    copy: {
      eyebrow: "Short-Term Lodging",
      heading: "Our Rooms",
      description: "Comfortable, fully-equipped rooms in the heart of Sapporo — ideal for short stays of any length.",
      perNight: "/night",
      guests: "guests",
      bed: "bed",
      beds: "beds",
      viewRoom: "View Room",
      noRooms: "No rooms are currently listed.",
    },
  },
};

type LocalizedContent = { en: Record<string, unknown>; ja: Record<string, unknown>; "zh-CN": Record<string, unknown> };

const DEFAULT_TITLES: Record<string, string> = {
  home: "Home",
  rentalcar: "Rental Car",
  lodging: "Lodging",
};

const DEFAULT_JA_CONTENT: Record<string, Record<string, unknown>> = {
  home: {
    hero: { title: "北海道で滞在も移動もひとつに", subtitle: "札幌の宿泊とレンタカーを同じ建物で便利に計画できます。", ctaLodging: "短期滞在を見る", ctaRentalCar: "レンタカーを見る" },
    lodging: { title: "短期滞在", description: "札幌の中心で快適に過ごせる家具付きのお部屋。Wi-Fi、キッチン、便利なアクセスを備えています。" },
    monthlyStay: { title: "マンスリー短期滞在", description: "長めの滞在には、柔軟な入居日と暮らしやすい設備を備えたお得なプランをご用意しています。" },
    rentalCarOverview: { title: "レンタカーサービス", description: "受付で長く待つことなく、建物からそのまま北海道へ出発。新千歳空港からも便利です。" },
    access: { title: "場所とアクセス", description: "札幌に位置し、新千歳空港からアクセスしやすい便利な立地です。", address: "Wayado Sapporo Ciao, 札幌市, 北海道, 日本" },
    whyChooseUs: [{ title: "北海道・札幌に立地", description: "北海道の観光に便利な札幌の中心にあります。" }, { title: "空港から便利", description: "新千歳空港からの移動もスムーズです。" }, { title: "滞在と車をまとめて計画", description: "宿泊とレンタカーを一緒に計画できます。お部屋の空き状況はスタッフが別途確認します。" }, { title: "家族・グループ・ドライブ旅行に", description: "家族旅行や長距離の北海道旅行に対応します。" }],
    contact: { title: "ご質問はありますか？", description: "予約のお手伝いや旅程のご相談など、お気軽にお問い合わせください。", ctaText: "お問い合わせ" },
    copy: { heroEyebrow: "北海道でのオールインワン旅行", lodgingEyebrow: "宿泊", featuredRooms: "おすすめのお部屋", viewAllRooms: "すべてのお部屋", monthlyEyebrow: "マンスリーステイ", rentalEyebrow: "レンタカー", exploreRentalCars: "レンタカーを見る", whyEyebrow: "CIAOの特徴", whyTitle: "選ばれる理由", accessEyebrow: "アクセス", contactEyebrow: "お問い合わせ", lodgingImageAlt: "札幌の快適な宿泊施設", monthlyImageAlt: "札幌のマンスリーステイ", rentalImageAlt: "北海道のレンタカー", mapTitle: "所在地マップ", heroImageAlt: "札幌の冬の街並み", perNight: "/泊" },
  },
  rentalcar: {
    hero: { eyebrow: "札幌・北海道", title: "札幌で便利にレンタカー", subtitle: "プレミアム車種、柔軟な受け取り、安心の保険オプション。" },
    sections: { fleetEyebrow: "車両一覧", featuredVehicles: "おすすめ車両", viewAll: "すべて見る", pricingEyebrow: "料金", insurancePlans: "保険プラン", addOns: "追加オプション", importantNotes: "重要事項", passengers: "定員", perDay: "/日" },
    pricingTable: { title: "レンタル料金", description: "隠れた費用のない明瞭な日額料金です。", rows: [{ label: "コンパクトカー", value: "1日 ¥6,000〜" }, { label: "セダン", value: "1日 ¥9,000〜" }, { label: "ミニバン・SUV", value: "1日 ¥13,000〜" }] },
    importantNotes: ["受取時に有効な運転免許証が必要です。海外からのお客様は国際運転免許証もご用意ください。", "燃料満タンで返却してください。", "北海道の冬道では冬タイヤをおすすめします。", "受取24時間以内のキャンセルには手数料がかかる場合があります。"],
  },
  lodging: {
    hero: { title: "札幌の短期滞在", subtitle: "北海道での滞在に便利な、家具付きで快適なお部屋。" },
    overview: { title: "自宅のように過ごす", description: "札幌の中心で、設備と北海道へのアクセスを備えた滞在をお楽しみください。" },
    contact: { title: "一緒に滞在計画を始めませんか？", description: "空室状況や予約についてスタッフにご相談ください。", ctaText: "お問い合わせ" },
    copy: { eyebrow: "短期滞在", heading: "お部屋", description: "札幌中心部の快適で設備の整ったお部屋。", perNight: "/泊", guests: "名", bed: "ベッド", beds: "ベッド", viewRoom: "お部屋を見る", noRooms: "現在掲載中のお部屋はありません。" },
  },
};

const DEFAULT_ZH_CONTENT: Record<string, Record<string, unknown>> = {
  home: {
    hero: { title: "在北海道，一站式安排住宿与出行", subtitle: "在札幌同一栋楼内，方便地规划住宿和租车。", ctaLodging: "查看短租住宿", ctaRentalCar: "查看租车" },
    lodging: { title: "短期住宿", description: "位于札幌中心的舒适家具房，配有 Wi-Fi、小厨房，并方便前往札幌各处。" },
    monthlyStay: { title: "月租短住", description: "提供价格优惠、入住日期灵活且舒适如家的月租方案。" },
    rentalCarOverview: { title: "租车服务", description: "无需在租车柜台排队，从我们的楼宇直接取车，轻松探索北海道。" },
    access: { title: "位置与交通", description: "位于札幌，从新千岁机场前往十分方便。", address: "Wayado Sapporo Ciao，日本北海道札幌市" },
    whyChooseUs: [{ title: "位于札幌・北海道", description: "从北海道的中心城市出发，方便前往岛上的各个景点。" }, { title: "机场交通便利", description: "往返新千岁机场轻松方便。" }, { title: "住宿与租车一起规划", description: "可以一起规划住宿和租车；房间空房情况由工作人员另行确认。" }, { title: "适合家庭、团体与自驾", description: "适合家庭出游、团体旅行及北海道自驾。" }],
    contact: { title: "有问题吗？", description: "如需预订协助或定制行程，欢迎联系我们。", ctaText: "联系我们" },
    copy: { heroEyebrow: "北海道一站式旅程", lodgingEyebrow: "住宿", featuredRooms: "精选房间", viewAllRooms: "查看全部房间", monthlyEyebrow: "月租住宿", rentalEyebrow: "租车", exploreRentalCars: "探索租车", whyEyebrow: "CIAO的优势", whyTitle: "为什么选择我们", accessEyebrow: "交通", contactEyebrow: "联系我们", lodgingImageAlt: "札幌舒适住宿", monthlyImageAlt: "札幌月租住宿", rentalImageAlt: "北海道租车", mapTitle: "位置地图", heroImageAlt: "札幌冬季城市景色", perNight: "/晚" },
  },
  rentalcar: {
    hero: { eyebrow: "札幌・北海道", title: "轻松租车探索札幌", subtitle: "优质车型、灵活取车，并提供全面保险选项。" },
    sections: { fleetEyebrow: "我们的车队", featuredVehicles: "精选车辆", viewAll: "查看全部", pricingEyebrow: "价格", insurancePlans: "保险方案", addOns: "附加服务", importantNotes: "重要提示", passengers: "乘客", perDay: "/天" },
    pricingTable: { title: "租车价格", description: "每日价格透明，没有隐藏费用。", rows: [{ label: "紧凑型车", value: "¥6,000 / 天起" }, { label: "轿车", value: "¥9,000 / 天起" }, { label: "小型客车与 SUV", value: "¥13,000 / 天起" }] },
    importantNotes: ["取车时需要有效驾驶证；海外游客还需要国际驾驶许可证。", "还车时请加满燃油。", "建议在冬季升级冬季轮胎。", "取车前24小时内取消可能产生取消费用。"],
  },
  lodging: {
    hero: { title: "札幌短期住宿", subtitle: "家具齐全、舒适便利的北海道住宿房间。" },
    overview: { title: "像在家一样自在", description: "住在札幌中心，享受实用设施和前往北海道各处的便利交通。" },
    contact: { title: "准备好入住了吗？", description: "联系我们了解空房情况并获得预订协助。", ctaText: "联系我们" },
    copy: { eyebrow: "短期住宿", heading: "我们的房间", description: "札幌中心舒适、设施齐全的房间，适合各种时长的短住。", perNight: "/晚", guests: "位客人", bed: "张床", beds: "张床", viewRoom: "查看房间", noRooms: "目前没有房间信息。" },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeContent(base: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(update)) {
    merged[key] = isRecord(value) && isRecord(base[key]) ? mergeContent(base[key], value) : value;
  }
  return merged;
}

function normalizeContent(page: string, content: Record<string, unknown>): LocalizedContent {
  const defaults = DEFAULT_CONTENT[page];
  const japaneseDefaults = DEFAULT_JA_CONTENT[page] ?? {};
  const chineseDefaults = DEFAULT_ZH_CONTENT[page] ?? {};
  if (isRecord(content.en) || isRecord(content.ja) || isRecord(content["zh-CN"])) {
    return {
      en: mergeContent(defaults, isRecord(content.en) ? content.en : {}),
      ja: mergeContent(japaneseDefaults, isRecord(content.ja) ? content.ja : {}),
      "zh-CN": mergeContent(chineseDefaults, isRecord(content["zh-CN"]) ? content["zh-CN"] : {}),
    };
  }
  return { en: mergeContent(defaults, content), ja: japaneseDefaults, "zh-CN": chineseDefaults };
}

function isKnownPage(page: string): boolean {
  return (KNOWN_PAGES as readonly string[]).includes(page);
}

function localizedTextFromRow(row: { titleEn: string; titleJa: string; titleZhCn: string } | undefined, page: string) {
  return {
    en: row?.titleEn || DEFAULT_TITLES[page] || "",
    ja: row?.titleJa || "",
    "zh-CN": row?.titleZhCn || "",
  };
}

function localizedSlugsFromSeo(seo: ReturnType<typeof normalizeSeo> | null, page: string): LocalizedString {
  const fallback = DEFAULT_SEO[page]?.slug ?? `/${page}`;
  return seo?.slugs ?? { en: fallback, ja: fallback, "zh-CN": "" };
}

function pageResponse(
  page: string,
  row: { content: Record<string, unknown>; titleEn: string; titleJa: string; titleZhCn: string; published: boolean; updatedAt: Date } | undefined,
  seo: ReturnType<typeof normalizeSeo> | null,
) {
  const content = normalizeContent(page, row?.content ?? {});
  const title = localizedTextFromRow(row, page);
  const slugs = localizedSlugsFromSeo(seo, page);
  return {
    page,
    title,
    slugs,
    content,
    published: row?.published ?? true,
    isCustom: !isKnownPage(page),
    updatedAt: (row?.updatedAt ?? new Date()).toISOString(),
  };
}

async function getOrSeedContentRow(page: string) {
  const [existing] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  if (existing) return existing;
  if (!isKnownPage(page)) return null;
  const defaults = normalizeContent(page, {});
  const [created] = await db
    .insert(pageContentTable)
    .values({
      page,
      content: defaults,
      titleEn: DEFAULT_TITLES[page],
      titleJa: "",
      titleZhCn: "",
      published: true,
    })
    .onConflictDoNothing({ target: pageContentTable.page })
    .returning();
  if (created) return created;
  const [row] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  return row ?? null;
}

async function getPageDocument(page: string) {
  const row = await getOrSeedContentRow(page);
  if (!row) return null;
  const seoRow = await getOrSeedSeo(page);
  return pageResponse(page, row, seoRow ? normalizeSeo(page, seoRow) : null);
}

function normalizePageKey(page: string): string {
  return page.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function normalizeSlug(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "/") return "/";
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return path.replace(/\/+/g, "/").replace(/\/$/, "");
}

function localizedFallback(english: unknown, translated: unknown): unknown {
  if (typeof english === "string") {
    return typeof translated === "string" && translated.trim() ? translated : english;
  }
  if (Array.isArray(english)) {
    if (!Array.isArray(translated) || translated.length === 0) return english;
    return english.map((value, index) => localizedFallback(value, translated[index]));
  }
  if (isRecord(english)) {
    const translatedRecord = isRecord(translated) ? translated : {};
    return Object.fromEntries(
      Object.entries(english).map(([key, value]) => [key, localizedFallback(value, translatedRecord[key])]),
    );
  }
  return translated ?? english;
}

async function resolveLocalizedPage(language: SupportedLanguage, slug: string) {
  const rows = await db.select().from(pageContentTable);
  const seoRows = await db.select().from(pageSeoTable);
  for (const row of rows) {
    if (!row.published) continue;
    const seoRow = seoRows.find((candidate) => candidate.page === row.page);
    if (!seoRow) continue;
    const seo = normalizeSeo(row.page, seoRow);
    const candidateSlug = seo.slugs[language] || seo.slugs.en;
    if (normalizeSlug(candidateSlug) !== normalizeSlug(slug)) continue;
    const document = pageResponse(row.page, row, seo);
    const title = document.title[language]?.trim() ? document.title[language] : document.title.en;
    const content = localizedFallback(document.content.en, document.content[language]) as Record<string, unknown>;
    return {
      page: row.page,
      language,
      title,
      content,
      seo,
      routes: {
        en: localizedRoute("en", seo.slugs.en),
        ja: localizedRoute("ja", seo.slugs.ja || seo.slugs.en),
        "zh-CN": localizedRoute("zh-CN", seo.slugs["zh-CN"] || seo.slugs.en),
      },
      published: row.published,
    };
  }
  return null;
}

function adminSummary(document: ReturnType<typeof pageResponse>) {
  return {
    page: document.page,
    title: document.title,
    slugs: document.slugs,
    published: document.published,
    isCustom: document.isCustom,
    updatedAt: document.updatedAt,
  };
}

router.get("/content/route/:language", async (req, res): Promise<void> => {
  const params = GetLocalizedHomePageParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  const document = await resolveLocalizedPage(params.data.language as SupportedLanguage, "/");
  if (!document) return void res.status(404).json({ error: "Page not found" });
  res.json(GetLocalizedHomePageResponse.parse(document));
});

router.get("/content/route/:language/:slug", async (req, res): Promise<void> => {
  const params = GetLocalizedPageParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  const document = await resolveLocalizedPage(params.data.language as SupportedLanguage, `/${params.data.slug}`);
  if (!document) return void res.status(404).json({ error: "Page not found" });
  res.json(GetLocalizedPageResponse.parse(document));
});

router.get("/content/:page", async (req, res): Promise<void> => {
  const params = GetPageContentParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  const document = await getPageDocument(params.data.page);
  if (!document) return void res.status(404).json({ error: "Unknown page" });
  res.json(GetPageContentResponse.parse(document));
});

router.get("/admin/content", requireAdminAuth, async (_req, res): Promise<void> => {
  const documents = await Promise.all(KNOWN_PAGES.map((page) => getPageDocument(page)));
  const customRows = await db.select().from(pageContentTable);
  const customDocuments = await Promise.all(
    customRows.filter((row) => !isKnownPage(row.page)).map(async (row) => {
      const seoRow = await getOrSeedSeo(row.page);
      return pageResponse(row.page, row, seoRow ? normalizeSeo(row.page, seoRow) : null);
    }),
  );
  const all = [...documents, ...customDocuments].filter((value): value is NonNullable<typeof value> => value !== null);
  res.json(ListAdminContentPagesResponse.parse(all.map(adminSummary)));
});

router.post("/admin/content", requireAdminAuth, async (req, res): Promise<void> => {
  const body = CreateAdminContentPageBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: body.error.message });
  const page = normalizePageKey(body.data.page);
  if (!page || isKnownPage(page)) return void res.status(400).json({ error: "Choose a unique custom page key." });
  const [existing] = await db.select().from(pageContentTable).where(eq(pageContentTable.page, page));
  if (existing) return void res.status(400).json({ error: "A page with this key already exists." });
  const slugs: LocalizedString = {
    en: normalizeSlug(body.data.slugs.en),
    ja: normalizeSlug(body.data.slugs.ja),
    "zh-CN": normalizeSlug(body.data.slugs["zh-CN"]),
  };
  if (!slugs.en) return void res.status(400).json({ error: "English URL slug is required." });
  const slugError = await validateUniqueSlugs(slugs);
  if (slugError) return void res.status(400).json({ error: slugError });
  const seoInput = {
    slug: slugs.en,
    slugs,
    metaTitle: body.data.metaTitle,
    metaDescription: body.data.metaDescription,
    keywords: emptyKeywords(),
    ogTitle: body.data.metaTitle,
    ogDescription: body.data.metaDescription,
    ogImage: "",
    ogImageAlt: emptyLocalized(),
    canonicalUrl: localizedRoute("en", slugs.en),
    canonicalUrls: {
      en: localizedRoute("en", slugs.en),
      ja: localizedRoute("ja", slugs.ja || slugs.en),
      "zh-CN": localizedRoute("zh-CN", slugs["zh-CN"] || slugs.en),
    },
    allowIndexing: true,
  };
  const [created] = await db.insert(pageContentTable).values({
    page,
    titleEn: body.data.title.en,
    titleJa: body.data.title.ja,
    titleZhCn: body.data.title["zh-CN"],
    content: body.data.content,
    published: body.data.published ?? true,
  }).returning();
  await db.insert(pageSeoTable).values(seoValues(page, seoInput));
  const response = pageResponse(page, created, normalizeSeo(page, await getOrSeedSeo(page) as NonNullable<Awaited<ReturnType<typeof getOrSeedSeo>>>));
  res.status(201).json(GetPageContentResponse.parse(response));
});

router.put("/admin/content/:page", requireAdminAuth, async (req, res): Promise<void> => {
  const params = UpdateAdminContentParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  const body = UpdateAdminContentBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: body.error.message });
  const existing = await getOrSeedContentRow(params.data.page);
  if (!existing) return void res.status(404).json({ error: "Unknown page" });
  const stored = normalizeContent(params.data.page, existing.content);
  const incoming = body.data.content ?? {};
  const content: LocalizedContent = {
    en: mergeContent(stored.en, isRecord(incoming.en) ? incoming.en : {}),
    ja: mergeContent(stored.ja, isRecord(incoming.ja) ? incoming.ja : {}),
    "zh-CN": mergeContent(stored["zh-CN"], isRecord(incoming["zh-CN"]) ? incoming["zh-CN"] : {}),
  };
  const title = body.data.title ?? localizedTextFromRow(existing, params.data.page);
  const [updated] = await db.update(pageContentTable).set({
    content,
    titleEn: title.en,
    titleJa: title.ja,
    titleZhCn: title["zh-CN"],
    published: body.data.published ?? existing.published,
    updatedAt: new Date(),
  }).where(eq(pageContentTable.page, params.data.page)).returning();
  if (body.data.slugs) {
    const slugs: LocalizedString = {
      en: normalizeSlug(body.data.slugs.en),
      ja: normalizeSlug(body.data.slugs.ja),
      "zh-CN": normalizeSlug(body.data.slugs["zh-CN"]),
    };
    if (!slugs.en) return void res.status(400).json({ error: "English URL slug is required." });
    const slugError = await validateUniqueSlugs(slugs, params.data.page);
    if (slugError) return void res.status(400).json({ error: slugError });
    const seo = await getOrSeedSeo(params.data.page);
    if (seo) {
      await db.update(pageSeoTable).set({
        slug: slugs.en,
        slugEn: slugs.en,
        slugJa: slugs.ja,
        slugZhCn: slugs["zh-CN"],
        canonicalUrlEn: localizedRoute("en", slugs.en),
        canonicalUrlJa: localizedRoute("ja", slugs.ja || slugs.en),
        canonicalUrlZhCn: localizedRoute("zh-CN", slugs["zh-CN"] || slugs.en),
        canonicalUrl: localizedRoute("en", slugs.en),
        updatedAt: new Date(),
      }).where(eq(pageSeoTable.page, params.data.page));
    }
  }
  const seoRow = await getOrSeedSeo(params.data.page);
  const response = pageResponse(params.data.page, updated, seoRow ? normalizeSeo(params.data.page, seoRow) : null);
  res.json(GetPageContentResponse.parse(response));
});

router.delete("/admin/content/:page", requireAdminAuth, async (req, res): Promise<void> => {
  const params = DeleteAdminContentPageParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: params.error.message });
  if (isKnownPage(params.data.page)) return void res.status(400).json({ error: "Built-in pages cannot be deleted." });
  const [deleted] = await db.delete(pageContentTable).where(eq(pageContentTable.page, params.data.page)).returning();
  if (!deleted) return void res.status(404).json({ error: "Page not found" });
  await db.delete(pageSeoTable).where(eq(pageSeoTable.page, params.data.page));
  res.status(204).end();
});

export default router;
