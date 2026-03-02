# Agent Instructions

This repo is **Outlet**, an OpenClaw skill providing a split-pane chat + canvas UI.

Key areas:
- `src/features/canvas/` — Canvas types, parser, renderers
- `src/features/agents/` — Agent chat, state management, operations
- `src/lib/text/message-extract.ts` — OUTLET_CONTEXT injection + message parsing
- `src/app/page.tsx` — Main orchestration
- `SKILL.md` — Agent-facing canvas documentation (also synced to workspace)

When modifying canvas body types, update all three: `types.ts` (Zod schema), renderer in `renderers/`, and the OUTLET_CONTEXT string in `message-extract.ts`.
