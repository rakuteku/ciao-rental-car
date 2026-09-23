export const CONTACT_EMAIL = "info@ciao-sapporo.jp";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;
export const CONTACT_PHONE = (import.meta.env.VITE_CONTACT_PHONE as string | undefined)?.trim() ?? "";