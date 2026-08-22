import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdminMe, useAdminLogout, getAdminMeQueryKey } from "@workspace/api-client-react";
import {
  Car,
  LayoutDashboard,
  Calendar,
  LogOut,
  FileText,
  Search,
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
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  prefix: string;
  children: NavItem[];
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
];

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
    if (!isLoading && !admin?.authenticated) {
      setLocation("/admin/login");
    }
  }, [admin, isLoading, setLocation]);

  if (isLoading || !admin?.authenticated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const topNavItems: NavItem[] = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/fleet", label: "Fleet (Legacy)", icon: Car },
    { href: "/admin/lodging", label: "Lodging", icon: Building2 },
    { href: "/admin/bookings", label: "Bookings", icon: Calendar },
    { href: "/admin/content", label: "Page Content", icon: FileText },
    { href: "/admin/seo", label: "SEO", icon: Search },
  ];

  const rentalCarsSection: NavSection = {
    label: "Rental Cars",
    icon: Car,
    prefix: "/admin/rental-cars",
    children: rentalCarSubItems,
  };

  return (
    <div className="flex min-h-screen bg-muted/40 flex-col md:flex-row">
      <div className="md:hidden flex items-center justify-between p-4 bg-background border-b z-20">
        <span className="font-serif font-bold text-lg">CIAO Admin</span>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>
      
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-40 w-64 border-r bg-background flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 hidden md:flex items-center px-6 border-b shrink-0">
          <span className="font-serif font-bold text-xl">CIAO Admin</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {topNavItems.map(({ href, label, icon: Icon }) => {
            const active = location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={active ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2 h-10 md:h-9"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </Button>
              </Link>
            );
          })}

          <div className="pt-2">
            <Button
              variant={isRentalCarSection && !rentalCarsOpen ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-2 h-10 md:h-9",
                isRentalCarSection && "text-foreground font-medium",
              )}
              onClick={() => setRentalCarsOpen((o) => !o)}
            >
              <rentalCarsSection.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left truncate">{rentalCarsSection.label}</span>
              {rentalCarsOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </Button>

            {rentalCarsOpen && (
              <div className="ml-4 mt-1 space-y-0.5 border-l pl-3">
                {rentalCarsSection.children.map(({ href, label, icon: Icon }) => {
                  const active = href === "/admin/rental-cars"
                    ? location === href || location.startsWith(`${href}/new`) || location.match(/\/admin\/rental-cars\/\d+\/edit/)
                    : location.startsWith(href);
                  return (
                    <Link key={href} href={href}>
                      <Button
                         variant={active ? "secondary" : "ghost"}
                         size="sm"
                         className="w-full justify-start gap-2 h-9 md:h-8 text-xs md:text-sm"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                      </Button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
        <div className="p-4 border-t shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 h-10 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/") })}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto h-[calc(100vh-60px)] md:h-screen">
        {children}
      </main>
    </div>
  );
}
