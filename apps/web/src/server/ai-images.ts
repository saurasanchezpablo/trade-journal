/** Largest picture accepted from the page for the AI (a screenshot). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const TYPES = [
  { mediaType: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mediaType: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
] as const;

/**
 * A PNG, JPEG or WebP data URL checked by its bytes, not its label; null for anything else
 * or anything too large.
 */
export function decodeImageDataUrl(value: unknown): { data: Buffer; mediaType: string } | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2]!.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) return null;
  const data = Buffer.from(match[2]!, "base64");
  const type = TYPES.find((t) => t.mediaType === match[1]);
  if (!type || data.length > MAX_IMAGE_BYTES || !type.magic.every((b, i) => data[i] === b))
    return null;
  if (type.mediaType === "image/webp" && data.subarray(8, 12).toString("ascii") !== "WEBP")
    return null;
  return { data, mediaType: type.mediaType };
}
