import type { ReactNode } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/lib/language";

export type PartnerIdentity = {
  staff?: Record<string, unknown>;
  operator?: Record<string, unknown>;
  requirements?: unknown;
};

export async function partnerRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: init.body instanceof FormData
      ? { ...init.headers }
      : { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function usePartnerText() {
  const { language } = useLanguage();
  return (en: string, ja: string) => language === "ja" ? ja : en;
}

export function PartnerShell({ children, eyebrow, title, description }: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="min-h-screen bg-[#f7f7f4] text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/rentalcar" className="font-serif text-xl font-bold tracking-wide">CIAO <span className="text-xs font-sans font-medium tracking-[.18em] text-slate-500">RENTAL PARTNER</span></Link>
          <span className="rounded-full border px-3 py-1 text-xs font-medium text-slate-600">{eyebrow}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em] text-amber-700">Partner portal</p>
          <h1 className="font-serif text-3xl font-bold sm:text-4xl">{title}</h1>
          {description && <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">{description}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return <section className="rounded-xl border bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4 sm:px-6">
      <h2 className="font-semibold">{title}</h2>{aside}
    </div>
    <div className="space-y-4 p-5 sm:p-6">{children}</div>
  </section>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5 text-sm font-medium">
    <span>{label}</span>
    {children}
    {hint && <span className="block text-xs font-normal text-slate-500">{hint}</span>}
  </label>;
}

export function inputClass() {
  return "h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15";
}

export function textareaClass() {
  return "min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15";
}

export function PrimaryButton({ children, disabled, type = "submit", onClick }: {
  children: ReactNode; disabled?: boolean; type?: "submit" | "button"; onClick?: () => void;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50">{children}</button>;
}

export function SecondaryButton({ children, disabled, onClick, type = "button" }: {
  children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit";
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{children}</button>;
}

export function StatusMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{children}</div>;
}

export function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function arrayFrom(value: unknown, keys: string[] = ["items", "vehicles", "blocks", "maintenance"]): any[] {
  if (Array.isArray(value)) return value;
  const result = record(value);
  for (const key of keys) if (Array.isArray(result[key])) return result[key];
  return [];
}