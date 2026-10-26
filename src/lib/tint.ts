/**
 * The most characterful colour in a piece of artwork, as "r, g, b" for use in
 * rgba(). Vivid pixels count for more than greys, and the result is lifted to
 * a consistent brightness so it reads as a glow on black.
 */
export async function artTint(src: string): Promise<string | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, size, size);
    const px = ctx.getImageData(0, 0, size, size).data;

    let r = 0, g = 0, b = 0, total = 0;
    for (let i = 0; i < px.length; i += 4) {
      const max = Math.max(px[i], px[i + 1], px[i + 2]);
      const min = Math.min(px[i], px[i + 1], px[i + 2]);
      const w = (max - min) / 255 + 0.05; // saturation, with a floor for greyscale art
      r += px[i] * w;
      g += px[i + 1] * w;
      b += px[i + 2] * w;
      total += w;
    }
    if (!total) return null;
    [r, g, b] = [r / total, g / total, b / total];
    const lift = 210 / Math.max(r, g, b, 1);
    return [r, g, b].map((c) => Math.round(Math.min(255, c * lift))).join(", ");
  } catch {
    return null;
  }
}
