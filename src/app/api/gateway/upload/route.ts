import { NextResponse } from "next/server";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

export const runtime = "nodejs";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
const MAX_FOLDER_BYTES = 100 * 1024 * 1024; // 100 MB total quota

const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

// Magic byte signatures for file type validation
const MAGIC_BYTES: [string, number[]][] = [
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF header
  ["application/pdf", [0x25, 0x50, 0x44, 0x46]], // %PDF
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(os.homedir(), ".openclaw", "uploads");

async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

function detectMimeFromBytes(bytes: Uint8Array): string | null {
  for (const [mime, signature] of MAGIC_BYTES) {
    if (bytes.length < signature.length) continue;
    if (signature.every((b, i) => bytes[i] === b)) return mime;
  }
  return null;
}

async function folderSize(): Promise<number> {
  try {
    const entries = await fs.readdir(UPLOADS_DIR);
    let total = 0;
    for (const entry of entries) {
      try {
        const stat = await fs.stat(path.join(UPLOADS_DIR, entry));
        if (stat.isFile()) total += stat.size;
      } catch {
        // skip unreadable entries
      }
    }
    return total;
  } catch {
    return 0;
  }
}

// ─── POST handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data" },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // ── Validate MIME type ──
    const declaredMime = file.type.toLowerCase();
    const ext = ALLOWED_MIME[declaredMime];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported file type: ${declaredMime}. Allowed: ${Object.keys(ALLOWED_MIME).join(", ")}` },
        { status: 400 },
      );
    }

    // ── Validate size ──
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${bytes.length} bytes). Max: ${MAX_FILE_BYTES} bytes` },
        { status: 400 },
      );
    }

    // ── Validate magic bytes ──
    const detectedMime = detectMimeFromBytes(bytes);
    if (!detectedMime || !ALLOWED_MIME[detectedMime]) {
      return NextResponse.json(
        { error: "File content does not match an allowed type (magic byte check failed)" },
        { status: 400 },
      );
    }

    // ── Check folder quota ──
    await ensureUploadsDir();
    const currentSize = await folderSize();
    if (currentSize + bytes.length > MAX_FOLDER_BYTES) {
      return NextResponse.json(
        { error: `Upload folder quota exceeded (${Math.round(MAX_FOLDER_BYTES / 1024 / 1024)}MB limit)` },
        { status: 507 },
      );
    }

    // ── Write atomically ──
    const timestamp = Date.now();
    const hash = crypto.randomBytes(6).toString("hex");
    const finalExt = ALLOWED_MIME[detectedMime] ?? ext;
    const filename = `${timestamp}-${hash}${finalExt}`;
    const finalPath = path.join(UPLOADS_DIR, filename);
    const tmpPath = `${finalPath}.tmp`;

    try {
      await fs.writeFile(tmpPath, bytes);
      await fs.rename(tmpPath, finalPath);
    } catch (writeErr) {
      // Clean up partial file
      try {
        await fs.unlink(tmpPath);
      } catch {
        // ignore
      }
      throw writeErr;
    }

    return NextResponse.json({
      path: finalPath,
      filename,
      mime: detectedMime,
      size: bytes.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
