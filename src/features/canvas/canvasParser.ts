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

const CANVAS_FENCE_RE = /```canvas\s*\n([\s\S]*?)\n```/g;

function extractCanvasBlocks(text: string): string[] {
  const results: string[] = [];
  CANVAS_FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CANVAS_FENCE_RE.exec(text)) !== null) {
    const raw = match[1]?.trim();
    if (raw) results.push(raw);
  }
  return results;
}

function parseCanvasPayload(json: string): CanvasPayload | null {
  try {
    const parsed: unknown = JSON.parse(json);
    const result = CanvasPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if `text` contains at least one ```canvas fenced block.
 * Works on both single outputLines and multi-line text.
 */
export function hasCanvasBlock(text: string): boolean {
  CANVAS_FENCE_RE.lastIndex = 0;
  return CANVAS_FENCE_RE.test(text);
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
