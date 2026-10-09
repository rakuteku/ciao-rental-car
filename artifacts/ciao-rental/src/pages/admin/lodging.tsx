import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminRooms,
  useCreateAdminRoom,
  useUpdateAdminRoom,
  useDeleteAdminRoom,
  useReorderAdminRooms,
  getGetAdminRoomsQueryKey,
  type Room,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/lib/language";
import { LodgingPhotos } from "@/components/admin/LodgingPhotos";

type RoomFormData = {
  title: string;
  roomType: string;
  maxGuests: number;
  beds: number;
  size: string;
  floor: string;
  description: string;
  startingPrice: number;
  amenities: string;
  images: string;
  coverImage: string;
  externalUrl: string;
  externalNofollow: boolean;
  externalNewTab: boolean;
  houseRules: string;
  checkInTime: string;
  checkOutTime: string;
  featured: boolean;
  published: boolean;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
};

const defaultFormData: RoomFormData = {
  title: "",
  roomType: "Studio",
  maxGuests: 2,
  beds: 1,
  size: "",
  floor: "",
  description: "",
  startingPrice: 8000,
  amenities: "",
  images: "",
  coverImage: "",
  externalUrl: "",
  externalNofollow: true,
  externalNewTab: true,
  houseRules: "",
  checkInTime: "15:00",
  checkOutTime: "10:00",
  featured: false,
  published: true,
  metaTitle: "",
  metaDescription: "",
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
};

function roomToFormData(room: Room): RoomFormData {
  return {
    title: room.title,
    roomType: room.roomType,
    maxGuests: room.maxGuests,
    beds: room.beds,
    size: room.size ?? "",
    floor: room.floor ?? "",
    description: room.description,
    startingPrice: room.startingPrice,
    amenities: (room.amenities ?? []).join("\n"),
    images: (room.images ?? []).join("\n"),
    coverImage: room.coverImage ?? "",
    externalUrl: room.externalUrl ?? "",
    externalNofollow: room.externalNofollow ?? true,
    externalNewTab: room.externalNewTab ?? true,
    houseRules: room.houseRules ?? "",
    checkInTime: room.checkInTime,
    checkOutTime: room.checkOutTime,
    featured: room.featured,
    published: room.published,
    metaTitle: room.metaTitle,
    metaDescription: room.metaDescription,
    ogTitle: room.ogTitle,
    ogDescription: room.ogDescription,
    ogImage: room.ogImage,
  };
}

function parseLines(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

function RoomForm({
  initial,
  onSubmit,
  isPending,
  submitLabel,
}: {
  initial: RoomFormData;
  onSubmit: (data: RoomFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<RoomFormData>(initial);
  const [uploading, setUploading] = useState(false);
  const { language } = useLanguage();
  const t = (en: string, ja: string) => language === "ja" ? ja : en;

  const set = (field: keyof RoomFormData, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploading) return;
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 mt-2">
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t("Room Details", "お部屋の詳細")}</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("Room Title", "お部屋の名称")}</Label>
              <Input
                placeholder="e.g. Sakura Studio"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Room Type", "お部屋のタイプ")}</Label>
              <Input
                placeholder="e.g. Studio, 1LDK, 2LDK"
                value={form.roomType}
                onChange={(e) => set("roomType", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>{t("Max Guests", "最大宿泊人数")}</Label>
              <Input
                type="number"
                min={1}
                value={form.maxGuests}
                onChange={(e) => set("maxGuests", parseInt(e.target.value) || 1)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Beds", "ベッド数")}</Label>
              <Input
                type="number"
                min={1}
                value={form.beds}
                onChange={(e) => set("beds", parseInt(e.target.value) || 1)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Size", "広さ")}</Label>
              <Input
                placeholder="e.g. 22m²"
                value={form.size}
                onChange={(e) => set("size", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Floor", "階数")}</Label>
              <Input
                placeholder="e.g. 2F"
                value={form.floor}
                onChange={(e) => set("floor", e.target.value)}
              />
            </div>
          </div>

          <Separator />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Pricing & Stay", "料金・滞在時間")}</p>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t("Starting Price / Night (¥)", "1泊あたりの最低料金（円）")}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">¥</span>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  className="pl-7"
                  value={form.startingPrice}
                  onChange={(e) => set("startingPrice", parseInt(e.target.value) || 0)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Check-in Time", "チェックイン時間")}</Label>
              <Input
                type="time"
                value={form.checkInTime}
                onChange={(e) => set("checkInTime", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Check-out Time", "チェックアウト時間")}</Label>
              <Input
                type="time"
                value={form.checkOutTime}
                onChange={(e) => set("checkOutTime", e.target.value)}
                required
              />
            </div>
          </div>

          <Separator />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Content", "コンテンツ")}</p>

          <div className="space-y-1.5">
            <Label>{t("Description", "説明")}</Label>
            <Textarea
              placeholder="Describe the room..."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("Amenities", "設備・アメニティ")}</Label>
            <Textarea
              placeholder="One per line&#10;Free Wi-Fi&#10;Kitchenette"
              value={form.amenities}
              onChange={(e) => set("amenities", e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">{t("Enter one amenity per line.", "設備・アメニティを1行に1項目ずつ入力してください。")}</p>
          </div>

          <LodgingPhotos images={parseLines(form.images)} coverImage={form.coverImage} onUploadingChange={setUploading} onChange={(images, coverImage) => setForm(prev => ({ ...prev, images: images.join("\n"), coverImage }))} />
          <div className="space-y-3 border-t pt-4">
            <Label htmlFor="lodging-external-url">{t("External booking URL", "外部予約URL")}</Label>
            <Input id="lodging-external-url" type="url" value={form.externalUrl} onChange={event => set("externalUrl", event.target.value)} placeholder="https://" />
            <div className="flex items-center gap-3"><Switch id="lodging-nofollow" checked={form.externalNofollow} onCheckedChange={value => set("externalNofollow", value)} /><Label htmlFor="lodging-nofollow">{t("Use nofollow", "nofollowを設定")}</Label></div>
            <div className="flex items-center gap-3"><Switch id="lodging-new-tab" checked={form.externalNewTab} onCheckedChange={value => set("externalNewTab", value)} /><Label htmlFor="lodging-new-tab">{t("Open in a new tab", "新しいタブで開く")}</Label></div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("House Rules", "ハウスルール")}</Label>
            <Textarea
              value={form.houseRules}
              onChange={(e) => set("houseRules", e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Switch checked={form.published} onCheckedChange={(v) => set("published", v)} id="published" />
              <Label htmlFor="published">{t("Published", "公開")}</Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.featured} onCheckedChange={(v) => set("featured", v)} id="featured" />
              <Label htmlFor="featured">{t("Featured on homepage", "ホームページに掲載")}</Label>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-5 pt-4">
          <div className="space-y-1.5">
            <Label>Meta Title</Label>
            <Input value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
          <div className="space-y-1.5">
            <Label>Meta Description</Label>
            <Textarea rows={2} value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
          <div className="space-y-1.5">
            <Label>Open Graph Title</Label>
            <Input value={form.ogTitle} onChange={(e) => set("ogTitle", e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
          <div className="space-y-1.5">
            <Label>Open Graph Description</Label>
            <Textarea rows={2} value={form.ogDescription} onChange={(e) => set("ogDescription", e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
          <div className="space-y-1.5">
            <Label>Open Graph Image URL</Label>
            <Input value={form.ogImage} onChange={(e) => set("ogImage", e.target.value)} placeholder="Auto-generated if left blank" />
          </div>
        </TabsContent>
      </Tabs>

      <Button type="submit" disabled={isPending || uploading} className="w-full">
        {isPending ? t("Saving…", "保存中…") : submitLabel}
      </Button>
    </form>
  );
}

export function AdminLodging() {
  const { language } = useLanguage();
  const t = (en: string, ja: string) => language === "ja" ? ja : en;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: rooms, isLoading } = useGetAdminRooms({
    query: { queryKey: getGetAdminRoomsQueryKey() },
  });

  const createRoom = useCreateAdminRoom();
  const updateRoom = useUpdateAdminRoom();
  const deleteRoom = useDeleteAdminRoom();
  const reorderRooms = useReorderAdminRooms();

  const [addOpen, setAddOpen] = useState(false);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [deleteRoomId, setDeleteRoomId] = useState<number | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetAdminRoomsQueryKey() });

  function buildPayload(data: RoomFormData) {
    const images = parseLines(data.images);
    return {
      title: data.title,
      roomType: data.roomType,
      maxGuests: data.maxGuests,
      beds: data.beds,
      size: data.size || undefined,
      floor: data.floor || undefined,
      description: data.description,
      startingPrice: data.startingPrice,
      amenities: parseLines(data.amenities),
      images,
      coverImage: data.coverImage || images[0] || "",
      externalUrl: data.externalUrl.trim(),
      externalNofollow: data.externalNofollow,
      externalNewTab: data.externalNewTab,
      houseRules: data.houseRules || undefined,
      checkInTime: data.checkInTime,
      checkOutTime: data.checkOutTime,
      featured: data.featured,
      published: data.published,
      metaTitle: data.metaTitle || undefined,
      metaDescription: data.metaDescription || undefined,
      ogTitle: data.ogTitle || undefined,
      ogDescription: data.ogDescription || undefined,
      ogImage: data.ogImage || undefined,
    };
  }

  function handleCreate(data: RoomFormData) {
    createRoom.mutate({ data: buildPayload(data) }, {
      onSuccess: () => {
        toast({ title: "Room added", description: `${data.title} has been added.` });
        setAddOpen(false);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to add room.", variant: "destructive" });
      },
    });
  }

  function handleEdit(data: RoomFormData) {
    if (!editRoom) return;
    updateRoom.mutate({ id: editRoom.id, data: buildPayload(data) }, {
      onSuccess: () => {
        toast({ title: "Room updated" });
        setEditRoom(null);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update room.", variant: "destructive" });
      },
    });
  }

  function handleDelete() {
    if (!deleteRoomId) return;
    deleteRoom.mutate({ id: deleteRoomId }, {
      onSuccess: () => {
        toast({ title: "Room removed" });
        setDeleteRoomId(null);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete room.", variant: "destructive" });
      },
    });
  }

  function handleTogglePublished(room: Room) {
    updateRoom.mutate({ id: room.id, data: { published: !room.published } }, {
      onSuccess: () => {
        toast({ title: "Published status updated" });
        invalidate();
      },
    });
  }

  function handleToggleFeatured(room: Room) {
    updateRoom.mutate({ id: room.id, data: { featured: !room.featured } }, {
      onSuccess: () => {
        toast({ title: "Featured status updated" });
        invalidate();
      },
    });
  }

  function handleMove(index: number, direction: -1 | 1) {
    if (!rooms) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rooms.length) return;
    const reordered = [...rooms];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    reorderRooms.mutate({ data: { orderedIds: reordered.map((r) => r.id) } }, {
      onSuccess: () => invalidate(),
      onError: () => {
        toast({ title: "Error", description: "Failed to reorder rooms.", variant: "destructive" });
      },
    });
  }

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <h1 className="text-3xl font-serif font-bold tracking-tight">Lodging Management</h1>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {["Room", "Type", "Guests", "Price/Night", "Featured", "Published", "Actions"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {Array(7).fill(0).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">{t("Lodging Management", "宿泊施設管理")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{rooms?.length ?? 0} {t("rooms listed", "室を登録")}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t("Add New Room", "お部屋を追加")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">{t("Add New Room", "お部屋を追加")}</DialogTitle>
            </DialogHeader>
            <RoomForm
              initial={defaultFormData}
              onSubmit={handleCreate}
              isPending={createRoom.isPending}
              submitLabel={t("Add Room", "お部屋を追加")}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Order", "表示順")}</TableHead>
              <TableHead>{t("Image", "画像")}</TableHead>
              <TableHead>{t("Room", "お部屋")}</TableHead>
              <TableHead>{t("Type", "タイプ")}</TableHead>
              <TableHead>{t("Guests", "人数")}</TableHead>
              <TableHead>{t("Price/Night", "1泊の料金")}</TableHead>
              <TableHead>{t("Featured", "おすすめ")}</TableHead>
              <TableHead>{t("Published", "公開")}</TableHead>
              <TableHead className="text-right">{t("Actions", "操作")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rooms?.map((room, index) => (
              <TableRow key={room.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => handleMove(index, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === rooms.length - 1} onClick={() => handleMove(index, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="w-20 h-12 rounded overflow-hidden bg-muted">
                    {room.coverImage
                      ? <img src={room.coverImage} alt={room.title} className="object-cover w-full h-full" />
                      : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">{t("No image", "画像なし")}</div>
                    }
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{room.title}</p>
                    <p className="text-xs text-muted-foreground">/lodging/{room.slug}</p>
                  </div>
                </TableCell>
                <TableCell>{room.roomType}</TableCell>
                <TableCell>{room.maxGuests} {t("guests", "名")}</TableCell>
                <TableCell className="font-mono">¥{room.startingPrice.toLocaleString()}</TableCell>
                <TableCell>
                  <Switch checked={room.featured} onCheckedChange={() => handleToggleFeatured(room)} disabled={updateRoom.isPending} />
                </TableCell>
                <TableCell>
                  <Switch checked={room.published} onCheckedChange={() => handleTogglePublished(room)} disabled={updateRoom.isPending} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Dialog open={editRoom?.id === room.id} onOpenChange={(open) => !open && setEditRoom(null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => setEditRoom(room)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="font-serif text-xl">{t("Edit", "編集")} {room.title}</DialogTitle>
                        </DialogHeader>
                        {editRoom?.id === room.id && (
                          <RoomForm
                            initial={roomToFormData(room)}
                            onSubmit={handleEdit}
                            isPending={updateRoom.isPending}
                            submitLabel={t("Save Changes", "変更を保存")}
                          />
                        )}
                      </DialogContent>
                    </Dialog>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteRoomId(room.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!rooms?.length && (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  {t("No rooms yet.", "登録されたお部屋はありません。")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteRoomId !== null} onOpenChange={(open) => !open && setDeleteRoomId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove room?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this room listing and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRoom.isPending ? "Removing…" : "Remove Room"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
