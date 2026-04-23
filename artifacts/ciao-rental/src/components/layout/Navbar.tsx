import { Link } from "wouter";
import { useAdminMe, useAdminLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { data: admin } = useAdminMe({ query: { retry: false } });
  const logout = useAdminLogout();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold font-serif tracking-tight">CIAO</span>
          <span className="text-sm font-medium text-muted-foreground hidden sm:inline-block">Rental Car</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/cars" className="text-sm font-medium hover:text-primary transition-colors">
            Our Fleet
          </Link>
          {admin?.authenticated ? (
            <>
              <Link href="/admin/dashboard" className="text-sm font-medium text-primary">
                Admin Panel
              </Link>
              <Button variant="ghost" size="sm" onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.href = "/" })}>
                Logout
              </Button>
            </>
          ) : (
            <Link href="/admin/login" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              Admin Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}