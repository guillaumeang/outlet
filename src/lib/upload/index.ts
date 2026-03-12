import type { AttachmentRef } from "@/lib/text/message-extract";

// ─── Allowed MIME sets ───────────────────────────────────────────────────────

/** All file types accepted by the upload endpoint. */
export const ALLOWED_UPLOAD_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

/** Image-only subset for contexts like tweet media (no PDF). */
export const ALLOWED_TWEET_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

/** Maximum media attachments per tweet (Twitter allows up to 4 images). */
export const MAX_MEDIA_PER_TWEET = 4;

// ─── Upload helper ───────────────────────────────────────────────────────────

/**
 * Upload a file to the gateway upload endpoint.
 * Returns the stored path, MIME type, and filename.
 */
export async function uploadFile(file: File): Promise<AttachmentRef> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/gateway/upload", { method: "POST", body: form });
  if (!res.ok) {
    let message = "Upload failed";
    try {
      const json = await res.json();
      message = json.error ?? message;
    } catch {
      /* non-JSON response */
    }
    throw new Error(message);
  }
  const json = await res.json();
  return { path: json.path, mime: json.mime, filename: json.filename };
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

/** Build the gateway media URL for a stored upload path. */
export function toMediaUrl(filePath: string): string {
  return `/api/gateway/media?path=${encodeURIComponent(filePath)}`;
}
