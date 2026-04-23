import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAdminMe, useAdminLogout } from "@workspace/api-client-react";
import { Car, LayoutDashboard, Calendar, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data: admin, isLoading } = useAdminMe({ query: { retry: false } });
  const logout = useAdminLogout();

  useEffect(() => {
    if (!isLoading && !admin?.authenticated) {
      setLocation("/admin/login");
    }
  }, [admin, isLoading, setLocation]);

  if (isLoading || !admin?.authenticated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="w-64 border-r bg-background flex flex-col">
        <div className="h-16 flex items-center px-6 border-b">
          <span className="font-serif font-bold text-xl">CIAO Admin</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link href="/admin/dashboard">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href="/admin/cars">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Car className="h-4 w-4" />
              Fleet Management
            </Button>
          </Link>
          <Link href="/admin/bookings">
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Calendar className="h-4 w-4" />
              Bookings
            </Button>
          </Link>
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