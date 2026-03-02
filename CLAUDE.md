# Outlet

An OpenClaw skill. Split-pane chat + canvas UI for the OpenClaw gateway.

## Stack

- **Framework**: Next.js 16 App Router (`src/app/`)
- **React**: 19
- **Language**: TypeScript (strict)
- **Styling**: Tailwind v4 (`src/app/globals.css`)
- **Icons**: lucide-react
- **Markdown**: react-markdown v10 + remark-gfm
- **Charts**: recharts (DashboardRenderer)
- **Validation**: zod (canvas payload schemas)
- **WebSocket**: ws (server-side proxy)

## Architecture

Two parts:

1. **Next.js App** (`src/`) — browser UI at `http://localhost:3000`
2. **Node.js Server** (`server/index.js`) — WebSocket proxy bridging browser to the OpenClaw gateway

Dev server: `node server/index.js --dev` (not `next dev` directly).

### Gateway Communication

```
Browser ↔ /api/gateway/ws ↔ Node proxy ↔ ws://localhost:18789 (upstream gateway)
```

All agent data lives in the gateway; Outlet stores only UI preferences locally.

## Directory Structure

```
src/
  app/
    page.tsx                  # Main orchestration — AgentStudioPage
    layout.tsx                # Root layout (fonts, theme)
    api/gateway/ws/           # WebSocket proxy route
    globals.css               # Tailwind + design tokens
  features/
    agents/
      state/store.tsx         # AgentStoreProvider + useAgentStore
      components/
        AgentChatPanel.tsx    # Chat UI: transcript + composer
        AgentDropdown.tsx     # Agent selector dropdown
        chatItems.ts          # Chat item builders
      operations/
        chatSendOperation.ts  # Message sending
    canvas/
      types.ts                # Zod schemas for canvas payloads
      canvasParser.ts         # extractCanvasEntriesFromOutputLines
      CanvasPane.tsx           # Right-pane canvas viewer
      renderers/              # ListRenderer, DashboardRenderer, KanbanRenderer,
                              # SpreadsheetRenderer, DetailRenderer, MarkdownRenderer,
                              # ImageRenderer, WebpageRenderer, FallbackRenderer
  lib/
    gateway/                  # WebSocket client wrapper
    text/message-extract.ts   # Message parsing + OUTLET_CONTEXT injection
```

## Dev Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (Next.js + WebSocket proxy)
npm run build      # Production build
npm run typecheck  # Type-check
npm test           # Vitest unit tests
```

## Canvas Body Types

| type | Description |
|------|-------------|
| `list` | Scrollable item list with title/subtitle/meta/badge |
| `dashboard` | Metrics grid + recharts (bar/line/pie/area) |
| `kanban` | Columns with cards |
| `spreadsheet` | Tabular data with column alignment |
| `detail` | Key-value field grid |
| `markdown` | Full markdown content |
| `image` | Image with optional caption |
| `webpage` | Sandboxed iframe |

Any canvas element with a `prompt` field sends that prompt as a chat message when clicked.
