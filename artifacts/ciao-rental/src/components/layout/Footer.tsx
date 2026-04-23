export function Footer() {
  return (
    <footer className="border-t bg-background py-12 md:py-16">
      <div className="container grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <h3 className="font-serif text-xl font-bold">CIAO</h3>
          <p className="text-sm text-muted-foreground">
            Premium car rental service in Sapporo, Hokkaido. Experience Japanese hospitality and seamless travel.
          </p>
        </div>
        <div className="space-y-3">
          <h4 className="font-medium">Locations</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Sapporo Station</li>
            <li>New Chitose Airport</li>
            <li>Sapporo City Center</li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="font-medium">Contact</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>support@ciaorental.jp</li>
            <li>+81 11-123-4567</li>
          </ul>
        </div>
        <div className="space-y-3">
          <h4 className="font-medium">Legal</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Terms of Service</li>
            <li>Privacy Policy</li>
            <li>Insurance Details</li>
          </ul>
        </div>
      </div>
      <div className="container mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} CIAO Rental Car. All rights reserved.</p>
      </div>
    </footer>
  );
}