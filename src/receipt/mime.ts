export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMime(value: string): value is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((byte, i) => buf[offset + i] === byte);

/** Identifies the real file type from magic bytes; the client-declared type is not trusted. */
export function sniffMime(buf: Buffer): AllowedMime | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}
