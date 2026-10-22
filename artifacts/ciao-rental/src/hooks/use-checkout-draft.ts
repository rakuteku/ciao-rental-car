import { useState, useEffect, useCallback } from 'react';

export interface CheckoutDraft {
  vehicleId: number;
  vehicleSlug: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  holdId?: number;
  holdToken?: string;
  heldUntil?: string;
  addons: { addonId: number; qty: number }[];
  differentReturnLocation?: boolean;
  additionalDrivers?: boolean;
  selectedRoom?: {
    id: number;
    slug: string;
    title: string;
    startingPrice: number;
  };
  driver: {
    fullName: string;
    email: string;
    phone: string;
    romanizedName?: string;
    nationality?: string;
    dateOfBirth?: string;
    residenceCountry?: string;
    address?: string;
    emergencyContact?: string;
    flightNumber?: string;
    accommodation?: string;
  };
}

const STORAGE_KEY = 'ciao_rental_checkout_draft';
export const SELECTED_ROOM_STORAGE_KEY = 'ciao_selected_room';

export function readSelectedRoom(): CheckoutDraft["selectedRoom"] {
  try {
    const stored = sessionStorage.getItem(SELECTED_ROOM_STORAGE_KEY);
    if (!stored) return undefined;
    const parsed = JSON.parse(stored) as CheckoutDraft["selectedRoom"];
    if (
      !parsed ||
      typeof parsed.id !== "number" ||
      typeof parsed.slug !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.startingPrice !== "number"
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Persist the checkout draft. Returns false when session storage is unavailable
 * (private browsing, blocked site data, quota exceeded) so callers can tell the
 * customer instead of stalling silently.
 */
function writeDraftToStorage(value: CheckoutDraft | null): boolean {
  try {
    if (value) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function useCheckoutDraft() {
  const [draft, setDraftState] = useState<CheckoutDraft | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as CheckoutDraft & { documents?: unknown };
      if ("documents" in parsed) {
        delete parsed.documents;
        writeDraftToStorage(parsed);
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const setDraft = useCallback((newDraft: CheckoutDraft | null) => {
    const stored = writeDraftToStorage(newDraft);
    setDraftState(newDraft);
    return stored;
  }, []);

  const updateDraft = useCallback((updates: Partial<CheckoutDraft>) => {
    setDraftState(prev => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      writeDraftToStorage(next);
      return next;
    });
  }, []);

  const clearDraft = useCallback(() => {
    writeDraftToStorage(null);
    setDraftState(null);
  }, []);

  return { draft, setDraft, updateDraft, clearDraft };
}
