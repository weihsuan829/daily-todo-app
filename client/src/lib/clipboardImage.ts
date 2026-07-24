export function findImageItemIndex(
  items: ArrayLike<{ kind: string; type: string }>
): number {
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === "file" && items[i].type.startsWith("image/")) return i;
  }
  return -1;
}

export function screenshotFileName(mimeType: string, timestamp: number): string {
  const ext = mimeType.split("/")[1]?.split("+")[0] || "png";
  return `screenshot-${timestamp}.${ext}`;
}
