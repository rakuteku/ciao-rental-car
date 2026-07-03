import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAdminMe, useAdminLogout, getAdminMeQueryKey } from "@workspace/api-client-react";
import { Car, LayoutDashboard, Calendar, LogOut, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: admin, isLoading } = useAdminMe({ query: { retry: false, queryKey: getAdminMeQueryKey() } });
  const logout = useAdminLogout();

  useEffect(() => {
    if (!isLoading && !admin?.authenticated) {
      setLocation("/admin/login");
    }
  }, [admin, isLoading, setLocation]);

  if (isLoading || !admin?.authenticated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/fleet", label: "Fleet Management", icon: Car },
    { href: "/admin/bookings", label: "Bookings", icon: Calendar },
    { href: "/admin/content", label: "Page Content", icon: FileText },
    { href: "/admin/seo", label: "SEO", icon: Search },
  ];

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="w-64 border-r bg-background flex flex-col">
        <div className="h-16 flex items-center px-6 border-b">
          <span className="font-serif font-bold text-xl">CIAO Admin</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
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
