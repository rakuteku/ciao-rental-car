type Addon = {
  name?: string;
  nameJa?: string | null;
  nameZhTw?: string | null;
  category?: string;
  insuranceKind?: string | null;
};
export function addonCategory(addon: Addon): string;
export function insuranceKind(addon: Addon): string;
export function validateProtectionSelection(addons: Addon[]): void;
