# 🔌 Outlet

A split-pane canvas UI skill for [OpenClaw](https://github.com/grp06/openclaw). Chat on the left, interactive canvas on the right.

Outlet automatically instructs your agent to render structured data (lists, dashboards, kanban boards, spreadsheets, detail views, markdown, images, iframes) as interactive canvas blocks — no prompt engineering required.

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An OpenClaw gateway running (default: `ws://localhost:18789`)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/<your-username>/outlet.git
cd outlet

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open **http://localhost:3000** and connect to your gateway.

### Environment Variables (optional)

Copy `.env.example` to `.env.local` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_GATEWAY_URL` | `ws://127.0.0.1:18789` | Your OpenClaw gateway WebSocket URL |

## How It Works

Outlet wraps each message with context that tells the agent about the canvas panel. The agent responds with standard chat text **plus** fenced `` ```canvas `` blocks containing JSON. These blocks are automatically extracted and rendered in the right pane.

### Canvas Types

| Type | Use For |
|------|---------|
| **list** | Search results, file lists, tasks, logs |
| **dashboard** | KPIs, metrics, charts (bar/line/area/pie) |
| **kanban** | Sprint boards, workflow stages |
| **spreadsheet** | Tabular data, comparisons, inventories |
| **detail** | Entity details, key-value records |
| **markdown** | Reports, documentation, rich text |
| **image** | Single image with caption |
| **webpage** | Sandboxed iframe embed |

Canvas elements with a `prompt` field become clickable — clicking sends that prompt to chat, making the canvas interactive.

## Canvas JSON Format

```json
{
  "header": {
    "title": "Active Projects",
    "subtitle": "Sorted by last update",
    "actions": [{ "label": "Refresh", "prompt": "Refresh data", "primary": true }]
  },
  "body": {
    "type": "list",
    "items": [
      { "title": "Project Alpha", "subtitle": "Engineering", "meta": "2h ago", "prompt": "Tell me about Project Alpha" }
    ]
  }
}
```

See [SKILL.md](SKILL.md) for the full schema reference.

## Development

```bash
npm run dev        # Dev server (Next.js + WebSocket proxy)
npm run build      # Production build
npm run typecheck  # Type-check without building
npm test           # Unit tests (vitest)
npm run e2e        # E2E tests (playwright)
```

> **Note**: The dev server uses `node server/index.js --dev`, not `next dev` directly. This starts a Node proxy that bridges WebSocket connections to the upstream gateway.

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4** with design tokens
- **TypeScript** (strict)
- **Zod** for canvas payload validation
- **Recharts** for dashboard charts
- **lucide-react** icons

## License

See [LICENSE](LICENSE).
