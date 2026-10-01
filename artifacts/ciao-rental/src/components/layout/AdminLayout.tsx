import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdminMe, useAdminLogout, getAdminMeQueryKey } from "@workspace/api-client-react";
import {
  Car,
  LayoutDashboard,
  Calendar,
  LogOut,
  FileText,
  Building2,
  ChevronDown,
  ChevronRight,
  CalendarRange,
  ClipboardList,
  Wrench,
  DollarSign,
  Settings,
  Package,
  Activity,
  BarChart2,
  Menu,
  X,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const rentalCarSubItems: NavItem[] = [
  { href: "/admin/rental-cars/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/admin/rental-cars", label: "Cars Fleet", icon: Car },
  { href: "/admin/rental-cars/availability", label: "Availability", icon: CalendarRange },
  { href: "/admin/rental-cars/reservations", label: "Reservations", icon: ClipboardList },
  { href: "/admin/rental-cars/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/admin/rental-cars/addons", label: "Add-ons", icon: Package },
  { href: "/admin/rental-cars/pricing", label: "Pricing Rules", icon: DollarSign },
  { href: "/admin/rental-cars/settings", label: "Settings", icon: Settings },
  { href: "/admin/rental-cars/audit", label: "Audit Logs", icon: Activity },
  { href: "/admin/rental-cars/partners", label: "Rental Partners", icon: UserCheck },
];

function AdminNavLink({
  href,
  label,
  icon: Icon,
  active,
  nested = false,
  onNavigate,
}: NavItem & { active: boolean; nested?: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn("admin-nav-link", nested && "admin-nav-link--nested")}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: admin, isLoading } = useAdminMe({ query: { retry: false, queryKey: getAdminMeQueryKey() } });
  const logout = useAdminLogout();
  const isRentalCarSection = location.startsWith("/admin/rental-cars");
  const [rentalCarsOpen, setRentalCarsOpen] = useState(isRentalCarSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isRentalCarSection) setRentalCarsOpen(true);
  }, [isRentalCarSection]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isLoading && !admin?.authenticated) setLocation("/admin/login");
  }, [admin, isLoading, setLocation]);

  if (isLoading || !admin?.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground" role="status">
        Checking your admin session…
      </div>
    );
  }

  const closeMobileNav = () => setMobileMenuOpen(false);
  const topNavItems: NavItem[] = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/fleet", label: "Fleet (Legacy)", icon: Car },
    { href: "/admin/lodging", label: "Lodging", icon: Building2 },
    { href: "/admin/bookings", label: "Bookings", icon: Calendar },
    { href: "/admin/content", label: "Page Content", icon: FileText },
  ];

  return (
    <div className="admin-shell flex min-h-screen flex-col md:flex-row">
      <div className="admin-mobilebar relative z-20 flex h-14 shrink-0 items-center justify-between border-b px-4 md:hidden">
        <Link href="/admin/dashboard" className="admin-sidebar-brand inline-flex items-center gap-2 text-sm font-bold no-underline">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-xs font-bold tracking-normal">C</span>
          <span>CIAO <span className="ml-1 text-[10px] font-medium text-white/65">OPERATIONS</span></span>
        </Link>
        <button
          type="button"
          data-testid="button-admin-menu"
          aria-label={mobileMenuOpen ? "Close admin navigation" : "Open admin navigation"}
          aria-expanded={mobileMenuOpen}
          aria-controls="admin-navigation"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Menu aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close admin navigation"
          className="fixed inset-0 z-30 bg-slate-950/55 md:hidden"
          onClick={closeMobileNav}
        />
      )}

      <aside
        id="admin-navigation"
        aria-label="Admin navigation"
        className={cn(
          "admin-sidebar fixed inset-y-0 left-0 z-40 flex w-72 max-w-[88vw] flex-col border-r transition-transform duration-200 ease-in-out md:static md:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="admin-sidebar-brand hidden h-16 shrink-0 items-center gap-3 border-b border-white/10 px-6 md:flex">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-sm font-bold">C</span>
          <span className="leading-tight">
            <span className="block text-base font-bold">CIAO</span>
            <span className="block text-[10px] font-medium text-white/60">OPERATIONS</span>
          </span>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label="Admin sections">
          <section aria-label="Workspace">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase text-white/55">Workspace</p>
            <div className="space-y-1">
              {topNavItems.map(({ href, label, icon }) => (
                <AdminNavLink
                  key={href}
                  href={href}
                  label={label}
                  icon={icon}
                  active={href === "/admin/dashboard" ? location === href : location.startsWith(href)}
                  onNavigate={closeMobileNav}
                />
              ))}
            </div>
          </section>

          <section aria-label="Rental operations">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase text-white/55">Rental operations</p>
            <button
              type="button"
              className={cn(
                "admin-nav-link w-full border-0 bg-transparent text-left",
                isRentalCarSection && "text-white",
              )}
              aria-expanded={rentalCarsOpen}
              aria-controls="admin-rental-nav"
              onClick={() => setRentalCarsOpen((open) => !open)}
            >
              <Car aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Rental Cars</span>
              {rentalCarsOpen
                ? <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
                : <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />}
            </button>

            {rentalCarsOpen && (
              <div id="admin-rental-nav" className="ml-3 mt-1 space-y-1 border-l border-white/15 pl-2">
                {rentalCarSubItems.map(({ href, label, icon }) => {
                  const active = href === "/admin/rental-cars"
                    ? location === href || location.startsWith(`${href}/new`) || Boolean(location.match(/\/admin\/rental-cars\/\d+\/edit/))
                    : location.startsWith(href);
                  return (
                    <AdminNavLink
                      key={href}
                      href={href}
                      label={label}
                      icon={icon}
                      active={active}
                      nested
                      onNavigate={closeMobileNav}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <button
            type="button"
            data-testid="button-admin-logout"
            className="admin-nav-link w-full border-0 bg-transparent text-left text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-60"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/") })}
          >
            <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{logout.isPending ? "Logging out…" : "Log out"}</span>
          </button>
        </div>
      </aside>

      <main className="admin-content min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 overflow-auto md:min-h-screen">
        {children}
      </main>
    </div>
  );
}