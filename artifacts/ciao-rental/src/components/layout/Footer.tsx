import { CONTACT_EMAIL, CONTACT_MAILTO, CONTACT_PHONE } from "@/lib/contact";
import { Link } from "wouter";
import { localizedPath, useLanguage } from "@/lib/language";

export function Footer() {
  const { language } = useLanguage();
  const content = {
    en: { location: "Find your way", locationList: ["Sapporo Station", "New Chitose Airport", "Sapporo City Center"], contact: "Contact", explore: "Explore", lodging: "Lodging", cars: "Rental cars", bookings: "My bookings", legal: "Information", terms: "Terms of Service", privacy: "Privacy Policy", insurance: "Insurance Details" },
    ja: { location: "アクセス", locationList: ["札幌駅", "新千歳空港", "札幌市中心部"], contact: "お問い合わせ", explore: "サービス", lodging: "宿泊", cars: "レンタカー", bookings: "予約の確認", legal: "ご案内", terms: "利用規約", privacy: "プライバシーポリシー", insurance: "保険について" },
    "zh-TW": { location: "交通指南", locationList: ["札幌站", "新千歲機場", "札幌市中心"], contact: "聯絡方式", explore: "瀏覽服務", lodging: "住宿", cars: "租車", bookings: "我的預訂", legal: "資訊", terms: "服務條款", privacy: "隱私權政策", insurance: "保險詳情" },
  }[language];

  return (
    <footer className="border-t border-border/70 bg-muted/35">
      <div className="container pb-8 pt-14 md:pb-10 md:pt-16">
        <div className="grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-12">
          <div className="space-y-5 md:col-span-4">
            <Link href={localizedPath("/", language)} className="inline-flex items-center gap-3" aria-label="CIAO Sapporo home">
              <span className="font-serif text-xl font-semibold tracking-[0.18em]">CIAO</span>
              <span className="h-6 w-px bg-border" aria-hidden="true" />
              <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Sapporo · Hokkaido</span>
            </Link>
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">
              Premium car rental in Sapporo, Hokkaido. Experience Japanese hospitality and seamless travel.
            </p>
          </div>
          <div className="space-y-4 md:col-span-2 md:col-start-6">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{content.location}</h4>
            <ul className="space-y-2.5 text-sm text-foreground/80">
              {content.locationList.map((location) => <li key={location}>{location}</li>)}
            </ul>
          </div>
          <div className="space-y-4 md:col-span-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{content.contact}</h4>
            <ul className="space-y-2.5 text-sm">
              <li><a data-testid="link-footer-email" className="break-all text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline" href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a></li>
              {CONTACT_PHONE && <li><a data-testid="link-footer-phone" className="text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline" href={`tel:${CONTACT_PHONE.replace(/[^\d+]/g, "")}`}>{CONTACT_PHONE}</a></li>}
            </ul>
          </div>
          <div className="space-y-4 md:col-span-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{content.explore}</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link className="text-foreground/80 transition-colors hover:text-foreground" href={localizedPath("/lodging", language)}>{content.lodging}</Link></li>
              <li><Link className="text-foreground/80 transition-colors hover:text-foreground" href={localizedPath("/rentalcar", language)}>{content.cars}</Link></li>
              <li><Link className="text-foreground/80 transition-colors hover:text-foreground" href={localizedPath("/rentalcar/my-bookings", language)}>{content.bookings}</Link></li>
            </ul>
          </div>
          <div className="space-y-4 md:col-span-2">
            <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{content.legal}</h4>
            <ul className="space-y-2.5 text-sm text-foreground/80">
              <li>{content.terms}</li>
              <li>{content.privacy}</li>
              <li>{content.insurance}</li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border/70 pt-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} CIAO Rental Car. All rights reserved.</p>
          <p>Sapporo, Hokkaido, Japan</p>
        </div>
      </div>
    </footer>
  );
}
