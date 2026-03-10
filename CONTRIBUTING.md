# Contributing to Outlet

Thanks for your interest in contributing! Outlet is an open-source split-pane canvas UI for OpenClaw agents, and we welcome contributions of all kinds.

## Quick Start

```bash
# Clone
git clone https://github.com/guillaumeang/outlet.git
cd outlet

# Install deps
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```

You'll need an [OpenClaw](https://github.com/openclaw/openclaw) gateway running (default: `ws://localhost:18789`) to test the full agent → canvas flow.

## What Can I Work On?

- 🏷️ **[Good first issues](https://github.com/guillaumeang/outlet/labels/good%20first%20issue)** — great starting points
- 🎨 **[Canvas types](https://github.com/guillaumeang/outlet/labels/canvas-type)** — new visualization types (timeline, calendar, graph, etc.)
- 🐛 **Bug fixes** — if you find one, open an issue or just fix it
- 📖 **Documentation** — README improvements, inline docs, examples
- ✨ **Enhancements** — check the [issues](https://github.com/guillaumeang/outlet/issues) for ideas

## Adding a New Canvas Type

This is the most impactful contribution you can make. Here's the pattern:

1. **Define the schema** — add your type to the body type union in the canvas protocol
2. **Create the component** — add a new renderer in `src/features/`
3. **Register it** — wire it into the canvas renderer switch
4. **Test it** — create a sample canvas JSON block and verify it renders
5. **Update the SKILL.md** — add your new type to the body types list

Look at existing types (list, dashboard, kanban, spreadsheet) for the exact pattern.

## Pull Request Process

1. **Fork** the repo and create a branch (`feat/timeline-canvas`, `fix/chart-colors`, etc.)
2. **Keep PRs focused** — one feature or fix per PR
3. **Test your changes** — make sure `npm run dev` works and nothing is visually broken
4. **Write a clear PR description** — what does it do, why, and how to test it
5. **Screenshots welcome** — if your change is visual, include before/after screenshots

## Code Style

- **TypeScript** — all new code should be in TypeScript
- **Tailwind CSS** — for styling (no external CSS libraries)
- **React** — functional components with hooks
- **Keep it simple** — we favor readability over cleverness

## Community

- 💬 [GitHub Discussions](https://github.com/guillaumeang/outlet/discussions) — questions, ideas, show & tell
- 🐛 [Issues](https://github.com/guillaumeang/outlet/issues) — bug reports and feature requests
- 🔌 [OpenClaw Discord](https://discord.gg/clawd) — real-time chat with the community

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
