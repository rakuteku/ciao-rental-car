import { useQuery } from "@tanstack/react-query";
import type { Language } from "@/lib/language";

export type RentalLocation = {
  value: string;
  labelEn: string;
  labelJa: string;
  labelZhTw: string;
  pickupFee: number;
  returnFee: number;
};

export const DEFAULT_RENTAL_LOCATIONS: RentalLocation[] = [
  { value: "CIAO property", labelEn: "CIAO property", labelJa: "CIAO施設", labelZhTw: "CIAO住宿", pickupFee: 2200, returnFee: 2200 },
  { value: "Sapporo Station", labelEn: "Sapporo Station", labelJa: "札幌駅", labelZhTw: "札幌站", pickupFee: 2200, returnFee: 2200 },
  { value: "New Chitose Airport", labelEn: "New Chitose Airport", labelJa: "新千歳空港", labelZhTw: "新千歲機場", pickupFee: 6600, returnFee: 6600 },
  { value: "Okadama Airport", labelEn: "Okadama Airport", labelJa: "丘珠空港", labelZhTw: "丘珠機場", pickupFee: 2200, returnFee: 2200 },
];

function isRentalLocation(value: unknown): value is RentalLocation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RentalLocation>;
  return typeof candidate.value === "string" && Boolean(candidate.value.trim())
    && typeof candidate.labelEn === "string" && Boolean(candidate.labelEn.trim());
}

export function normalizeRentalLocations(value: unknown): RentalLocation[] {
  if (!Array.isArray(value)) return DEFAULT_RENTAL_LOCATIONS;
  const locations = value.filter(isRentalLocation).map((location) => ({
    value: location.value.trim(),
    labelEn: location.labelEn.trim(),
    labelJa: location.labelJa?.trim() || location.labelEn.trim(),
    labelZhTw: location.labelZhTw?.trim() || location.labelEn.trim(),
    pickupFee: Number.isInteger(Number(location.pickupFee)) && Number(location.pickupFee) >= 0 ? Number(location.pickupFee) : 0,
    returnFee: Number.isInteger(Number(location.returnFee)) && Number(location.returnFee) >= 0 ? Number(location.returnFee) : 0,
  }));
  return locations.length ? locations : DEFAULT_RENTAL_LOCATIONS;
}

export function rentalLocationLabel(value: string, locations: RentalLocation[], language: Language): string {
  const location = locations.find((candidate) => candidate.value === value);
  if (!location) return value;
  if (language === "ja") return location.labelJa || location.labelEn;
  if (language === "zh-TW") return location.labelZhTw || location.labelEn;
  return location.labelEn;
}

export function useRentalLocations() {
  return useQuery({
    queryKey: ["rental", "locations"],
    queryFn: async () => {
      const response = await fetch("/api/rental/locations");
      if (!response.ok) throw new Error("Unable to load rental locations");
      const data = await response.json() as { locations?: unknown };
      return normalizeRentalLocations(data.locations);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
