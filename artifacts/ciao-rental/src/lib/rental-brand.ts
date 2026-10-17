import type { Language } from "@/lib/language";

export const RENTAL_BRAND: Record<Language, { name: string; shortName: string; subLabel: string }> = {
  en: { name: "PrimoStay Car Rental", shortName: "PrimoStay", subLabel: "Car Rental" },
  ja: { name: "PrimoStay レンタカー", shortName: "PrimoStay", subLabel: "レンタカー" },
  "zh-TW": { name: "PrimoStay 租車", shortName: "PrimoStay", subLabel: "租車" },
};
