import { Link } from "wouter";
import { useAdminMe, useAdminLogout, getAdminMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const { data: admin } = useAdminMe({ query: { retry: false, queryKey: getAdminMeQueryKey() } });
  const logout = useAdminLogout();

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-border/60">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="text-lg font-bold font-serif tracking-widest uppercase">Ciao</span>
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground hidden sm:inline-block pt-0.5">Sapporo · Hokkaido</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/lodging" className="text-xs tracking-[0.15em] uppercase font-medium text-muted-foreground hover:text-foreground transition-colors">
            Lodging
          </Link>
          <Link href="/rentalcar" className="text-xs tracking-[0.15em] uppercase font-medium text-muted-foreground hover:text-foreground transition-colors">
            Rental Car
          </Link>
          {admin?.authenticated ? (
            <>
              <Link href="/admin/dashboard" className="text-xs tracking-[0.15em] uppercase font-medium text-foreground">
                Admin
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8"
                onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.href = "/" })}
              >
                Logout
              </Button>
            </>
          ) : (
            <Link href="/admin/login" className="text-xs tracking-[0.15em] uppercase font-medium text-muted-foreground hover:text-foreground transition-colors">
              Admin
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
