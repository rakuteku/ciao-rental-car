import type { RentalAddon } from "@workspace/api-client-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/lib/language";
import { localizeAddon } from "@/lib/rental-localization";

export function AddonSelector({
  addons,
  selected,
  onChange,
}: {
  addons: RentalAddon[];
  selected: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
}) {
  const { language } = useLanguage();
  const t = (en: string, ja: string, zh: string) =>
    language === "ja" ? ja : language === "zh-TW" ? zh : en;
  const protections = addons.filter((addon) => addon.category === "insurance");
  function toggle(addon: RentalAddon, enabled: boolean) {
    const next = { ...selected, [addon.id]: enabled ? 1 : 0 };
    if (enabled && addon.category === "insurance") {
      for (const other of protections) {
        if (
          other.id !== addon.id &&
          (["basic", "full"].includes(addon.insuranceKind || "") ||
            ["basic", "full"].includes(other.insuranceKind || "") ||
            other.insuranceKind === addon.insuranceKind)
        )
          next[other.id] = 0;
      }
    }
    onChange(next);
  }
  return (
    <div className="space-y-5">
      {(["insurance", "equipment"] as const).map((category) => {
        const items = addons.filter((addon) =>
          category === "insurance"
            ? addon.category === category
            : !addon.category || addon.category === category,
        );
        return (
          <section key={category} className="space-y-3">
            <h3 className="text-sm font-semibold">
              {category === "insurance"
                ? t("Insurance & protection", "保険・補償", "保險與保障")
                : t("Optional equipment", "オプション備品", "選配設備")}
            </h3>
            {items.map((addon) => {
              const localized = localizeAddon(addon, language);
              const perPeriod = ["per_day", "per_started_24_hours"].includes(
                String(addon.pricingType),
              );
              const included = String(addon.pricingType) === "included";
              const unit = perPeriod
                ? t(
                    "per started 24 hours",
                    "24時間ごと（端数切上げ）",
                    "每開始24小時",
                  )
                : String(addon.pricingType) === "per_handover"
                  ? t("per handover", "引渡しごと", "每次交車")
                  : t("per rental", "1予約につき", "每次租賃");
              return (
                <label
                  key={addon.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={(selected[addon.id] || 0) > 0}
                    onCheckedChange={(checked) =>
                      toggle(addon, checked === true)
                    }
                    aria-label={localized.name}
                  />
                  {addon.image && (
                    <img
                      src={addon.image}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {localized.name}
                    </span>
                    {localized.description && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {localized.description}
                      </span>
                    )}
                    <span className="mt-1 block text-xs font-medium">
                      {included
                        ? t("Included", "料金に含まれます", "已包含")
                        : `¥${(perPeriod ? addon.perDayFee : addon.flatFee).toLocaleString("ja-JP")} / ${unit}`}
                    </span>
                  </span>
                  {category === "equipment" &&
                    perPeriod &&
                    addon.maxQty > 1 &&
                    (selected[addon.id] || 0) > 0 && (
                      <select
                        aria-label={`${localized.name}: ${t("quantity", "数量", "數量")}`}
                        value={selected[addon.id]}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          onChange({
                            ...selected,
                            [addon.id]: Number(event.target.value),
                          })
                        }
                        className="h-8 rounded border bg-background px-2 text-sm"
                      >
                        {Array.from({ length: addon.maxQty }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    )}
                </label>
              );
            })}
            {category === "insurance" &&
              items.some((addon) =>
                ["per_day", "per_started_24_hours"].includes(
                  String(addon.pricingType),
                ),
              ) && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "A 25-hour rental uses two protection periods.",
                    "25時間のレンタルでは補償料金は2期間分です。",
                    "租賃25小時將計算兩個保障期間。",
                  )}
                </p>
              )}
            {!items.length && (
              <p className="text-xs text-muted-foreground">
                {category === "insurance"
                  ? t(
                      "No optional protection plans available.",
                      "追加補償プランはありません。",
                      "目前沒有額外保障方案。",
                    )
                  : t(
                      "No optional equipment available.",
                      "オプション備品はありません。",
                      "目前沒有選配設備。",
                    )}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
