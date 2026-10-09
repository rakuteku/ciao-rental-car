import { Link } from "wouter";
import { Building2, CalendarClock, Car as CarIcon, MapPin, Mail, ChevronRight, Users, BedDouble, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetPageContent, useGetRooms } from "@workspace/api-client-react";
import { useSeoMeta } from "@/hooks/use-seo-meta";
import { localizeContent, localizedPath, useLanguage } from "@/lib/language";
import { CONTACT_MAILTO } from "@/lib/contact";
import { HomeSearchPanel } from "@/components/home/HomeSearchPanel";

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

function HomeSkeleton() {
  return (
    <div className="min-h-[100dvh] animate-pulse" aria-label="Loading home page">
      <div className="h-[68vh] min-h-[520px] bg-muted" />
      <div className="container space-y-5 py-20">
        <div className="h-3 w-28 rounded bg-muted" />
        <div className="h-9 w-2/3 rounded bg-muted" />
        <div className="h-20 max-w-xl rounded bg-muted" />
      </div>
      <div className="container grid gap-6 pb-20 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="aspect-[4/3] rounded bg-muted" />)}
      </div>
    </div>
  );
}

export function Home() {
  const { language } = useLanguage();
  const interfaceCopy = {
    en: { retry: "Try again", pageError: "We couldn’t load this page just now.", errorHint: "Please try again in a moment.", roomsError: "Featured rooms are temporarily unavailable.", roomsEmpty: "There are no featured rooms at the moment." },
    ja: { retry: "もう一度試す", pageError: "ページを読み込めませんでした。", errorHint: "少し時間をおいて、もう一度お試しください。", roomsError: "おすすめのお部屋を一時的に表示できません。", roomsEmpty: "現在、おすすめのお部屋はありません。" },
    "zh-TW": { retry: "重試", pageError: "暫時無法載入此頁面。", errorHint: "請稍後再試。", roomsError: "暫時無法顯示精選客房。", roomsEmpty: "目前沒有精選客房。" },
  }[language];
  const { data, isLoading, isError, refetch } = useGetPageContent("home");
  const content = data ? localizeContent(data.content.en as unknown as HomeContent, data.content, language) : undefined;
  const { data: featuredRooms, isLoading: roomsLoading, isError: roomsError, refetch: refetchRooms } = useGetRooms({ featured: true });
  useSeoMeta("home");

  if (isLoading) return <HomeSkeleton />;

  if (isError || !content) {
    return (
      <section className="container flex min-h-[68vh] flex-col items-center justify-center py-20 text-center">
        <span className="mb-5 grid size-14 place-items-center rounded-full bg-muted text-muted-foreground"><Building2 className="size-6" /></span>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">CIAO Sapporo</p>
        <h1 className="mb-3 font-serif text-3xl font-medium">{interfaceCopy.pageError}</h1>
        <p className="mb-7 max-w-md text-sm leading-6 text-muted-foreground">{interfaceCopy.errorHint}</p>
        <Button variant="outline" className="rounded-full px-6" onClick={() => void refetch()}>{interfaceCopy.retry}</Button>
      </section>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col pb-16 md:pb-0">
      <section aria-labelledby="home-hero-title" className="relative isolate flex min-h-[720px] items-center overflow-hidden sm:min-h-[760px] lg:min-h-[calc(100svh-8rem)]">
        <img
          src="/hero-sapporo.png"
          alt={content.copy.heroImageAlt}
          className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-foreground/65" />
        <div className="container w-full py-12 sm:py-16">
          <div className="mx-auto max-w-5xl">
            <p className="eyebrow mb-5 flex items-center justify-center gap-3 text-center text-white/80">
              <span className="h-px w-9 bg-white/60" aria-hidden="true" />
              {content.copy.heroEyebrow}
            </p>
            <h1 id="home-hero-title" className="mx-auto max-w-4xl text-center font-serif text-4xl font-semibold leading-[1.06] text-white sm:text-5xl lg:text-6xl">
              {content.hero.title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-7 text-white/85 sm:text-base sm:leading-8">{content.hero.subtitle}</p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-12 rounded-full px-6">
                <Link href={localizedPath("/lodging", language)} data-testid="link-hero-lodging">
                  <Building2 className="mr-2 size-4" aria-hidden="true" />{content.hero.ctaLodging}
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="min-h-12 rounded-full border border-white/35 bg-background/10 px-6 text-white backdrop-blur-sm hover:bg-background/20">
                <Link href={localizedPath("/rentalcar", language)} data-testid="link-hero-rental-car">
                  <CarIcon className="mr-2 size-4" aria-hidden="true" />{content.hero.ctaRentalCar}
                </Link>
              </Button>
            </div>
            <div className="mt-7">
              <HomeSearchPanel language={language} />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-3 text-[10px] font-medium uppercase text-white/75">
            <span className="h-px w-8 bg-white/45" aria-hidden="true" />
            Sapporo · Hokkaido · Japan
          </div>
        </div>
      </section>

      <section id="lodging" className="border-b border-border/70 py-20 sm:py-28 lg:py-32">
        <div className="container">
          <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-20">
            <div className="space-y-6 lg:py-10">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Building2 className="size-4" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{content.copy.lodgingEyebrow}</p>
              </div>
              <h2 className="max-w-xl font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">{content.lodging.title}</h2>
              <p className="max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">{content.lodging.description}</p>
              <Link href={localizedPath("/lodging", language)} className="group inline-flex min-h-11 items-center gap-3 border-b border-foreground/30 pb-1 text-xs font-semibold uppercase tracking-[0.13em] transition-colors hover:border-primary hover:text-primary" data-testid="link-lodging-explore">
                {content.copy.viewAllRooms}<ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="relative">
              <div className="aspect-[5/4] overflow-hidden rounded-sm bg-muted sm:aspect-[1.25/1]">
                <img src="/hero-sapporo.png" alt={content.copy.lodgingImageAlt} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="absolute -bottom-5 left-4 flex items-center gap-2 bg-background px-4 py-3 text-[9px] font-semibold uppercase tracking-[0.16em] shadow-sm sm:-left-5 sm:px-5">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" /> Sapporo, Hokkaido
              </div>
            </div>
          </div>

          {(roomsLoading || roomsError || featuredRooms !== undefined) && (
            <div className="mt-20 sm:mt-28">
              <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-4">
                <div>
                  <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{content.copy.lodgingEyebrow}</p>
                  <h3 className="font-serif text-2xl font-medium sm:text-3xl">{content.copy.featuredRooms}</h3>
                </div>
                <Link href={localizedPath("/lodging", language)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground" data-testid="link-view-all-rooms">
                  {content.copy.viewAllRooms}<ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
              {roomsLoading ? (
                <div className="grid gap-5 md:grid-cols-3">
                  {[0, 1, 2].map((item) => <div key={item} className="animate-pulse"><div className="aspect-[4/3] rounded-sm bg-muted" /><div className="mt-4 h-4 w-2/3 rounded bg-muted" /><div className="mt-3 h-3 w-1/3 rounded bg-muted" /></div>)}
                </div>
              ) : roomsError ? (
                <div className="flex flex-col items-start justify-between gap-4 rounded-sm border border-border bg-muted/40 p-6 sm:flex-row sm:items-center">
                  <p className="text-sm text-muted-foreground">{interfaceCopy.roomsError}</p>
                  <Button variant="outline" size="sm" className="rounded-full" onClick={() => void refetchRooms()}>{interfaceCopy.retry}</Button>
                </div>
              ) : featuredRooms?.length === 0 ? (
                <div className="flex flex-col items-start justify-between gap-4 rounded-sm border border-border bg-muted/40 p-6 sm:flex-row sm:items-center">
                  <p className="text-sm text-muted-foreground">{interfaceCopy.roomsEmpty}</p>
                  <Link href={localizedPath("/lodging", language)} className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-foreground underline-offset-4 hover:underline">
                    {content.copy.viewAllRooms}<ChevronRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <div className="grid gap-x-5 gap-y-9 md:grid-cols-3">
                  {featuredRooms?.slice(0, 3).map((room, index) => (
                    <Link key={room.id} href={localizedPath(`/lodging/${room.slug}`, language)} className="group block" data-testid={`card-featured-room-${room.id}`}>
                      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-muted">
                        <img src={room.coverImage || room.images?.[0]} alt={room.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" loading="lazy" />
                        <span className="absolute left-3 top-3 bg-background/90 px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] backdrop-blur">{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <div className="flex items-start justify-between gap-3 pt-4">
                        <div>
                          <h4 className="font-serif text-xl font-medium transition-colors group-hover:text-primary">{room.title}</h4>
                          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" aria-hidden="true" />{room.maxGuests}</span>
                            <span className="inline-flex items-center gap-1.5"><BedDouble className="size-3.5" aria-hidden="true" />{room.beds}</span>
                          </div>
                        </div>
                        <p className="shrink-0 pt-1 text-right text-sm font-semibold tabular-nums">¥{room.startingPrice.toLocaleString()}<span className="ml-1 text-[10px] font-normal text-muted-foreground">{content.copy.perNight}</span></p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="border-b border-border/70 bg-muted/40 py-20 sm:py-28">
        <div className="container grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-20">
          <div className="order-2 overflow-hidden rounded-sm bg-muted lg:order-1">
            <div className="aspect-[5/4] sm:aspect-[1.2/1]">
              <img src="/hero-sapporo.png" alt={content.copy.monthlyImageAlt} className="h-full w-full object-cover" loading="lazy" />
            </div>
          </div>
          <div className="order-1 space-y-6 lg:order-2 lg:pl-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <CalendarClock className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{content.copy.monthlyEyebrow}</p>
            </div>
            <h2 className="max-w-lg font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">{content.monthlyStay.title}</h2>
            <p className="max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">{content.monthlyStay.description}</p>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70 py-20 sm:py-28 lg:py-32">
        <div className="container grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <CarIcon className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{content.copy.rentalEyebrow}</p>
            </div>
            <h2 className="max-w-xl font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">{content.rentalCarOverview.title}</h2>
            <p className="max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">{content.rentalCarOverview.description}</p>
            <Button asChild variant="outline" className="min-h-11 rounded-full px-5">
              <Link href={localizedPath("/rentalcar", language)} data-testid="link-explore-rental-cars">
                {content.copy.exploreRentalCars}<ChevronRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="relative overflow-hidden rounded-sm bg-muted">
            <div className="aspect-[5/4] sm:aspect-[1.25/1]">
              <img src="/hero-sapporo.png" alt={content.copy.rentalImageAlt} className="h-full w-full object-cover" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70 bg-muted/35 py-20 sm:py-28">
        <div className="container">
          <div className="mb-10 max-w-2xl">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{content.copy.whyEyebrow}</p>
            <h2 className="font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">{content.copy.whyTitle}</h2>
          </div>
          <div className="grid border-y border-border/80 sm:grid-cols-2 lg:grid-cols-4">
            {content.whyChooseUs.map((item, index) => (
              <article key={item.title} className="border-b border-border/70 py-7 sm:px-6 sm:py-8 lg:border-b-0 lg:border-r lg:first:pl-0 lg:last:border-r-0">
                <span className="mb-5 block font-serif text-sm text-muted-foreground">0{index + 1}</span>
                <h3 className="mb-3 text-sm font-semibold tracking-wide">{item.title}</h3>
                <p className="text-xs leading-6 text-muted-foreground">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/70 py-20 sm:py-28">
        <div className="container grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div className="space-y-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{content.copy.accessEyebrow}</p>
            </div>
            <h2 className="max-w-lg font-serif text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">{content.access.title}</h2>
            <p className="max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">{content.access.description}</p>
            <p className="flex items-start gap-2 text-sm font-medium leading-6"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{content.access.address}</p>
          </div>
          <div className="min-h-[320px] overflow-hidden rounded-sm border border-border bg-muted sm:min-h-[400px]">
            <iframe
              title={content.copy.mapTitle}
              src={content.access.mapEmbedUrl}
              className="h-full min-h-[320px] w-full border-0 sm:min-h-[400px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="container">
          <div className="mx-auto max-w-3xl border-y border-border/80 py-12 text-center sm:py-16">
            <div className="mb-6 flex items-center justify-center gap-3 text-muted-foreground">
              <Mail className="size-4" aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">{content.copy.contactEyebrow}</p>
            </div>
            <h2 className="font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">{content.contact.title}</h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">{content.contact.description}</p>
            <Button asChild size="lg" className="mt-8 min-h-12 rounded-full px-7">
              <a href={CONTACT_MAILTO} data-testid="link-home-contact">{content.contact.ctaText}<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
