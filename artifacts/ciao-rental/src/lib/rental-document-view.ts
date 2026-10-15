export async function openStaffDocument(path: string): Promise<void> {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  try {
    const response = await fetch(`${path}?link=1`, { credentials: "include" });
    if (!response.ok) throw new Error("Could not open the private document.");
    const data = await response.json() as { url?: string };
    if (!data.url?.startsWith(`${path}?`)) throw new Error("Invalid private document link.");
    if (popup) popup.location.href = data.url;
    else window.location.assign(data.url);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
