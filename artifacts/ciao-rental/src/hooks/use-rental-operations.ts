import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getGetRentalAddonsQueryKey } from "@workspace/api-client-react";

const BASE_URL = "/api";

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });
  
  if (!response.ok) {
    let message = "An error occurred";
    let requoteRequired = false;
    let approvalStatus: string | undefined;
    try {
      const errorData = await response.json();
      message = errorData.error || errorData.message || message;
      requoteRequired = errorData.requoteRequired === true;
      approvalStatus = typeof errorData.approvalStatus === "string" ? errorData.approvalStatus : undefined;
    } catch {
      // Ignore
    }
    const error = new Error(message) as Error & { requoteRequired?: boolean; approvalStatus?: string };
    if (requoteRequired) error.requoteRequired = true;
    if (approvalStatus) error.approvalStatus = approvalStatus;
    throw error;
  }
  
  // if no content (e.g. 204), return null
  const text = await response.text();
  if (!text) return null;
  
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ------------------------------------------------------------------
// Admin Reservations
// ------------------------------------------------------------------

export const useAdminReservations = (params?: { status?: string; vehicleId?: number }) => {
  return useQuery({
    queryKey: ["admin", "reservations", params],
    queryFn: () => {
      const urlParams = new URLSearchParams();
      if (params?.status) urlParams.append("status", params.status);
      if (params?.vehicleId) urlParams.append("vehicleId", String(params.vehicleId));
      const qs = urlParams.toString();
      return fetchWithAuth(`/admin/rental/reservations${qs ? "?" + qs : ""}`);
    },
  });
};

export const useAdminReservation = (id: number) => {
  return useQuery({
    queryKey: ["admin", "reservations", id],
    queryFn: () => fetchWithAuth(`/admin/rental/reservations/${id}`),
    enabled: !!id,
  });
};

export const useAdminReservationTrip = (id: number, enabled = true) => {
  return useQuery({
    queryKey: ["admin", "reservations", id, "trip"],
    queryFn: () => fetchWithAuth(`/admin/rental/reservations/${id}/trip`),
    enabled: enabled && Number.isInteger(id) && id > 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });
};

export const usePartnerReservations = (enabled = true) => {
  return useQuery({
    queryKey: ["partner", "rental", "reservations"],
    queryFn: () => fetchWithAuth("/partner/rental/reservations"),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });
};

export const usePartnerReservationTrip = (id: number, enabled = true) => {
  return useQuery({
    queryKey: ["partner", "rental", "reservations", id, "trip"],
    queryFn: () => fetchWithAuth(`/partner/rental/reservations/${id}/trip`),
    enabled: enabled && Number.isInteger(id) && id > 0,
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
  });
};

export const useRentalTripAction = (scope: "admin" | "partner") => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, data }: { id: number; action: "pickup" | "return" | "close"; data: Record<string, unknown> }) =>
      fetchWithAuth(`/${scope}/rental/reservations/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      if (scope === "partner") {
        queryClient.invalidateQueries({ queryKey: ["partner", "rental", "reservations"] });
        queryClient.invalidateQueries({ queryKey: ["partner", "rental", "reservations", id, "trip"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin", "reservations"] });
        queryClient.invalidateQueries({ queryKey: ["admin", "reservations", id] });
        queryClient.invalidateQueries({ queryKey: ["admin", "reservations", id, "trip"] });
        queryClient.invalidateQueries({ queryKey: ["my-bookings", id] });
      }
    },
  });
};

export const useAdminRentalFinance = (reservationId: number) => {
  return useQuery({
    queryKey: ["admin", "rental", "finance", reservationId],
    queryFn: () => fetchWithAuth(`/admin/rental/finance?reservationId=${encodeURIComponent(reservationId)}`),
    enabled: Number.isInteger(reservationId) && reservationId > 0,
    refetchInterval: 30_000,
  });
};

export const useRefundAdminRentalPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, amount, reason }: { paymentId: number; amount: number; reason: string }) =>
      fetchWithAuth(`/admin/rental/finance/${encodeURIComponent(paymentId)}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "rental", "finance"] }),
  });
};

export const usePayoutAdminRentalPayment = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reference, notes }: { paymentId: number; reference: string; notes: string }) =>
      fetchWithAuth(`/admin/rental/finance/${encodeURIComponent(paymentId)}/payout`, {
        method: "POST",
        body: JSON.stringify({ reference, notes }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "rental", "finance"] }),
  });
};

export const useUpdateAdminReservation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchWithAuth(`/admin/rental/reservations/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations", id] });
    },
  });
};

export const useReviewAdminDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status: "approved" | "rejected" | "resubmit_required" | "under_review"; adminNotes?: string } }) =>
      fetchWithAuth(`/admin/rental/documents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "reservation"] }),
  });
};

export const useAdminReservationAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, data }: { id: number; action: string; data?: any }) =>
      fetchWithAuth(`/admin/rental/reservations/${id}/${action}`, {
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations", id] });
    },
  });
};

export const useCreateAdminReservation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchWithAuth(`/admin/rental/reservations`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "reservations"] }),
  });
};

// ------------------------------------------------------------------
// Admin Maintenance
// ------------------------------------------------------------------

export const useAdminMaintenance = () => {
  return useQuery({
    queryKey: ["admin", "maintenance"],
    queryFn: () => fetchWithAuth(`/admin/rental/maintenance`),
  });
};

export const useCreateAdminMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchWithAuth(`/admin/rental/maintenance`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "maintenance"] });
    },
  });
};

export const useUpdateAdminMaintenance = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchWithAuth(`/admin/rental/maintenance/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "maintenance"] });
    },
  });
};

// ------------------------------------------------------------------
// Admin Addons (Operations endpoint version)
// ------------------------------------------------------------------

export const useAdminAddons = () => {
  return useQuery({
    queryKey: ["admin", "addons"],
    queryFn: () => fetchWithAuth(`/admin/rental/addons`),
  });
};

export const useCreateAdminAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchWithAuth(`/admin/rental/addons`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "addons"] });
      queryClient.invalidateQueries({ queryKey: getGetRentalAddonsQueryKey() });
    },
  });
};

export const useUpdateAdminAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchWithAuth(`/admin/rental/addons/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "addons"] });
      queryClient.invalidateQueries({ queryKey: getGetRentalAddonsQueryKey() });
    },
  });
};

export const useDeleteAdminAddon = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchWithAuth(`/admin/rental/addons/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "addons"] });
      queryClient.invalidateQueries({ queryKey: getGetRentalAddonsQueryKey() });
    },
  });
};

// ------------------------------------------------------------------
// Admin Pricing Rules
// ------------------------------------------------------------------

export const useAdminPricingRules = () => {
  return useQuery({
    queryKey: ["admin", "pricing-rules"],
    queryFn: () => fetchWithAuth(`/admin/rental/pricing-rules`),
  });
};

export const useCreateAdminPricingRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchWithAuth(`/admin/rental/pricing-rules`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing-rules"] });
    },
  });
};

export const useUpdateAdminPricingRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchWithAuth(`/admin/rental/pricing-rules/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing-rules"] });
    },
  });
};

export const useDeleteAdminPricingRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      fetchWithAuth(`/admin/rental/pricing-rules/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pricing-rules"] });
    },
  });
};

// ------------------------------------------------------------------
// Admin Settings
// ------------------------------------------------------------------

export const useAdminSettings = () => {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => fetchWithAuth(`/admin/rental/settings`),
  });
};

export const useUpdateAdminSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      fetchWithAuth(`/admin/rental/settings`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
  });
};

// ------------------------------------------------------------------
// Admin Audit & Dashboard
// ------------------------------------------------------------------

export const useAdminAudit = () => {
  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => fetchWithAuth(`/admin/rental/audit`),
  });
};

export const useAdminRentalDashboard = () => {
  return useQuery({
    queryKey: ["admin", "rental", "dashboard"],
    queryFn: () => fetchWithAuth(`/admin/rental/dashboard`),
  });
};

// ------------------------------------------------------------------
// Public / User Booking Endpoints
// ------------------------------------------------------------------

export type CustomerAccountPayload = {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  preferredLanguage?: "en" | "ja" | "zh-TW";
};

export const useCustomerAccount = () => useQuery({
  queryKey: ["rental", "customer-account"],
  queryFn: () => fetchWithAuth("/rental/account/me"),
  retry: false,
});

export const useCustomerLogin = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Pick<CustomerAccountPayload, "email" | "password">) => fetchWithAuth("/rental/account/login", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data) => queryClient.setQueryData(["rental", "customer-account"], data),
  });
};

export const useCustomerRegister = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerAccountPayload) => fetchWithAuth("/rental/account/register", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data) => queryClient.setQueryData(["rental", "customer-account"], data),
  });
};

export const useCustomerLogout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fetchWithAuth("/rental/account/logout", { method: "POST" }),
    onSuccess: () => queryClient.setQueryData(["rental", "customer-account"], null),
  });
};

export const useAdminCustomers = () => useQuery({
  queryKey: ["admin", "rental", "customers"],
  queryFn: () => fetchWithAuth("/admin/rental/customers"),
});

export const useUpdateAdminCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "active" | "suspended" }) => fetchWithAuth(`/admin/rental/customers/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "rental", "customers"] }),
  });
};

export const useMyBookings = (email?: string, bookingId?: string) => {
  return useQuery({
    queryKey: ["my-bookings", email, bookingId],
    queryFn: () => {
      const urlParams = new URLSearchParams();
      if (email) urlParams.append("email", email);
      if (bookingId) urlParams.append("bookingId", bookingId);
      const qs = urlParams.toString();
      return fetchWithAuth(`/rental/my-bookings${qs ? "?" + qs : ""}`);
    },
    enabled: !!email,
  });
};

export const useMyBookingDetail = (id: number, email?: string) => {
  return useQuery({
    queryKey: ["my-bookings", id],
    queryFn: () => fetchWithAuth(`/rental/my-bookings/${id}`),
    enabled: !!id,
  });
};

export const useBookingLookup = () => useMutation({
  mutationFn: ({ email, bookingId, accessCode }: { email: string; bookingId: string; accessCode: string }) =>
    fetchWithAuth(`/rental/my-bookings?${new URLSearchParams({ email, bookingId, accessCode }).toString()}`),
});

export const useRentalMarketplaceConfig = () => useQuery({
  queryKey: ["rental", "marketplace", "config"],
  queryFn: () => fetchWithAuth(`/rental/marketplace/config`) as Promise<{ enabled: boolean }>,
});

export const useSubmitBookingDocuments = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchWithAuth(`/rental/my-bookings/${id}/documents`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings", id] });
    },
  });
};

export const useUploadPrivateBookingDocument = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, driverId, docType, file }: {
      id: number;
      driverId?: number;
      docType: "drivers_license" | "passport" | "international_license";
      file: File;
    }) => {
      const uploadRequest = await fetchWithAuth(`/rental/my-bookings/${id}/documents/upload-request`, {
        method: "POST",
        body: JSON.stringify({ docType, contentType: file.type, ...(driverId ? { driverId } : {}) }),
      }) as { uploadPath: string; method: "PUT"; contentType: string };

      const response = await fetch(uploadRequest.uploadPath, {
        method: uploadRequest.method,
        headers: { "Content-Type": uploadRequest.contentType },
        body: file,
        credentials: "include",
      });
      if (!response.ok) {
        let message = "Document upload failed";
        try {
          const errorData = await response.json();
          message = errorData.error || errorData.message || message;
        } catch {
          // Keep the upload error message when the response has no JSON body.
        }
        throw new Error(message);
      }
      return null;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings", id] });
    },
  });
};

export const useCancelBookingRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetchWithAuth(`/rental/reservations/${id}/cancel-request`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings", id] });
    },
  });
};

export const useAcknowledgeTripCharges = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, charges }: { id: number; charges: Array<{ code: string; amount: number }> }) =>
      fetchWithAuth(`/rental/my-bookings/${id}/charges/acknowledge`, {
        method: "POST",
        body: JSON.stringify({ charges }),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["my-bookings", id] });
    },
  });
};

export type RentalExceptionScope = "customer" | "partner" | "admin";

export const useRentalExceptions = (reservationId: number, scope: RentalExceptionScope, enabled = true) => useQuery({
  queryKey: ["rental", "exceptions", scope, reservationId],
  queryFn: () => fetchWithAuth(`/rental/exceptions/reservations/${encodeURIComponent(reservationId)}`),
  enabled: enabled && Number.isInteger(reservationId) && reservationId > 0,
  refetchInterval: 30_000,
  refetchOnMount: "always",
});

export const useRentalExceptionAlternatives = (reservationId: number, scope: "customer" | "partner", enabled = true) => useQuery({
  queryKey: ["rental", "exceptions", scope, reservationId, "alternatives"],
  queryFn: () => fetchWithAuth(scope === "partner"
    ? `/partner/rental/exceptions/reservations/${encodeURIComponent(reservationId)}/alternatives`
    : `/rental/exceptions/reservations/${encodeURIComponent(reservationId)}/alternatives`),
  enabled: enabled && Number.isInteger(reservationId) && reservationId > 0,
  refetchInterval: 30_000,
  refetchOnMount: "always",
});

export const useRentalExceptionCancellationOffers = (reservationId: number, enabled = true) => useQuery({
  queryKey: ["rental", "exceptions", "customer", reservationId, "cancellation-offers"],
  queryFn: () => fetchWithAuth(`/rental/exceptions/reservations/${encodeURIComponent(reservationId)}/cancellation/offers`),
  enabled: enabled && Number.isInteger(reservationId) && reservationId > 0,
  refetchInterval: 30_000,
  refetchOnMount: "always",
});

export const usePartnerRentalExceptionExtensions = (reservationId: number, enabled = true) => useQuery({
  queryKey: ["rental", "exceptions", "partner", reservationId, "extensions"],
  queryFn: () => fetchWithAuth(`/partner/rental/exceptions/reservations/${encodeURIComponent(reservationId)}/extensions`),
  enabled: enabled && Number.isInteger(reservationId) && reservationId > 0,
  refetchInterval: 15_000,
  refetchOnMount: "always",
});

export const useRentalExceptionExtensionStatus = (reservationId: number, quoteId: number, enabled = true) => useQuery({
  queryKey: ["rental", "exceptions", "customer", reservationId, "extension-status", quoteId],
  queryFn: () => fetchWithAuth(`/rental/exceptions/reservations/${encodeURIComponent(reservationId)}/extension/status?quoteId=${encodeURIComponent(quoteId)}`),
  enabled: enabled && Number.isInteger(reservationId) && reservationId > 0 && Number.isInteger(quoteId) && quoteId > 0,
  refetchInterval: query => {
    const result = query.state.data as { approvalStatus?: string; expiresAt?: string } | undefined;
    if (result?.approvalStatus === "pending") return 5_000;
    if (result?.approvalStatus === "approved" && result.expiresAt) {
      const remainingMs = Date.parse(result.expiresAt) - Date.now();
      return remainingMs > 0 ? Math.min(15_000, remainingMs) : false;
    }
    return false;
  },
  refetchOnMount: "always",
});

export const useRentalExceptionAction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, scope, url, method = "POST", data }: {
      reservationId: number;
      scope: RentalExceptionScope;
      url: string;
      method?: "POST" | "PATCH";
      data: Record<string, unknown>;
    }) => {
      return fetchWithAuth(url, {
        method,
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, { reservationId, scope }) => {
      queryClient.invalidateQueries({ queryKey: ["rental", "exceptions", scope, reservationId] });
      queryClient.invalidateQueries({ queryKey: ["rental", "exceptions", scope, reservationId, "alternatives"] });
      queryClient.invalidateQueries({ queryKey: ["rental", "exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings", reservationId] });
      queryClient.invalidateQueries({ queryKey: ["partner", "rental", "reservations", reservationId, "trip"] });
      queryClient.invalidateQueries({ queryKey: ["partner", "rental", "reservations"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations", reservationId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "reservations"] });
    },
  });
};

export const useUploadRentalExceptionEvidence = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservationId, scope, file, evidenceKind, incidentId, claimId, claimItemId, inspectionId }: {
      reservationId: number;
      scope: RentalExceptionScope;
      file: File;
      evidenceKind: "incident" | "pickup" | "return" | "invoice" | "insurer" | "customer_response";
      incidentId?: number;
      claimId?: number;
      claimItemId?: number;
      inspectionId?: number;
    }) => {
      if (file.size > 10 * 1024 * 1024) throw new Error("Evidence file exceeds the 10 MB limit.");
      const upload = await fetchWithAuth(`/rental/exceptions/reservations/${encodeURIComponent(reservationId)}/evidence/upload-request`, {
        method: "POST",
        body: JSON.stringify({
          evidenceKind,
          contentType: file.type,
          ...(incidentId ? { incidentId } : {}),
          ...(claimId ? { claimId } : {}),
          ...(claimItemId ? { claimItemId } : {}),
          ...(inspectionId ? { inspectionId } : {}),
        }),
      }) as { uploadPath: string; method: "PUT"; contentType: string; maxBytes: number };
      if (file.size > upload.maxBytes) throw new Error(`Evidence file exceeds the ${Math.floor(upload.maxBytes / (1024 * 1024))} MB limit.`);
      const response = await fetch(`${BASE_URL}${upload.uploadPath}`, {
        method: upload.method,
        headers: { "Content-Type": upload.contentType },
        body: file,
        credentials: "include",
      });
      if (!response.ok) {
        let message = "Evidence upload failed";
        try {
          const errorData = await response.json();
          message = errorData.error || errorData.message || message;
        } catch {
          // Preserve generic upload failure when the server has no JSON response.
        }
        throw new Error(message);
      }
      return null;
    },
    onSuccess: (_, { reservationId, scope }) => {
      queryClient.invalidateQueries({ queryKey: ["rental", "exceptions", scope, reservationId] });
    },
  });
};
