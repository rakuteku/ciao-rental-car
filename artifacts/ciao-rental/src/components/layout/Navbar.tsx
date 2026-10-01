import { useState } from "react";
import { Link } from "wouter";
import { useAdminMe, useAdminLogout, getAdminMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { localizedPath, useLanguage } from "@/lib/language";

const languageLabels = {
  en: { lodging: "Lodging", cars: "Rental cars", bookings: "My bookings", language: "Language", admin: "Admin", logout: "Log out" },
  ja: { lodging: "宿泊", cars: "レンタカー", bookings: "予約の確認", language: "言語", admin: "管理", logout: "ログアウト" },
  "zh-CN": { lodging: "住宿", cars: "租车", bookings: "我的预订", language: "语言", admin: "管理", logout: "退出" },
} as const;

export function Navbar() {
  const { data: admin } = useAdminMe({ query: { retry: false, queryKey: getAdminMeQueryKey() } });
  const logout = useAdminLogout();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const localizedHref = (path: string) => localizedPath(path, language);
  const labels = languageLabels[language];

  const toggleMenu = () => setIsMenuOpen((open) => !open);
  const closeMenu = () => setIsMenuOpen(false);
  const changeLanguage = (nextLanguage: typeof language) => {
    setLanguage(nextLanguage);
    closeMenu();
  };
  const languageOptions = (mobile = false) => (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-background/70 p-1" role="group" aria-label="Website language">
      {(["en", "ja", "zh-CN"] as const).map((item) => (
        <button
          key={item}
          type="button"
          data-testid={`${mobile ? "button-mobile-" : "button-"}language-${item}`}
          onClick={() => changeLanguage(item)}
          aria-pressed={language === item}
          className={`min-h-8 rounded-full px-3 text-[10px] font-semibold tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            language === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {item === "en" ? "EN" : item === "ja" ? "JP" : "中文"}
        </button>
      ))}
    </div>
  );
  const logoutFromAdmin = () => logout.mutate(undefined, { onSuccess: () => { window.location.href = "/"; } });

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="container flex h-[4.5rem] items-center justify-between gap-4">
        <Link href={localizedHref("/")} className="group relative z-50 flex shrink-0 items-center gap-3" onClick={closeMenu} aria-label="CIAO Sapporo home">
          <span className="font-serif text-[1.35rem] font-semibold tracking-[0.17em]">CIAO</span>
          <span className="hidden h-7 w-px bg-border sm:block" aria-hidden="true" />
          <span className="hidden text-[9px] font-medium uppercase leading-[1.5] tracking-[0.19em] text-muted-foreground sm:block">Sapporo<br />Hokkaido</span>
        </Link>

        <button
          type="button"
          className="relative z-50 inline-flex size-11 items-center justify-center rounded-full border border-border/70 text-foreground transition-colors hover:bg-muted md:hidden"
          onClick={toggleMenu}
          aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-primary-navigation"
          data-testid="button-toggle-mobile-menu"
        >
          {isMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          <Link href={localizedHref("/lodging")} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground">
            {labels.lodging}
          </Link>
          <Link href={localizedHref("/rentalcar")} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground">
            {labels.cars}
          </Link>
          <Link href={localizedHref("/rentalcar/my-bookings")} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground">
            {labels.bookings}
          </Link>
          {languageOptions()}
          {admin?.authenticated ? (
            <div className="flex items-center gap-4 border-l border-border/70 pl-6">
              <Link href="/admin/dashboard" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                {labels.admin}
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-full px-4 text-xs font-semibold"
                onClick={logoutFromAdmin}
                disabled={logout.isPending}
              >
                {logout.isPending ? "…" : labels.logout}
              </Button>
            </div>
          ) : (
            <Link href="/admin/login" className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground">
              {labels.admin}<ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </nav>

        <div
          id="mobile-primary-navigation"
          className={`fixed inset-x-0 top-[4.5rem] z-40 border-b border-border bg-background px-6 pb-8 pt-4 shadow-lg transition-[opacity,transform] duration-200 md:hidden ${
            isMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
          }`}
          aria-hidden={!isMenuOpen}
          inert={!isMenuOpen}
        >
          <nav className="mx-auto flex max-w-xl flex-col" aria-label="Mobile navigation">
            <div className="flex items-center justify-between border-b border-border/70 py-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{labels.language}</span>
              {languageOptions(true)}
            </div>
            <Link href={localizedHref("/lodging")} onClick={closeMenu} className="flex min-h-14 items-center justify-between border-b border-border/70 text-sm font-semibold">
              {labels.lodging}<ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
            <Link href={localizedHref("/rentalcar")} onClick={closeMenu} className="flex min-h-14 items-center justify-between border-b border-border/70 text-sm font-semibold">
              {labels.cars}<ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
            <Link href={localizedHref("/rentalcar/my-bookings")} onClick={closeMenu} className="flex min-h-14 items-center justify-between border-b border-border/70 text-sm font-semibold">
              {labels.bookings}<ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
              {admin?.authenticated ? (
                <>
                  <Link href="/admin/dashboard" onClick={closeMenu} className="flex min-h-14 items-center justify-between border-b border-border/70 text-sm font-semibold text-primary">
                    {labels.admin}<ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Button
                    variant="outline"
                    className="mt-5 h-12 w-full rounded-full font-semibold"
                    onClick={() => { closeMenu(); logoutFromAdmin(); }}
                    disabled={logout.isPending}
                  >
                    {logout.isPending ? "…" : labels.logout}
                  </Button>
                </>
              ) : (
                <Link href="/admin/login" onClick={closeMenu} className="flex min-h-14 items-center justify-between text-sm font-semibold text-muted-foreground">
                  {labels.admin}<ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              )}
          </nav>
        </div>
      </div>
    </header>
  );
}
