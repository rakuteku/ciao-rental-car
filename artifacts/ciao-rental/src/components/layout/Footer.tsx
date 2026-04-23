export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="space-y-3 md:col-span-1">
            <h3 className="font-serif text-base font-bold tracking-widest uppercase">Ciao</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Premium car rental in Sapporo, Hokkaido. Experience Japanese hospitality and seamless travel.
            </p>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-[0.2em] uppercase">Locations</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Sapporo Station</li>
              <li>New Chitose Airport</li>
              <li>Sapporo City Center</li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-[0.2em] uppercase">Contact</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>support@ciaorental.jp</li>
              <li>+81 11-123-4567</li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-semibold tracking-[0.2em] uppercase">Legal</h4>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Terms of Service</li>
              <li>Privacy Policy</li>
              <li>Insurance Details</li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} CIAO Rental Car. All rights reserved.</p>
          <p>Sapporo, Hokkaido, Japan</p>
        </div>
      </div>
    </footer>
  );
}
