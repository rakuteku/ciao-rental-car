export function addonCategory(addon) {
  if (addon.category && addon.category !== "equipment") return addon.category;
  const name = addon.name?.trim().toLowerCase() || "";
  if (
    [
      "winter tires",
      "winter tyres",
      "winter tire",
      "winter tyre",
      "winter tire upgrade",
      "winter tyre upgrade",
      "winter tires upgrade",
      "winter tyres upgrade",
      "snow tires",
      "snow tyres",
    ].includes(name) ||
    ["冬用タイヤ", "スタッドレスタイヤ"].includes(addon.nameJa) ||
    ["冬季輪胎", "雪胎"].includes(addon.nameZhTw)
  )
    return "winter_tires";
  if (
    [
      "noc",
      "noc protection",
      "cdw",
      "cdw protection",
      "deductible waiver",
      "full protection package",
    ].includes(name)
  )
    return "insurance";
  return "equipment";
}

export function insuranceKind(addon) {
  if (addon.insuranceKind) return addon.insuranceKind;
  const name = addon.name?.trim().toLowerCase() || "";
  return name.includes("noc") ? "noc" : name.includes("full") ? "full" : "cdw";
}

export function validateProtectionSelection(addons) {
  const kinds = addons
    .filter((addon) => addonCategory(addon) === "insurance")
    .map(insuranceKind);
  if (
    new Set(kinds).size !== kinds.length ||
    (kinds.includes("full") && kinds.length > 1) ||
    (kinds.includes("basic") && kinds.length > 1)
  ) {
    throw Object.assign(
      new Error(
        "Choose either a protection package or individual CDW/NOC options, not both",
      ),
      { status: 400 },
    );
  }
}
