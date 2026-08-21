import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    try {
      const errorData = await response.json();
      message = errorData.error || errorData.message || message;
    } catch {
      // Ignore
    }
    throw new Error(message);
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
