type Terms = Record<string, unknown>;

function describe(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Included" : "Not included";
  if (Array.isArray(value)) return value.map(describe).filter(Boolean).join(", ") || null;
  if (typeof value === "object") {
    const entries = Object.entries(value as Terms).map(([key, item]) => {
      const detail = describe(item);
      return detail ? `${key.replace(/([A-Z])/g, " $1")}: ${detail}` : null;
    }).filter(Boolean);
    return entries.join("; ") || null;
  }
  return null;
}

function find(source: Terms, keys: string[]): string | null {
  for (const key of keys) {
    const value = describe(source[key]);
    if (value) return value;
  }
  return null;
}

export function MarketplaceTerms({ disclosures, policy, pickupLocations, returnLocations, language }: {
  disclosures?: Terms | null; policy?: Terms | null; pickupLocations?: string[] | null;
  returnLocations?: string[] | null; language: string;
}) {
  const ja = language === "ja";
  const vehicle = disclosures || {};
  const rules = policy || {};
  const empty = ja ? "事業者からまだ提示されていません。承諾前にご確認ください。" : "Not yet supplied. Ask the operator before accepting.";
  const facts = [
    [ja ? "貸出対応場所" : "Pickup coverage", describe(pickupLocations) || find(vehicle, ["pickupCoverage", "serviceArea", "pickupLocations", "pickupArea"])],
    [ja ? "返却対応場所" : "Return coverage", describe(returnLocations) || find(vehicle, ["returnCoverage", "returnLocations", "returnArea"])],
    [ja ? "補償内容" : "Insurance coverage", find(vehicle, ["insuranceCoverage", "coverage", "coverageTerms", "insurance"]) || find(rules, ["marketplaceCoverageTerms", "coverageTerms"])],
    [ja ? "免責額" : "Deductible", find(vehicle, ["deductible", "insuranceDeductible", "deductibleAmount", "excess"]) || find(rules, ["deductible", "insuranceDeductible"])],
    [ja ? "休業補償料（NOC）" : "Non-operation charge (NOC)", find(vehicle, ["noc", "nonOperationCharge", "nocFee", "nocTerms"]) || find(rules, ["noc", "nonOperationCharge"])],
    [ja ? "キャンセル条件" : "Cancellation terms", find(vehicle, ["cancellationPolicy", "cancellation", "cancellationTerms"]) || find(rules, ["marketplaceCancellationPolicy", "cancellationPolicy"])],
  ] as const;
  return <div className="grid gap-3 sm:grid-cols-2" data-testid="marketplace-vehicle-terms">
    {facts.map(([label, value]) => <div key={label} className="border-l-2 border-[#b5593d] bg-[#faf8f1] px-4 py-3">
      <h3 className="text-sm font-semibold">{label}</h3>
      <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${value ? "text-foreground" : "text-muted-foreground"}`}>{value || empty}</p>
    </div>)}
  </div>;
}