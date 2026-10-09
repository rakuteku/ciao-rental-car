import { useRef, useState } from "react";
import { ImagePlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language";

export function LodgingPhotos({
  images,
  coverImage,
  onChange,
  onUploadingChange,
}: {
  images: string[];
  coverImage: string;
  onChange: (images: string[], cover: string) => void;
  onUploadingChange: (busy: boolean) => void;
}) {
  const { language } = useLanguage();
  const t = (en: string, ja: string) => (language === "ja" ? ja : en);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    onUploadingChange(true);
    setError("");
    const next = [...images];
    try {
      for (const file of Array.from(files)) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        )
          throw new Error(
            t(
              "Use JPEG, PNG or WebP, up to 5 MB each.",
              "JPEG・PNG・WebP形式、1枚5MB以内で選択してください。",
            ),
          );
        const response = await fetch("/api/admin/rooms/images", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok)
          throw new Error(
            t(
              "Photo upload failed. Please try again.",
              "写真のアップロードに失敗しました。もう一度お試しください。",
            ),
          );
        const result: { url: string } = await response.json();
        next.push(result.url);
        onChange([...next], coverImage || next[0]);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Upload failed", "アップロードに失敗しました"),
      );
    } finally {
      setBusy(false);
      onUploadingChange(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {t("Photos & cover image", "写真・カバー画像")}
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus className="mr-2 size-4" />
          {busy
            ? t("Uploading…", "アップロード中…")
            : t("Upload photos", "写真をアップロード")}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={busy}
        className="hidden"
        onChange={(event) => void upload(event.target.files)}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((url, index) => {
          const cover = url === (coverImage || images[0]);
          return (
            <div
              key={`${url}-${index}`}
              className="overflow-hidden rounded-md border"
            >
              <img
                src={url}
                alt={t(
                  `Lodging photo ${index + 1}`,
                  `宿泊施設の写真 ${index + 1}`,
                )}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="flex items-center justify-between p-2">
                <Button
                  type="button"
                  variant={cover ? "secondary" : "ghost"}
                  size="sm"
                  disabled={busy}
                  onClick={() => onChange(images, url)}
                >
                  <Star className="mr-1 size-4" />
                  {cover
                    ? t("Cover", "カバー")
                    : t("Set cover", "カバーに設定")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title={t("Remove photo", "写真を削除")}
                  aria-label={t("Remove photo", "写真を削除")}
                  disabled={busy}
                  onClick={() => {
                    const next = images.filter((_, i) => i !== index);
                    onChange(next, cover ? next[0] || "" : coverImage);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
