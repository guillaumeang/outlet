import { z } from "zod";

// ─── Action ──────────────────────────────────────────────────────────────────

const ActionSchema = z.object({
  label: z.string(),
  prompt: z.string().optional(),
  primary: z.boolean().optional(),
});

// ─── Header ──────────────────────────────────────────────────────────────────

const CanvasHeaderSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  breadcrumbs: z.array(z.string()).optional(),
  actions: z.array(ActionSchema).optional(),
});

// ─── Body: list ──────────────────────────────────────────────────────────────

const ListItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  meta: z.string().optional(),
  badge: z.string().optional(),
  prompt: z.string().optional(),
});

const ListBodySchema = z.object({
  type: z.literal("list"),
  items: z.array(ListItemSchema),
});

// ─── Body: dashboard ─────────────────────────────────────────────────────────

const MetricWidgetSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  delta: z.string().optional(),
  deltaPositive: z.boolean().optional(),
  prompt: z.string().optional(),
});

const ChartDataPointSchema = z.record(z.union([z.string(), z.number()]));

const ChartWidgetSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["bar", "line", "pie", "area", "combo"]),
  title: z.string().optional(),
  dataKey: z.string(),
  lineKeys: z.array(z.string()).optional(),
  xKey: z.string().optional(),
  data: z.array(ChartDataPointSchema),
  prompt: z.string().optional(),
});

const DashboardBodySchema = z.object({
  type: z.literal("dashboard"),
  metrics: z.array(MetricWidgetSchema).optional(),
  charts: z.array(ChartWidgetSchema).optional(),
});

// ─── Body: kanban ────────────────────────────────────────────────────────────

const KanbanCardSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  meta: z.string().optional(),
  prompt: z.string().optional(),
});

const KanbanColumnSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  cards: z.array(KanbanCardSchema),
});

const KanbanBodySchema = z.object({
  type: z.literal("kanban"),
  columns: z.array(KanbanColumnSchema),
});

// ─── Body: webpage ───────────────────────────────────────────────────────────

const WebpageBodySchema = z.object({
  type: z.literal("webpage"),
  url: z.string(),
  title: z.string().optional(),
});

// ─── Body: image ─────────────────────────────────────────────────────────────

const ImageBodySchema = z.object({
  type: z.literal("image"),
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

// ─── Body: detail ────────────────────────────────────────────────────────────

const DetailFieldSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  prompt: z.string().optional(),
});

const DetailBodySchema = z.object({
  type: z.literal("detail"),
  fields: z.array(DetailFieldSchema),
});

// ─── Body: spreadsheet ──────────────────────────────────────────────────────

const SpreadsheetColumnSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});

const SpreadsheetRowSchema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

const SpreadsheetBodySchema = z.object({
  type: z.literal("spreadsheet"),
  columns: z.array(SpreadsheetColumnSchema),
  rows: z.array(SpreadsheetRowSchema),
});

// ─── Body: markdown ──────────────────────────────────────────────────────────

const MarkdownBodySchema = z.object({
  type: z.literal("markdown"),
  content: z.string(),
});

// ─── Union ───────────────────────────────────────────────────────────────────

const CanvasBodySchema = z.discriminatedUnion("type", [
  ListBodySchema,
  DashboardBodySchema,
  KanbanBodySchema,
  WebpageBodySchema,
  ImageBodySchema,
  DetailBodySchema,
  SpreadsheetBodySchema,
  MarkdownBodySchema,
]);

// ─── Full payload ─────────────────────────────────────────────────────────────

export const CanvasPayloadSchema = z.object({
  header: CanvasHeaderSchema.optional(),
  body: CanvasBodySchema,
});

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type CanvasPayload = z.infer<typeof CanvasPayloadSchema>;
export type CanvasHeader = z.infer<typeof CanvasHeaderSchema>;
export type CanvasBody = z.infer<typeof CanvasBodySchema>;
export type Action = z.infer<typeof ActionSchema>;

export type ListBody = z.infer<typeof ListBodySchema>;
export type ListItem = z.infer<typeof ListItemSchema>;

export type DashboardBody = z.infer<typeof DashboardBodySchema>;
export type MetricWidget = z.infer<typeof MetricWidgetSchema>;
export type ChartWidget = z.infer<typeof ChartWidgetSchema>;
export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>;

export type KanbanBody = z.infer<typeof KanbanBodySchema>;
export type KanbanColumn = z.infer<typeof KanbanColumnSchema>;
export type KanbanCard = z.infer<typeof KanbanCardSchema>;

export type WebpageBody = z.infer<typeof WebpageBodySchema>;
export type ImageBody = z.infer<typeof ImageBodySchema>;

export type DetailBody = z.infer<typeof DetailBodySchema>;
export type DetailField = z.infer<typeof DetailFieldSchema>;

export type SpreadsheetBody = z.infer<typeof SpreadsheetBodySchema>;
export type SpreadsheetColumn = z.infer<typeof SpreadsheetColumnSchema>;
export type SpreadsheetRow = z.infer<typeof SpreadsheetRowSchema>;

export type MarkdownBody = z.infer<typeof MarkdownBodySchema>;

export type CanvasEntry = {
  id: string;
  payload: CanvasPayload;
  timestampMs: number;
};
