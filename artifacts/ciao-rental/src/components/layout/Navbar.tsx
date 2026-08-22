import { useState } from "react";
import { Link } from "wouter";
import { useAdminMe, useAdminLogout, getAdminMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const { data: admin } = useAdminMe({ query: { retry: false, queryKey: getAdminMeQueryKey() } });
  const logout = useAdminLogout();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-b border-border/60">
      <div className="container flex h-14 md:h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 z-50 relative" onClick={closeMenu}>
          <span className="text-lg md:text-xl font-bold font-serif tracking-widest uppercase">Ciao</span>
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground hidden sm:inline-block pt-0.5">Sapporo · Hokkaido</span>
        </Link>

        {/* Mobile Menu Toggle */}
        <button 
          className="md:hidden flex items-center justify-center p-2 -mr-2 z-50 relative text-foreground"
          onClick={toggleMenu}
          aria-label="Toggle Menu"
        >
          {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/lodging" className="text-xs tracking-[0.15em] uppercase font-bold text-muted-foreground hover:text-foreground transition-colors py-2">
            Lodging
          </Link>
          <Link href="/rentalcar" className="text-xs tracking-[0.15em] uppercase font-bold text-muted-foreground hover:text-foreground transition-colors py-2">
            Rental Car
          </Link>
          {admin?.authenticated ? (
            <div className="flex items-center gap-4 ml-2 border-l pl-6">
              <Link href="/admin/dashboard" className="text-xs tracking-[0.15em] uppercase font-bold text-primary">
                Admin
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-8 font-bold tracking-wide"
                onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.href = "/" })}
              >
                Logout
              </Button>
            </div>
          ) : (
            <Link href="/admin/login" className="text-xs tracking-[0.15em] uppercase font-bold text-muted-foreground hover:text-foreground transition-colors py-2">
              Admin
            </Link>
          )}
        </nav>

        {/* Mobile Nav Overlay */}
        {isMenuOpen && (
          <div className="fixed inset-0 top-[56px] z-40 bg-background md:hidden flex flex-col px-4 py-6 border-t animate-in slide-in-from-top-2">
            <nav className="flex flex-col gap-4">
              <Link href="/lodging" onClick={closeMenu} className="text-sm tracking-[0.15em] uppercase font-bold text-foreground border-b pb-4">
                Lodging
              </Link>
              <Link href="/rentalcar" onClick={closeMenu} className="text-sm tracking-[0.15em] uppercase font-bold text-foreground border-b pb-4">
                Rental Car
              </Link>
              <Link href="/rentalcar/my-bookings" onClick={closeMenu} className="text-sm tracking-[0.15em] uppercase font-bold text-foreground border-b pb-4">
                My Bookings
              </Link>
              {admin?.authenticated ? (
                <>
                  <Link href="/admin/dashboard" onClick={closeMenu} className="text-sm tracking-[0.15em] uppercase font-bold text-primary border-b pb-4">
                    Admin Dashboard
                  </Link>
                  <Button
                    variant="outline"
                    className="mt-4 w-full h-12 font-bold tracking-wide"
                    onClick={() => { closeMenu(); logout.mutate(undefined, { onSuccess: () => window.location.href = "/" }); }}
                  >
                    Logout
                  </Button>
                </>
              ) : (
                <Link href="/admin/login" onClick={closeMenu} className="text-sm tracking-[0.15em] uppercase font-bold text-muted-foreground pt-4">
                  Admin Login
                </Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
