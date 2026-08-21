import { useState, useEffect, useCallback } from 'react';

export interface CheckoutDraft {
  vehicleId: number;
  vehicleSlug: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  holdId?: number;
  heldUntil?: string;
  addons: { addonId: number; qty: number }[];
  documents?: Record<string, string>;
  differentReturnLocation?: boolean;
  additionalDrivers?: boolean;
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

export function useCheckoutDraft() {
  const [draft, setDraftState] = useState<CheckoutDraft | null>(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setDraft = useCallback((newDraft: CheckoutDraft | null) => {
    if (newDraft) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newDraft));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setDraftState(newDraft);
  }, []);

  const updateDraft = useCallback((updates: Partial<CheckoutDraft>) => {
    setDraftState(prev => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearDraft = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setDraftState(null);
  }, []);

  return { draft, setDraft, updateDraft, clearDraft };
}
