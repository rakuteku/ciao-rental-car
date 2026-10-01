import { useQuery } from "@tanstack/react-query";
import type { Language } from "@/lib/language";

export type RentalLocation = {
  value: string;
  labelEn: string;
  labelJa: string;
  labelZhTw: string;
};

export const DEFAULT_RENTAL_LOCATIONS: RentalLocation[] = [
  { value: "Sapporo Station", labelEn: "Sapporo Station", labelJa: "札幌駅", labelZhTw: "札幌站" },
  { value: "New Chitose Airport", labelEn: "New Chitose Airport", labelJa: "新千歳空港", labelZhTw: "新千歲機場" },
  { value: "Sapporo City Center", labelEn: "Sapporo City Center", labelJa: "札幌市中心部", labelZhTw: "札幌市中心" },
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
  }));
  return locations.length ? locations : DEFAULT_RENTAL_LOCATIONS;
}

export function rentalLocationLabel(value: string, locations: RentalLocation[], language: Language): string {
  const location = locations.find((candidate) => candidate.value === value);
  if (!location) return value;
  if (language === "ja") return location.labelJa || location.labelEn;
  if (language === "zh-CN") return location.labelZhTw || location.labelEn;
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
