"use client";

import { lazy, Suspense } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { CanvasEntry } from "./types";

// ─── Lazy renderers ───────────────────────────────────────────────────────────

const ListRenderer = lazy(() =>
  import("./renderers/ListRenderer").then((m) => ({ default: m.ListRenderer }))
);
const DashboardRenderer = lazy(() =>
  import("./renderers/DashboardRenderer").then((m) => ({ default: m.DashboardRenderer }))
);
const KanbanRenderer = lazy(() =>
  import("./renderers/KanbanRenderer").then((m) => ({ default: m.KanbanRenderer }))
);
const WebpageRenderer = lazy(() =>
  import("./renderers/WebpageRenderer").then((m) => ({ default: m.WebpageRenderer }))
);
const ImageRenderer = lazy(() =>
  import("./renderers/ImageRenderer").then((m) => ({ default: m.ImageRenderer }))
);
const DetailRenderer = lazy(() =>
  import("./renderers/DetailRenderer").then((m) => ({ default: m.DetailRenderer }))
);
const SpreadsheetRenderer = lazy(() =>
  import("./renderers/SpreadsheetRenderer").then((m) => ({ default: m.SpreadsheetRenderer }))
);
const MarkdownRenderer = lazy(() =>
  import("./renderers/MarkdownRenderer").then((m) => ({ default: m.MarkdownRenderer }))
);
const FallbackRenderer = lazy(() =>
  import("./renderers/FallbackRenderer").then((m) => ({ default: m.FallbackRenderer }))
);

// ─── Props ────────────────────────────────────────────────────────────────────

type CanvasPaneProps = {
  entry: CanvasEntry | null;
  depth: number;
  totalEntries: number;
  onBack: () => void;
  onForward: () => void;
  onSendPrompt: (prompt: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const CanvasPane = ({
  entry,
  depth,
  totalEntries,
  onBack,
  onForward,
  onSendPrompt,
}: CanvasPaneProps) => {
  const header = entry?.payload.header;
  const body = entry?.payload.body;

  const canGoBack = depth < totalEntries - 1;
  const canGoForward = depth > 0;

  const displayTitle =
    header?.title ??
    (body?.type
      ? `${body.type.charAt(0).toUpperCase()}${body.type.slice(1)}`
      : "Canvas");

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="canvas-pane">
      {/* ── Header ── */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* Navigation arrows */}
          <div className="flex items-center">
            <button
              type="button"
              className="ui-btn-icon ui-btn-icon-xs disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onBack}
              disabled={!canGoBack}
              title="Previous canvas"
              aria-label="Previous canvas"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="ui-btn-icon ui-btn-icon-xs disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onForward}
              disabled={!canGoForward}
              title="Next canvas"
              aria-label="Next canvas"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Title + breadcrumbs */}
          <div className="min-w-0">
            {header?.breadcrumbs && header.breadcrumbs.length > 0 ? (
              <div className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground/70">
                {header.breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span aria-hidden="true">/</span>}
                    <span>{crumb}</span>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="truncate font-mono text-xs font-semibold text-foreground">
              {displayTitle}
            </div>
            {header?.subtitle ? (
              <div className="truncate font-mono text-[10px] text-muted-foreground/70">
                {header.subtitle}
              </div>
            ) : null}
          </div>

          {/* Entry counter */}
          {totalEntries > 1 ? (
            <span className="ml-1 shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/60">
              {totalEntries - depth}/{totalEntries}
            </span>
          ) : null}
        </div>

        {/* Action buttons */}
        {header?.actions && header.actions.length > 0 ? (
          <div className="ml-2 flex shrink-0 items-center gap-1">
            {header.actions.map((action, i) => (
              <button
                key={i}
                type="button"
                className={
                  action.primary
                    ? "ui-btn-primary !min-h-0 h-[30px] px-1.5 font-mono text-[10px]"
                    : "ui-btn-secondary !min-h-0 h-[30px] px-1.5 font-mono text-[10px]"
                }
                onClick={() => {
                  if (action.prompt) onSendPrompt(action.prompt);
                }}
                disabled={!action.prompt}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Body ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        {entry ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
              </div>
            }
          >
            {body?.type === "list" ? (
              <ListRenderer body={body} onSendPrompt={onSendPrompt} />
            ) : body?.type === "dashboard" ? (
              <DashboardRenderer body={body} onSendPrompt={onSendPrompt} />
            ) : body?.type === "kanban" ? (
              <KanbanRenderer body={body} onSendPrompt={onSendPrompt} />
            ) : body?.type === "webpage" ? (
              <WebpageRenderer body={body} />
            ) : body?.type === "image" ? (
              <ImageRenderer body={body} />
            ) : body?.type === "detail" ? (
              <DetailRenderer body={body} onSendPrompt={onSendPrompt} />
            ) : body?.type === "spreadsheet" ? (
              <SpreadsheetRenderer body={body} />
            ) : body?.type === "markdown" ? (
              <MarkdownRenderer body={body} />
            ) : (
              <FallbackRenderer payload={entry.payload} />
            )}
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-xs text-center">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Canvas
              </div>
              <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground/70">
                Ask the agent to display information as a canvas and it will appear here.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
