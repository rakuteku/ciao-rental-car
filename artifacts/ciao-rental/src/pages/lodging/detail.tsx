import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  Users,
  BedDouble,
  Ruler,
  Building2,
  Clock,
  CheckCircle2,
  ScrollText,
} from "lucide-react";
import { useGetRoom, getGetRoomQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useInlineSeoMeta } from "@/hooks/use-seo-meta";

export function LodgingDetailPage() {
  const params = useParams();
  const slug = params.slug || "";

  const { data: room, isLoading } = useGetRoom(slug, {
    query: { enabled: !!slug, queryKey: getGetRoomQueryKey(slug) },
  });

  const [activeImage, setActiveImage] = useState(0);

  useInlineSeoMeta(
    room
      ? {
          metaTitle: room.metaTitle,
          metaDescription: room.metaDescription,
          ogTitle: room.ogTitle,
          ogDescription: room.ogDescription,
          ogImage: room.ogImage,
        }
      : undefined,
  );

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-medium">Room not found</p>
        <Link href="/lodging">
          <Button variant="outline">Back to rooms</Button>
        </Link>
      </div>
    );
  }

  const images = room.images?.length ? room.images : room.coverImage ? [room.coverImage] : [];

  return (
    <div className="min-h-[100dvh] bg-muted/20 py-12">
      <div className="container max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="rounded-xl overflow-hidden bg-background border shadow-sm">
              <div className="aspect-[16/9] relative bg-muted">
                {images[activeImage] && (
                  <img
                    src={images[activeImage]}
                    alt={room.title}
                    className="object-cover w-full h-full"
                  />
                )}
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {images.map((img, i) => (
                    <button
                      key={img + i}
                      onClick={() => setActiveImage(i)}
                      className={`shrink-0 w-20 h-14 rounded overflow-hidden border-2 ${
                        i === activeImage ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <img src={img} alt="" className="object-cover w-full h-full" />
                    </button>
                  ))}
                </div>
              )}

              <div className="p-6 md:p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">
                      {room.roomType} · {room.floor}
                    </p>
                    <h1 className="text-3xl font-serif font-bold mt-1">{room.title}</h1>
                    <div className="flex flex-wrap gap-3 mt-3">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="w-3 h-3" /> {room.maxGuests} guests
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <BedDouble className="w-3 h-3" /> {room.beds} {room.beds === 1 ? "bed" : "beds"}
                      </Badge>
                      {room.size && (
                        <Badge variant="secondary" className="gap-1">
                          <Ruler className="w-3 h-3" /> {room.size}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-mono font-bold">¥{room.startingPrice.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">per night</div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">{room.description}</p>
                </div>

                {room.amenities?.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-bold text-lg mb-4">Amenities</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {room.amenities.map((amenity) => (
                          <div key={amenity} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                            <span>{amenity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex gap-3 items-start">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium">Check-in</div>
                      <div className="text-sm text-muted-foreground">From {room.checkInTime}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <Clock className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <div className="font-medium">Check-out</div>
                      <div className="text-sm text-muted-foreground">By {room.checkOutTime}</div>
                    </div>
                  </div>
                </div>

                {room.houseRules && (
                  <>
                    <Separator />
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <ScrollText className="w-5 h-5 text-primary" />
                        <h3 className="font-bold text-lg">House Rules</h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                        {room.houseRules}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="sticky top-24 rounded-xl border bg-background shadow-lg border-primary/10 p-6 space-y-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-5 w-5" />
                <p className="text-xs tracking-[0.25em] uppercase">Interested?</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Reach out to our team to check live availability and confirm your reservation for {room.title}.
              </p>
              <div className="text-2xl font-mono font-bold">
                ¥{room.startingPrice.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground"> /night</span>
              </div>
              <a href="mailto:info@ciao-sapporo.jp">
                <Button size="lg" className="w-full">
                  Contact to Book
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
