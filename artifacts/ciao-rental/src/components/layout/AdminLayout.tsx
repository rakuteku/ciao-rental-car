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
  BarChart2
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

  useEffect(() => {
    if (isRentalCarSection) setRentalCarsOpen(true);
  }, [isRentalCarSection]);

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
    <div className="flex min-h-screen bg-muted/40">
      <aside className="w-64 border-r bg-background flex flex-col">
        <div className="h-16 flex items-center px-6 border-b">
          <span className="font-serif font-bold text-xl">CIAO Admin</span>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {topNavItems.map(({ href, label, icon: Icon }) => {
            const active = location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <Button
                  variant={active ? "secondary" : "ghost"}
                  className="w-full justify-start gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </Link>
            );
          })}

          <div>
            <Button
              variant={isRentalCarSection && !rentalCarsOpen ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-2",
                isRentalCarSection && "text-foreground font-medium",
              )}
              onClick={() => setRentalCarsOpen((o) => !o)}
            >
              <rentalCarsSection.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{rentalCarsSection.label}</span>
              {rentalCarsOpen ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
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
                        className="w-full justify-start gap-2 h-8 text-xs"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </Button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation("/") })}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
