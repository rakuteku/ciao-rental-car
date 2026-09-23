import { Link } from "wouter";
import { Building2, CalendarClock, Car as CarIcon, MapPin, Mail, ChevronRight, Users, BedDouble } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetPageContent, useGetRooms } from "@workspace/api-client-react";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { localizeContent, useLanguage } from "@/lib/language";
import { localizedPath } from "@/lib/language";
import { CONTACT_MAILTO } from "@/lib/contact";

interface WhyItem {
  title: string;
  description: string;
}

interface HomeContent {
  hero: { title: string; subtitle: string; ctaLodging: string; ctaRentalCar: string };
  lodging: { title: string; description: string };
  monthlyStay: { title: string; description: string };
  rentalCarOverview: { title: string; description: string };
  access: { title: string; description: string; address: string; mapEmbedUrl: string };
  whyChooseUs: WhyItem[];
  contact: { title: string; description: string; ctaText: string };
  copy: Record<string, string>;
}

export function Home() {
  const { language } = useLanguage();
  const { data, isLoading } = useGetPageContent("home");
  const content = data ? localizeContent(data.content.en as unknown as HomeContent, data.content, language) : undefined;
  const { data: featuredRooms } = useGetRooms({ featured: true });
  useSeoMeta("home");

  if (isLoading || !content) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      {/* Hero */}
      <section className="relative w-full min-h-[92vh] flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/hero-sapporo.png"
            alt={content.copy.heroImageAlt}
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" />
        </div>
        <div className="relative z-10 w-full pb-20 pt-32">
          <div className="container space-y-8">
            <div className="max-w-2xl space-y-4">
              <p className="text-xs tracking-[0.3em] uppercase text-white/60 font-medium">
                {content.copy.heroEyebrow}
              </p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight text-white leading-[1.1]">
                {content.hero.title}
              </h1>
              <p className="text-base md:text-lg text-white/70 max-w-xl leading-relaxed">
                {content.hero.subtitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
               <Link href={localizedPath("/lodging", language)}>
                <Button size="lg" variant="secondary" className="gap-2">
                  <Building2 className="h-4 w-4" /> {content.hero.ctaLodging}
                </Button>
              </Link>
               <Link href={localizedPath("/rentalcar", language)}>
                <Button size="lg" className="gap-2">
                  <CarIcon className="h-4 w-4" /> {content.hero.ctaRentalCar}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Lodging */}
      <section id="lodging" className="py-24 border-b">
        <div className="container grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-5 w-5" />
              <p className="text-xs tracking-[0.25em] uppercase">{content.copy.lodgingEyebrow}</p>
            </div>
            <h2 className="text-3xl font-serif font-bold tracking-tight">{content.lodging.title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-lg">{content.lodging.description}</p>
          </div>
          <div className="aspect-[4/3] bg-muted rounded-sm overflow-hidden">
            <img
              src="/hero-sapporo.png"
              alt={content.copy.lodgingImageAlt}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
        {featuredRooms && featuredRooms.length > 0 && (
          <div className="container mt-16 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-serif font-semibold tracking-tight">{content.copy.featuredRooms}</h3>
               <Link href={localizedPath("/lodging", language)} className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                {content.copy.viewAllRooms} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredRooms.slice(0, 3).map((room) => (
                 <Link key={room.id} href={localizedPath(`/lodging/${room.slug}`, language)} className="group block">
                  <div className="aspect-[4/3] bg-muted rounded-sm overflow-hidden">
                    <img
                      src={room.coverImage || room.images?.[0]}
                      alt={room.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                  <div className="pt-3 space-y-1">
                    <div className="flex items-baseline justify-between">
                      <h4 className="font-serif font-semibold group-hover:text-muted-foreground transition-colors">{room.title}</h4>
                       <span className="text-sm font-medium tabular-nums">¥{room.startingPrice.toLocaleString()}<span className="text-muted-foreground text-xs">{content.copy.perNight}</span></span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {room.maxGuests}</span>
                      <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" /> {room.beds}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Monthly Stay */}
      <section className="py-24 border-b bg-muted/30">
        <div className="container grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="aspect-[4/3] bg-muted rounded-sm overflow-hidden md:order-1 order-2">
            <img
              src="/hero-sapporo.png"
               alt={content.copy.monthlyImageAlt}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="space-y-4 md:order-2 order-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-5 w-5" />
              <p className="text-xs tracking-[0.25em] uppercase">{content.copy.monthlyEyebrow}</p>
            </div>
            <h2 className="text-3xl font-serif font-bold tracking-tight">{content.monthlyStay.title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-lg">{content.monthlyStay.description}</p>
          </div>
        </div>
      </section>

      {/* Rental Car Overview */}
      <section className="py-24 border-b">
        <div className="container grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CarIcon className="h-5 w-5" />
              <p className="text-xs tracking-[0.25em] uppercase">{content.copy.rentalEyebrow}</p>
            </div>
            <h2 className="text-3xl font-serif font-bold tracking-tight">{content.rentalCarOverview.title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-lg">{content.rentalCarOverview.description}</p>
             <Link href={localizedPath("/rentalcar", language)}>
              <Button variant="outline" className="gap-1">
                {content.copy.exploreRentalCars} <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="aspect-[4/3] bg-muted rounded-sm overflow-hidden">
            <img
              src="/hero-sapporo.png"
              alt={content.copy.rentalImageAlt}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-muted/40 border-b">
        <div className="container space-y-10">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground">{content.copy.whyEyebrow}</p>
            <h2 className="text-3xl font-serif font-bold tracking-tight">{content.copy.whyTitle}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x border bg-background">
            {content.whyChooseUs.map((item) => (
              <div key={item.title} className="flex flex-col gap-3 p-8">
                <h3 className="font-semibold text-sm tracking-wide">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Location & Access */}
      <section className="py-24 border-b">
        <div className="container grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-5 w-5" />
              <p className="text-xs tracking-[0.25em] uppercase">{content.copy.accessEyebrow}</p>
            </div>
            <h2 className="text-3xl font-serif font-bold tracking-tight">{content.access.title}</h2>
            <p className="text-muted-foreground leading-relaxed max-w-lg">{content.access.description}</p>
            <p className="text-sm font-medium">{content.access.address}</p>
          </div>
          <div className="aspect-[4/3] md:aspect-auto bg-muted rounded-sm overflow-hidden border">
            <iframe
              title={content.copy.mapTitle}
              src={content.access.mapEmbedUrl}
              className="w-full h-full min-h-[280px] border-0"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-20">
        <div className="container text-center max-w-xl mx-auto space-y-4">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Mail className="h-5 w-5" />
            <p className="text-xs tracking-[0.25em] uppercase">{content.copy.contactEyebrow}</p>
          </div>
          <h2 className="text-3xl font-serif font-bold tracking-tight">{content.contact.title}</h2>
          <p className="text-muted-foreground leading-relaxed">{content.contact.description}</p>
           <a href={CONTACT_MAILTO}>
            <Button size="lg">{content.contact.ctaText}</Button>
          </a>
        </div>
      </section>
    </div>
  );
}
