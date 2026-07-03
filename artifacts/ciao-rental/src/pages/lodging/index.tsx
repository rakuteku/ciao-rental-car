import { Link } from "wouter";
import { Users, BedDouble, Ruler } from "lucide-react";
import { useGetRooms } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeoMeta } from "@/hooks/use-seo-meta";

export function LodgingPage() {
  const { data: rooms, isLoading } = useGetRooms();
  useSeoMeta("lodging");

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="border-b py-12 bg-white">
        <div className="container">
          <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">Short-Term Lodging</p>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Our Rooms</h1>
          <p className="text-muted-foreground mt-3 text-sm max-w-xl">
            Comfortable, fully-equipped rooms in the heart of Sapporo — ideal for short stays of any length.
          </p>
        </div>
      </div>

      <div className="container py-16 flex-1">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[4/3] w-full" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {rooms?.map((room) => (
              <Link key={room.id} href={`/lodging/${room.slug}`} className="group block">
                <div className="overflow-hidden bg-muted aspect-[4/3]">
                  <img
                    src={room.coverImage || room.images?.[0]}
                    alt={room.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
                  />
                </div>
                <div className="pt-4 pb-2 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{room.roomType} · {room.floor}</p>
                      <h2 className="font-serif text-xl font-semibold group-hover:text-muted-foreground transition-colors">{room.title}</h2>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      ¥{room.startingPrice.toLocaleString()}<span className="text-muted-foreground text-xs">/night</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> {room.maxGuests} guests
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <BedDouble className="h-3.5 w-3.5" /> {room.beds} {room.beds === 1 ? "bed" : "beds"}
                    </p>
                    {room.size && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Ruler className="h-3.5 w-3.5" /> {room.size}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{room.description}</p>
                  <div className="pt-2">
                    <Button variant="outline" size="sm" className="w-full text-xs tracking-wide">
                      View Room
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
            {!rooms?.length && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-12">
                No rooms are currently listed.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
