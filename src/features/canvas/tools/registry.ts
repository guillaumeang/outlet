import type { ToolRegistryEntry } from "./types";

// ─── Registry core ───────────────────────────────────────────────────────────

const entries = new Map<string, ToolRegistryEntry>();

export function registerTool<TData>(entry: ToolRegistryEntry<TData>): void {
  entries.set(entry.id, entry as unknown as ToolRegistryEntry);
}

export function getTool(id: string): ToolRegistryEntry | undefined {
  return entries.get(id);
}

export function getAllToolIds(): string[] {
  return [...entries.keys()];
}

export function getAllToolEntries(): ToolRegistryEntry[] {
  return [...entries.values()];
}

// ─── Tool registrations ──────────────────────────────────────────────────────
// Side-effect imports live in ToolHost.tsx (not here) to avoid circular TDZ.
// Each tool's index.ts calls registerTool() when imported.
