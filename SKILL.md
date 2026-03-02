---
name: outlet
description: "Split-pane canvas UI skill for rendering structured data (lists, dashboards, kanban boards, spreadsheets, detail views, markdown, images, iframes) alongside chat responses."
metadata: {"clawdbot":{"emoji":"🎨"}}
---

# Outlet

You are connected through **Outlet**, a split-pane UI. The left pane shows your chat messages. The right pane renders a **canvas** — a live, interactive data view that you control.

## When to use canvas

**Use canvas proactively.** Do not wait for the user to ask. If your response would naturally contain any of the following, render it as a canvas instead of writing it in chat:

- A list of items (files, tasks, results, options, logs)
- Metrics, KPIs, or numeric summaries
- Status boards or workflow stages
- Key-value details about an entity
- A report, document, or structured explanation
- Tabular or chart-worthy data

**Keep chat short.** Write 1-2 sentences of context in chat and let the canvas carry the data. The user sees both panes simultaneously.

**When NOT to use canvas:** Pure conversation, yes/no answers, short explanations, code snippets, or when the user explicitly asks for plain text.

## How it works

Include a fenced code block with language `canvas` in your response. It is automatically extracted and rendered in the right pane.

````markdown
Here are your active projects:

```canvas
{
  "header": { "title": "Active Projects", "subtitle": "Sorted by last update" },
  "body": {
    "type": "list",
    "items": [
      { "id": "1", "title": "Project Alpha", "subtitle": "Engineering", "meta": "2h ago", "prompt": "Tell me about Project Alpha" },
      { "id": "2", "title": "Project Beta", "subtitle": "Design", "meta": "5h ago", "prompt": "Tell me about Project Beta" }
    ]
  }
}
```

Click any project for details.
````

## Canvas JSON format

```
{
  "header": {                          // optional
    "title": "string (required)",
    "subtitle": "string",
    "breadcrumbs": ["Section", "Sub"],
    "actions": [{ "label": "Refresh", "prompt": "Refresh data", "primary": true }]
  },
  "body": { ... }                      // required — see types below
}
```

Items, cards, fields, metrics, and charts can include a `"prompt"` field — clicking them silently sends that prompt to chat, making the canvas interactive.

---

## Body types

### `list` — Scrollable item list
Use for: search results, file lists, task lists, logs.
```json
{ "type": "list", "items": [{ "id": "1", "title": "Title (required)", "subtitle": "Line 2", "meta": "Right text", "badge": "status", "prompt": "Drill into this" }] }
```

### `dashboard` — Metrics + charts
Use for: KPIs, analytics, system health.
```json
{ "type": "dashboard", "metrics": [{ "label": "Users", "value": 1284, "delta": "+12%", "deltaPositive": true }], "charts": [{ "type": "bar", "title": "Revenue", "dataKey": "rev", "xKey": "day", "data": [{ "day": "Mon", "rev": 4200 }] }] }
```
Chart types: `"bar"` | `"line"` | `"area"` | `"pie"`. `dataKey` = Y axis field, `xKey` = X axis field.

### `kanban` — Column board
Use for: project tracking, sprint boards, workflow stages.
```json
{ "type": "kanban", "columns": [{ "id": "todo", "title": "To Do", "cards": [{ "id": "1", "title": "Task", "subtitle": "Team", "meta": "Due date", "prompt": "Status?" }] }] }
```

### `detail` — Key-value fields
Use for: entity details, config summaries, structured records.
```json
{ "type": "detail", "fields": [{ "label": "Status", "value": "Active", "prompt": "Explain" }, { "label": "Created", "value": "2024-01-15" }] }
```
Values: `string | number | boolean | null`. `null` renders as `—`.

### `spreadsheet` — Tabular data
Use for: comparisons, datasets, inventories, any row×column data.
```json
{ "type": "spreadsheet", "columns": [{ "key": "name", "label": "Name" }, { "key": "price", "label": "Price", "align": "right" }], "rows": [{ "name": "Widget A", "price": 29.99 }, { "name": "Widget B", "price": 49.99 }] }
```
`columns[].align`: `"left"` (default) | `"center"` | `"right"`. Row values: `string | number | boolean | null`.

### `markdown` — Rich text
Use for: reports, documentation, long-form explanations.
```json
{ "type": "markdown", "content": "# Title\n\nContent with **bold**, lists, tables." }
```

### `image` — Single image
```json
{ "type": "image", "src": "https://example.com/chart.png", "alt": "Description", "caption": "Caption" }
```

### `webpage` — Sandboxed iframe
```json
{ "type": "webpage", "url": "https://example.com", "title": "Page title" }
```

---

## Tips

- Always include `header.title` so the user knows what they're looking at.
- Add `prompt` fields liberally — they make the canvas interactive and conversational.
- Use `header.actions` for top-level operations (refresh, export, filter). `primary: true` highlights the main action.
- Every canvas block is saved in history — the user browses previous states with ◀ / ▶ arrows.
