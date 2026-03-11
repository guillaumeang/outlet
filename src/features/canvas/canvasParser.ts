import {
  isMetaMarkdown,
  isToolMarkdown,
  isTraceMarkdown,
  parseMetaMarkdown,
} from "@/lib/text/message-extract";
import { CanvasPayloadSchema, type CanvasEntry, type CanvasPayload } from "./types";

// ─── Internal helpers ─────────────────────────────────────────────────────────

function hashString(s: string): string {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

// Accept both multi-line and single-line canvas fenced blocks:
//   ```canvas\n{...}\n```   (standard)
//   ```canvas {...} ```     (inline / agent formatting quirk)
// Pattern kept as a constant string; new RegExp instances created per call
// to avoid shared mutable lastIndex state.
const CANVAS_FENCE_PATTERN = /`{3,}canvas\s*\n?([\s\S]*?)\n?\s*`{3,}/g;

function extractCanvasBlocks(text: string): string[] {
  const results: string[] = [];
  for (const match of text.matchAll(new RegExp(CANVAS_FENCE_PATTERN.source, "g"))) {
    const raw = match[1]?.trim();
    if (raw) results.push(raw);
  }
  return results;
}

function parseCanvasPayload(json: string): CanvasPayload | null {
  try {
    const parsed: unknown = JSON.parse(json);
    const result = CanvasPayloadSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("[canvas] Zod validation failed:", result.error.issues);
    }
    return result.success ? result.data : null;
  } catch (err) {
    console.warn("[canvas] JSON parse failed:", err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if `text` contains at least one ```canvas fenced block.
 * Works on both single outputLines and multi-line text.
 */
export function hasCanvasBlock(text: string): boolean {
  return new RegExp(CANVAS_FENCE_PATTERN.source).test(text);
}

/**
 * Strips all ```canvas fenced blocks from text, returning what remains.
 * Used to hide canvas blocks from the chat transcript display.
 */
export function stripCanvasBlocks(text: string): string {
  return text.replace(new RegExp(CANVAS_FENCE_PATTERN.source, "g"), "").trim();
}

/**
 * Scans `outputLines` (from AgentState) for canvas fenced blocks.
 * Returns entries in chronological order.
 * Stable IDs based on JSON content hash — safe to use as React keys.
 */
export function extractCanvasEntriesFromOutputLines(outputLines: string[]): CanvasEntry[] {
  const entries: CanvasEntry[] = [];
  let lastTimestampMs = Date.now();
  const seenIds = new Set<string>();

  for (const line of outputLines) {
    if (!line) continue;

    // Update timestamp from meta lines
    if (isMetaMarkdown(line)) {
      const parsed = parseMetaMarkdown(line);
      if (parsed?.timestamp) lastTimestampMs = parsed.timestamp;
      continue;
    }

    // Skip thinking, tool, and user message lines
    if (isTraceMarkdown(line) || isToolMarkdown(line) || line.trimStart().startsWith(">")) {
      continue;
    }

    // Assistant text — may contain canvas fenced blocks (including \n in outputLine)
    const jsonBlocks = extractCanvasBlocks(line);
    for (const json of jsonBlocks) {
      const payload = parseCanvasPayload(json);
      if (!payload) continue;
      const id = `canvas-${hashString(json)}`;
      // Deduplicate by ID in case a line is processed twice (shouldn't happen but be safe)
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      entries.push({ id, payload, timestampMs: lastTimestampMs });
    }
  }

  return entries;
}
