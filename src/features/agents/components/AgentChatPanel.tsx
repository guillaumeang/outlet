import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { AttachmentRef } from "@/lib/text/message-extract";
import { ALLOWED_UPLOAD_TYPES, uploadFile } from "@/lib/upload";
import type { AgentState as AgentRecord } from "@/features/agents/state/store";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Check, ChevronRight, Clock, Cog, FileText, Paperclip, Pencil, Plus, RefreshCw, Shuffle, Square, X } from "lucide-react";
import type { GatewayModelChoice } from "@/lib/gateway/models";
import { rewriteMediaLinesToMarkdown } from "@/lib/text/media-markdown";
import { normalizeAssistantDisplayText } from "@/lib/text/assistantText";
import { isNearBottom } from "@/lib/dom";
import { AgentAvatar } from "./AgentAvatar";
import type {
  ExecApprovalDecision,
  PendingExecApproval,
} from "@/features/agents/approvals/types";
import {
  buildAgentChatRenderBlocks,
  buildFinalAgentChatItems,
  summarizeToolLabel,
  type AssistantTraceEvent,
  type AgentChatItem,
} from "./chatItems";
import { hasCanvasBlock, stripCanvasBlocks } from "@/features/canvas/canvasParser";

// Hide ```canvas fenced blocks from chat — they are rendered in CanvasPane instead.
// The pre override swallows the entire <pre><code class="language-canvas">...</code></pre> subtree.
const CANVAS_MARKDOWN_COMPONENTS = {
  pre({ children, ...props }: React.HTMLAttributes<HTMLPreElement> & { children?: React.ReactNode }) {
    const child = Array.isArray(children) ? children[0] : children;
    if (
      child != null &&
      typeof child === "object" &&
      "props" in (child as object)
    ) {
      const codeProps = (child as { props?: Record<string, unknown> }).props;
      if (typeof codeProps?.className === "string" && codeProps.className.includes("language-canvas")) {
        return null;
      }
    }
    return <pre {...props}>{children}</pre>;
  },
} as const;

const formatChatTimestamp = (timestampMs: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(timestampMs));
};

const formatDurationLabel = (durationMs: number): string => {
  const seconds = durationMs / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.0s";
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
};

const formatTokenCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
};

const shortenModelName = (model: string): string => {
  // e.g. "claude-3-5-sonnet-20241022" → "claude-3.5-sonnet"
  // e.g. "claude-sonnet-4-20250514" → "claude-sonnet-4"
  const cleaned = model
    .replace(/-\d{8}$/, "") // strip date suffix
    .replace(/-\d{4}-\d{2}-\d{2}$/, ""); // strip date suffix variant
  return cleaned;
};

const SPINE_LEFT = "left-[15px]";
const ASSISTANT_GUTTER_CLASS = "pl-[44px]";
const ASSISTANT_MAX_WIDTH_DEFAULT_CLASS = "max-w-[68ch]";
const ASSISTANT_MAX_WIDTH_EXPANDED_CLASS = "max-w-[1120px]";
const CHAT_TOP_THRESHOLD_PX = 8;
const EMPTY_CHAT_INTRO_MESSAGES = [
  "How can I help you today?",
  "What should we accomplish today?",
  "Ready when you are. What do you want to tackle?",
  "What are we working on today?",
  "I'm here and ready. What's the plan?",
];

const stableStringHash = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const resolveEmptyChatIntroMessage = (agentId: string, sessionEpoch: number | undefined): string => {
  if (EMPTY_CHAT_INTRO_MESSAGES.length === 0) return "How can I help you today?";
  const normalizedEpoch =
    typeof sessionEpoch === "number" && Number.isFinite(sessionEpoch)
      ? Math.max(0, Math.trunc(sessionEpoch))
      : 0;
  const offset = stableStringHash(agentId) % EMPTY_CHAT_INTRO_MESSAGES.length;
  const index = (offset + normalizedEpoch) % EMPTY_CHAT_INTRO_MESSAGES.length;
  return EMPTY_CHAT_INTRO_MESSAGES[index];
};

const looksLikePath = (value: string): boolean => {
  if (!value) return false;
  if (/(^|[\s(])(?:[A-Za-z]:\\|~\/|\/)/.test(value)) return true;
  if (/(^|[\s(])(src|app|packages|components)\//.test(value)) return true;
  if (/(^|[\s(])[\w.-]+\.(ts|tsx|js|jsx|json|md|py|go|rs|java|kt|rb|sh|yaml|yml)\b/.test(value)) {
    return true;
  }
  return false;
};

const isStructuredMarkdown = (text: string): boolean => {
  if (!text) return false;
  if (/```/.test(text)) return true;
  if (/^\s*#{1,6}\s+/m.test(text)) return true;
  if (/^\s*[-*+]\s+/m.test(text)) return true;
  if (/^\s*\d+\.\s+/m.test(text)) return true;
  if (/^\s*\|.+\|\s*$/m.test(text)) return true;
  if (looksLikePath(text) && text.split("\n").filter(Boolean).length >= 3) return true;
  return false;
};

const resolveAssistantMaxWidthClass = (text: string | null | undefined): string => {
  const value = (text ?? "").trim();
  if (!value) return ASSISTANT_MAX_WIDTH_DEFAULT_CLASS;
  if (isStructuredMarkdown(value)) return ASSISTANT_MAX_WIDTH_EXPANDED_CLASS;
  const nonEmptyLines = value.split("\n").filter((line) => line.trim().length > 0);
  const shortLineCount = nonEmptyLines.filter((line) => line.trim().length <= 44).length;
  if (nonEmptyLines.length >= 10 && shortLineCount / Math.max(1, nonEmptyLines.length) >= 0.65) {
    return ASSISTANT_MAX_WIDTH_EXPANDED_CLASS;
  }
  return ASSISTANT_MAX_WIDTH_DEFAULT_CLASS;
};

type AgentChatPanelProps = {
  agent: AgentRecord;
  isSelected: boolean;
  canSend: boolean;
  models: GatewayModelChoice[];
  stopBusy: boolean;
  stopDisabledReason?: string | null;
  onLoadMoreHistory: () => void;
  onOpenSettings: () => void;
  onRename?: (name: string) => Promise<boolean>;
  onNewSession?: () => Promise<void> | void;
  onModelChange: (value: string | null) => void;
  onThinkingChange: (value: string | null) => void;
  onToolCallingToggle?: (enabled: boolean) => void;
  onThinkingTracesToggle?: (enabled: boolean) => void;
  onDraftChange: (value: string) => void;
  onSend: (message: string, attachments?: AttachmentRef[]) => void;
  onStopRun: () => void;
  onAvatarShuffle: () => void;
  pendingExecApprovals?: PendingExecApproval[];
  onResolveExecApproval?: (id: string, decision: ExecApprovalDecision) => void;
};

const formatApprovalExpiry = (timestampMs: number): string => {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestampMs));
};

const ExecApprovalCard = memo(function ExecApprovalCard({
  approval,
  onResolve,
}: {
  approval: PendingExecApproval;
  onResolve?: (id: string, decision: ExecApprovalDecision) => void;
}) {
  const disabled = approval.resolving || !onResolve;
  return (
    <div
      className={`w-full ${ASSISTANT_MAX_WIDTH_EXPANDED_CLASS} ${ASSISTANT_GUTTER_CLASS} ui-badge-approval self-start rounded-md px-3 py-2 shadow-2xs`}
      data-testid={`exec-approval-card-${approval.id}`}
    >
      <div className="type-meta">
        Exec approval required
      </div>
      <div className="mt-2 rounded-md bg-surface-3 px-2 py-1.5 shadow-2xs">
        <div className="font-mono text-[10px] font-semibold text-foreground">{approval.command}</div>
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        <div>Host: {approval.host ?? "unknown"}</div>
        <div>Expires: {formatApprovalExpiry(approval.expiresAtMs)}</div>
        {approval.cwd ? <div className="sm:col-span-2">CWD: {approval.cwd}</div> : null}
      </div>
      {approval.error ? (
        <div className="ui-alert-danger mt-2 rounded-md px-2 py-1 text-[11px] shadow-2xs">
          {approval.error}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-border/70 bg-surface-3 px-2.5 py-1 font-mono text-[12px] font-medium tracking-[0.02em] text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onResolve?.(approval.id, "allow-once")}
          disabled={disabled}
          aria-label={`Allow once for exec approval ${approval.id}`}
        >
          Allow once
        </button>
        <button
          type="button"
          className="rounded-md border border-border/70 bg-surface-3 px-2.5 py-1 font-mono text-[12px] font-medium tracking-[0.02em] text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onResolve?.(approval.id, "allow-always")}
          disabled={disabled}
          aria-label={`Always allow for exec approval ${approval.id}`}
        >
          Always allow
        </button>
        <button
          type="button"
          className="ui-btn-danger rounded-md px-2.5 py-1 font-mono text-[12px] font-medium tracking-[0.02em] transition disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onResolve?.(approval.id, "deny")}
          disabled={disabled}
          aria-label={`Deny exec approval ${approval.id}`}
        >
          Deny
        </button>
      </div>
    </div>
  );
});

const ToolCallDetails = memo(function ToolCallDetails({
  line,
  className,
}: {
  line: string;
  className?: string;
}) {
  const { summaryText, body, inlineOnly } = summarizeToolLabel(line);
  const [open, setOpen] = useState(false);
  const resolvedClassName =
    className ??
    `w-full ${ASSISTANT_MAX_WIDTH_EXPANDED_CLASS} ${ASSISTANT_GUTTER_CLASS} self-start rounded-md bg-surface-3 px-2 py-1 text-[10px] text-muted-foreground shadow-2xs`;
  if (inlineOnly) {
    return (
      <div className={resolvedClassName}>
        <div className="font-mono text-[10px] font-semibold tracking-[0.11em]">{summaryText}</div>
      </div>
    );
  }
  return (
    <details open={open} className={resolvedClassName}>
      <summary
        className="cursor-pointer select-none font-mono text-[10px] font-semibold tracking-[0.11em]"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        {summaryText}
      </summary>
      {open && body ? (
        <div className="agent-markdown agent-tool-markdown mt-1 text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {rewriteMediaLinesToMarkdown(body)}
          </ReactMarkdown>
        </div>
      ) : null}
    </details>
  );
});

const ThinkingDetailsRow = memo(function ThinkingDetailsRow({
  events,
  thinkingText,
  toolLines = [],
  durationMs,
  showTyping,
}: {
  events?: AssistantTraceEvent[];
  thinkingText?: string | null;
  toolLines?: string[];
  durationMs?: number;
  showTyping?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const traceEvents = (() => {
    if (events && events.length > 0) return events;
    const normalizedThinkingText = thinkingText?.trim() ?? "";
    const next: AssistantTraceEvent[] = [];
    if (normalizedThinkingText) {
      next.push({ kind: "thinking", text: normalizedThinkingText });
    }
    for (const line of toolLines) {
      next.push({ kind: "tool", text: line });
    }
    return next;
  })();
  if (traceEvents.length === 0) return null;
  return (
    <details
      open={open}
      className="ui-chat-thinking group rounded-md px-2 py-1.5 text-[10px] shadow-2xs"
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-2 opacity-65 [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        <ChevronRight className="h-3 w-3 shrink-0 transition group-open:rotate-90" />
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[10px] font-medium tracking-[0.02em]">
            Thinking (internal)
          </span>
          {typeof durationMs === "number" ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium tracking-[0.02em] text-muted-foreground/80">
              <Clock className="h-3 w-3" />
              {formatDurationLabel(durationMs)}
            </span>
          ) : null}
          {showTyping ? (
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </span>
      </summary>
      {open ? (
        <div className="mt-2 space-y-2 pl-5">
          {traceEvents.map((event, index) =>
            event.kind === "thinking" ? (
              <div
                key={`thinking-event-${index}-${event.text.slice(0, 48)}`}
                className="agent-markdown min-w-0 text-foreground/85"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.text}</ReactMarkdown>
              </div>
            ) : (
              <ToolCallDetails
                key={`thinking-tool-${index}-${event.text.slice(0, 48)}`}
                line={event.text}
                className="rounded-md border border-border/45 bg-surface-2/65 px-2 py-1 text-[10px] text-muted-foreground/90 shadow-2xs"
              />
            )
          )}
        </div>
      ) : null}
    </details>
  );
});

const UserMessageCard = memo(function UserMessageCard({
  text,
  timestampMs,
}: {
  text: string;
  timestampMs?: number;
}) {
  return (
    <div className="ui-chat-user-card w-full max-w-[70ch] self-end overflow-hidden rounded-[var(--radius-small)] bg-[color:var(--chat-user-bg)]">
      <div className="flex items-center justify-between gap-3 bg-[color:var(--chat-user-header-bg)] px-3 py-2 dark:px-3.5 dark:py-2.5">
        <div className="type-meta min-w-0 truncate font-mono text-foreground/90">
          You
        </div>
        {typeof timestampMs === "number" ? (
          <time className="type-meta shrink-0 rounded-md bg-surface-3 px-2 py-0.5 font-mono text-muted-foreground/70">
            {formatChatTimestamp(timestampMs)}
          </time>
        ) : null}
      </div>
      <div className="agent-markdown type-body px-3 py-3 text-foreground dark:px-3.5 dark:py-3.5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    </div>
  );
});

const UserMediaCard = memo(function UserMediaCard({
  path,
  mime,
  filename,
}: {
  path: string;
  mime: string;
  filename: string;
}) {
  const isImage = mime.startsWith("image/");
  const mediaUrl = `/api/gateway/media?path=${encodeURIComponent(path)}`;
  return (
    <div className="flex w-full max-w-[70ch] justify-end self-end">
      {isImage ? (
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={mediaUrl}
            alt={filename}
            className="max-h-[280px] rounded-[var(--radius-small)] border border-border/40 object-contain"
          />
        </a>
      ) : (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-[var(--radius-small)] border border-border/40 bg-[color:var(--chat-user-bg)] px-3 py-2 text-sm text-foreground transition hover:bg-[color:var(--chat-user-header-bg)]"
        >
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{filename}</span>
        </a>
      )}
    </div>
  );
});

const AssistantMessageCard = memo(function AssistantMessageCard({
  avatarSeed,
  avatarUrl,
  name,
  timestampMs,
  thinkingEvents,
  thinkingText,
  thinkingToolLines,
  thinkingDurationMs,
  contentText,
  streaming,
  model,
  inputTokens,
  outputTokens,
}: {
  avatarSeed: string;
  avatarUrl: string | null;
  name: string;
  timestampMs?: number;
  thinkingEvents?: AssistantTraceEvent[];
  thinkingText?: string | null;
  thinkingToolLines?: string[];
  thinkingDurationMs?: number;
  contentText?: string | null;
  streaming?: boolean;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}) {
  const resolvedTimestamp = typeof timestampMs === "number" ? timestampMs : null;
  const hasThinking = Boolean(
    (thinkingEvents?.length ?? 0) > 0 ||
      thinkingText?.trim() ||
      (thinkingToolLines?.length ?? 0) > 0
  );
  const widthClass = hasThinking
    ? ASSISTANT_MAX_WIDTH_EXPANDED_CLASS
    : resolveAssistantMaxWidthClass(contentText);
  const hasContent = Boolean(contentText?.trim());
  const compactStreamingIndicator = Boolean(streaming && !hasThinking && !hasContent);

  return (
    <div className="w-full self-start">
      <div className={`relative w-full ${widthClass} ${ASSISTANT_GUTTER_CLASS}`}>
        <div className="absolute left-[4px] top-[2px]">
          <AgentAvatar seed={avatarSeed} name={name} avatarUrl={avatarUrl} size={22} />
        </div>
        <div className="flex items-center justify-between gap-3 py-0.5">
          <div className="type-meta min-w-0 truncate font-mono text-foreground/90">
            {name}
          </div>
          {resolvedTimestamp !== null ? (
            <time className="type-meta shrink-0 rounded-md bg-surface-3 px-2 py-0.5 font-mono text-muted-foreground/90">
              {formatChatTimestamp(resolvedTimestamp)}
            </time>
          ) : null}
        </div>

        {compactStreamingIndicator ? (
          <div
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-surface-3 px-3 py-2 text-[10px] text-muted-foreground/80 shadow-2xs"
            role="status"
            aria-live="polite"
            data-testid="agent-typing-indicator"
          >
            <span className="font-mono text-[10px] font-medium tracking-[0.02em]">
              Thinking
            </span>
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        ) : (
          <div className="mt-2 space-y-3 dark:space-y-5">
            {streaming && !hasThinking ? (
              <div
                className="flex items-center gap-2 text-[10px] text-muted-foreground/80"
                role="status"
                aria-live="polite"
                data-testid="agent-typing-indicator"
              >
                <span className="font-mono text-[10px] font-medium tracking-[0.02em]">
                  Thinking
                </span>
                <span className="typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ) : null}

            {hasThinking ? (
              <ThinkingDetailsRow
                events={thinkingEvents}
                thinkingText={thinkingText}
                toolLines={thinkingToolLines ?? []}
                durationMs={thinkingDurationMs}
                showTyping={streaming}
              />
            ) : null}

            {contentText ? (
              <div className="ui-chat-assistant-card relative pb-[1.2rem]">
                {streaming ? (
                  (() => {
                    const displayText = stripCanvasBlocks(contentText);
                    if (!displayText) return null;
                    if (!displayText.includes("MEDIA:")) {
                      return (
                        <div className="whitespace-pre-wrap break-words text-foreground">
                          {displayText}
                        </div>
                      );
                    }
                    const rewritten = rewriteMediaLinesToMarkdown(displayText);
                    if (!rewritten.includes("![](")) {
                      return (
                        <div className="whitespace-pre-wrap break-words text-foreground">
                          {displayText}
                        </div>
                      );
                    }
                    return (
                      <div className="agent-markdown text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={CANVAS_MARKDOWN_COMPONENTS}>{rewritten}</ReactMarkdown>
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const displayText = stripCanvasBlocks(contentText);
                    if (!displayText) return null;
                    return (
                      <div className="agent-markdown text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={CANVAS_MARKDOWN_COMPONENTS}>
                          {rewriteMediaLinesToMarkdown(displayText)}
                        </ReactMarkdown>
                      </div>
                    );
                  })()
                )}
                <div>
                  {!streaming && hasCanvasBlock(contentText) ? (
                    <div className="absolute bottom-[0.3rem] left-[1.08rem] flex items-center gap-1 font-mono text-[9px] leading-none text-muted-foreground/50 dark:left-[1.2rem]">
                      <span className="flex h-[9px] w-[9px] items-center justify-center rounded-full ring-[1px] ring-current">
                        <Plus className="h-[7px] w-[7px]" strokeWidth={2.5} aria-hidden="true" />
                      </span>
                      outlet added
                    </div>
                  ) : null}
                  {!streaming && (model || typeof inputTokens === "number" || typeof outputTokens === "number") ? (
                    <div className="absolute bottom-[0.3rem] right-[1.08rem] flex items-center gap-1.5 font-mono text-[9px] leading-none text-muted-foreground/50 dark:right-[1.2rem]">
                      {model ? <span>{shortenModelName(model)}</span> : null}
                      {model && (typeof inputTokens === "number" || typeof outputTokens === "number") ? (
                        <span aria-hidden="true">·</span>
                      ) : null}
                      {typeof inputTokens === "number" || typeof outputTokens === "number" ? (
                        <span>
                          {typeof inputTokens === "number" ? `${formatTokenCount(inputTokens)} in` : ""}
                          {typeof inputTokens === "number" && typeof outputTokens === "number" ? " / " : ""}
                          {typeof outputTokens === "number" ? `${formatTokenCount(outputTokens)} out` : ""}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

const AssistantIntroCard = memo(function AssistantIntroCard({
  avatarSeed,
  avatarUrl,
  name,
  title,
}: {
  avatarSeed: string;
  avatarUrl: string | null;
  name: string;
  title: string;
}) {
  return (
    <div className="w-full self-start">
      <div className={`relative w-full ${ASSISTANT_MAX_WIDTH_DEFAULT_CLASS} ${ASSISTANT_GUTTER_CLASS}`}>
        <div className="absolute left-[4px] top-[2px]">
          <AgentAvatar seed={avatarSeed} name={name} avatarUrl={avatarUrl} size={22} />
        </div>
        <div className="flex items-center justify-between gap-3 py-0.5">
          <div className="type-meta min-w-0 truncate font-mono text-foreground/90">
            {name}
          </div>
        </div>
        <div className="ui-chat-assistant-card mt-2">
          <div className="text-[14px] leading-[1.65] text-foreground">{title}</div>
          <div className="mt-2 font-mono text-[10px] tracking-[0.03em] text-muted-foreground/80">
            Try describing a task, bug, or question to get started.
          </div>
        </div>
      </div>
    </div>
  );
});

const AgentChatFinalItems = memo(function AgentChatFinalItems({
  agentId,
  name,
  avatarSeed,
  avatarUrl,
  chatItems,
  running,
  runStartedAt,
}: {
  agentId: string;
  name: string;
  avatarSeed: string;
  avatarUrl: string | null;
  chatItems: AgentChatItem[];
  running: boolean;
  runStartedAt: number | null;
}) {
  const blocks = buildAgentChatRenderBlocks(chatItems);

  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "user") {
          return (
            <UserMessageCard
              key={`chat-${agentId}-user-${index}`}
              text={block.text}
              timestampMs={block.timestampMs}
            />
          );
        }
        if (block.kind === "user-media") {
          return (
            <UserMediaCard
              key={`chat-${agentId}-media-${index}`}
              path={block.path}
              mime={block.mime}
              filename={block.filename}
            />
          );
        }
        const streaming = running && index === blocks.length - 1 && !block.text;
        return (
          <AssistantMessageCard
            key={`chat-${agentId}-assistant-${index}`}
            avatarSeed={avatarSeed}
            avatarUrl={avatarUrl}
            name={name}
            timestampMs={block.timestampMs ?? (streaming ? runStartedAt ?? undefined : undefined)}
            thinkingEvents={block.traceEvents}
            thinkingDurationMs={block.thinkingDurationMs}
            contentText={block.text}
            streaming={streaming}
            model={block.model}
            inputTokens={block.inputTokens}
            outputTokens={block.outputTokens}
          />
        );
      })}
    </>
  );
});

const AgentChatTranscript = memo(function AgentChatTranscript({
  agentId,
  name,
  avatarSeed,
  avatarUrl,
  status,
  historyMaybeTruncated,
  historyFetchedCount,
  historyFetchLimit,
  onLoadMoreHistory,
  chatItems,
  liveThinkingText,
  liveAssistantText,
  showTypingIndicator,
  outputLineCount,
  liveAssistantCharCount,
  liveThinkingCharCount,
  runStartedAt,
  scrollToBottomNextOutputRef,
  pendingExecApprovals,
  onResolveExecApproval,
  emptyStateTitle,
}: {
  agentId: string;
  name: string;
  avatarSeed: string;
  avatarUrl: string | null;
  status: AgentRecord["status"];
  historyMaybeTruncated: boolean;
  historyFetchedCount: number | null;
  historyFetchLimit: number | null;
  onLoadMoreHistory: () => void;
  chatItems: AgentChatItem[];
  liveThinkingText: string;
  liveAssistantText: string;
  showTypingIndicator: boolean;
  outputLineCount: number;
  liveAssistantCharCount: number;
  liveThinkingCharCount: number;
  runStartedAt: number | null;
  scrollToBottomNextOutputRef: MutableRefObject<boolean>;
  pendingExecApprovals: PendingExecApproval[];
  onResolveExecApproval?: (id: string, decision: ExecApprovalDecision) => void;
  emptyStateTitle: string;
}) {
  const chatRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  const scrollChatToBottom = useCallback(() => {
    if (!chatRef.current) return;
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ block: "end" });
      return;
    }
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, []);

  const setPinned = useCallback((nextPinned: boolean) => {
    if (pinnedRef.current === nextPinned) return;
    pinnedRef.current = nextPinned;
    setIsPinned(nextPinned);
  }, []);

  const updatePinnedFromScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    const nextAtTop = el.scrollTop <= CHAT_TOP_THRESHOLD_PX;
    setIsAtTop((current) => (current === nextAtTop ? current : nextAtTop));
    setPinned(
      isNearBottom(
        {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        },
        48
      )
    );
  }, [setPinned]);

  const scheduleScrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollChatToBottom();
    });
  }, [scrollChatToBottom]);

  useEffect(() => {
    updatePinnedFromScroll();
  }, [updatePinnedFromScroll]);

  const showJumpToLatest =
    !isPinned && (outputLineCount > 0 || liveAssistantCharCount > 0 || liveThinkingCharCount > 0);

  useEffect(() => {
    const shouldForceScroll = scrollToBottomNextOutputRef.current;
    if (shouldForceScroll) {
      scrollToBottomNextOutputRef.current = false;
      scheduleScrollToBottom();
      return;
    }

    if (pinnedRef.current) {
      scheduleScrollToBottom();
      return;
    }
  }, [
    liveAssistantCharCount,
    liveThinkingCharCount,
    outputLineCount,
    pendingExecApprovals.length,
    scheduleScrollToBottom,
    scrollToBottomNextOutputRef,
  ]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, []);

  const showLiveAssistantCard =
    status === "running" && Boolean(liveThinkingText || liveAssistantText || showTypingIndicator);
  const hasApprovals = pendingExecApprovals.length > 0;
  const hasTranscriptContent = chatItems.length > 0 || hasApprovals;

  useEffect(() => {
    if (status !== "running" || typeof runStartedAt !== "number" || !showLiveAssistantCard) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now());
    }, 0);
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [runStartedAt, showLiveAssistantCard, status]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={chatRef}
        data-testid="agent-chat-scroll"
        className={`ui-chat-scroll ui-chat-scroll-borderless h-full overflow-auto p-4 dark:p-6 sm:p-5 dark:sm:p-7 ${showJumpToLatest ? "pb-20" : ""}`}
        onScroll={() => updatePinnedFromScroll()}
        onWheel={(event) => {
          event.stopPropagation();
        }}
        onWheelCapture={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="relative flex flex-col gap-6 dark:gap-8 text-[14px] leading-[1.65] text-foreground">
          <div aria-hidden className={`pointer-events-none absolute -z-10 ${SPINE_LEFT} top-0 bottom-0 w-px bg-border/40`} />
          {historyMaybeTruncated && isAtTop ? (
            <div className="-mx-1 flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2 shadow-2xs">
              <div className="type-meta min-w-0 truncate font-mono text-muted-foreground">
                Showing most recent {typeof historyFetchedCount === "number" ? historyFetchedCount : "?"} messages
                {typeof historyFetchLimit === "number" ? ` (limit ${historyFetchLimit})` : ""}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md border border-border/70 bg-surface-3 px-3 py-1.5 font-mono text-[12px] font-medium tracking-[0.02em] text-foreground transition hover:bg-surface-2"
                onClick={onLoadMoreHistory}
              >
                Load more
              </button>
            </div>
          ) : null}
          {!hasTranscriptContent ? (
            <AssistantIntroCard
              avatarSeed={avatarSeed}
              avatarUrl={avatarUrl}
              name={name}
              title={emptyStateTitle}
            />
          ) : (
            <>
              <AgentChatFinalItems
                agentId={agentId}
                name={name}
                avatarSeed={avatarSeed}
                avatarUrl={avatarUrl}
                chatItems={chatItems}
                running={status === "running"}
                runStartedAt={runStartedAt}
              />
              {showLiveAssistantCard ? (
                <AssistantMessageCard
                  avatarSeed={avatarSeed}
                  avatarUrl={avatarUrl}
                  name={name}
                  timestampMs={runStartedAt ?? undefined}
                  thinkingText={liveThinkingText || null}
                  thinkingDurationMs={
                    typeof runStartedAt === "number" && typeof nowMs === "number"
                      ? Math.max(0, nowMs - runStartedAt)
                      : undefined
                  }
                  contentText={liveAssistantText || null}
                  streaming={status === "running"}
                />
              ) : null}
              {pendingExecApprovals.map((approval) => (
                <ExecApprovalCard
                  key={approval.id}
                  approval={approval}
                  onResolve={onResolveExecApproval}
                />
              ))}
              <div ref={chatBottomRef} />
            </>
          )}
        </div>
      </div>

      {showJumpToLatest ? (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border/70 bg-card px-3 py-1.5 font-mono text-[12px] font-medium tracking-[0.02em] text-foreground shadow-xs transition hover:bg-surface-2"
          onClick={() => {
            setPinned(true);
            scrollChatToBottom();
          }}
          aria-label="Jump to latest"
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
});

const noopToggle = () => {};

const InlineHoverTooltip = ({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) => {
  return (
    <div className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-7 left-1/2 z-20 w-max max-w-none -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-card px-2 py-1 font-mono text-[10px] text-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
      >
        {text}
      </span>
    </div>
  );
};

// ─── Attachment upload helper ─────────────────────────────────────────────────

type PendingAttachment = AttachmentRef & { id: string; previewUrl?: string; displayName: string };

let attachmentCounter = 0;
function nextAttachmentId(): string {
  return `att-${Date.now()}-${++attachmentCounter}`;
}

const AgentChatComposer = memo(function AgentChatComposer({
  value,
  onChange,
  onKeyDown,
  onSend,
  onStop,
  canSend,
  stopBusy,
  stopDisabledReason,
  running,
  sendDisabled,
  inputRef,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  modelOptions,
  modelValue,
  allowThinking,
  thinkingValue,
  onModelChange,
  onThinkingChange,
  toolCallingEnabled,
  showThinkingTraces,
  onToolCallingToggle,
  onThinkingTracesToggle,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  canSend: boolean;
  stopBusy: boolean;
  stopDisabledReason?: string | null;
  running: boolean;
  sendDisabled: boolean;
  inputRef: (el: HTMLTextAreaElement | HTMLInputElement | null) => void;
  attachments: PendingAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (index: number) => void;
  modelOptions: { value: string; label: string }[];
  modelValue: string;
  allowThinking: boolean;
  thinkingValue: string;
  onModelChange: (value: string | null) => void;
  onThinkingChange: (value: string | null) => void;
  toolCallingEnabled: boolean;
  showThinkingTraces: boolean;
  onToolCallingToggle: (enabled: boolean) => void;
  onThinkingTracesToggle: (enabled: boolean) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files).filter((f) => ALLOWED_UPLOAD_TYPES.has(f.type));
      if (files.length > 0) {
        e.preventDefault();
        onAddFiles(files);
      }
    },
    [onAddFiles],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => ALLOWED_UPLOAD_TYPES.has(f.type));
      if (files.length > 0) onAddFiles(files);
    },
    [onAddFiles],
  );

  const stopReason = stopDisabledReason?.trim() ?? "";
  const stopDisabled = !canSend || stopBusy || Boolean(stopReason);
  const stopAriaLabel = stopReason ? `Stop unavailable: ${stopReason}` : "Stop";
  const modelSelectedLabel = useMemo(() => {
    if (modelOptions.length === 0) return "No models found";
    return modelOptions.find((option) => option.value === modelValue)?.label ?? modelValue;
  }, [modelOptions, modelValue]);
  const modelSelectWidthCh = Math.max(11, Math.min(44, modelSelectedLabel.length + 6));
  const thinkingSelectedLabel = useMemo(() => {
    switch (thinkingValue) {
      case "off":
        return "Off";
      case "minimal":
        return "Minimal";
      case "low":
        return "Low";
      case "medium":
        return "Medium";
      case "high":
        return "High";
      case "xhigh":
        return "XHigh";
      default:
        return "Default";
    }
  }, [thinkingValue]);
  const thinkingSelectWidthCh = Math.max(9, Math.min(22, thinkingSelectedLabel.length + 6));
  return (
    <div
      className={`rounded-2xl border bg-surface-2/45 px-3 py-2 transition ${dragOver ? "border-primary/60 ring-1 ring-primary/30" : "border-border/65"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Attachment previews */}
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((att, i) => (
            <div
              key={att.id}
              className="group/att relative flex items-center gap-1.5 rounded-md border border-border/50 bg-surface-3 px-2 py-1"
            >
              {att.previewUrl ? (
                <img src={att.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
              ) : att.path ? (
                <FileText className="h-4 w-4 text-muted-foreground" />
              ) : (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate font-mono text-[10px] text-muted-foreground">
                {att.displayName}
              </span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onRemoveAttachment(i)}
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).filter((f) => ALLOWED_UPLOAD_TYPES.has(f.type));
            if (files.length > 0) onAddFiles(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
          title="Attach image or PDF"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          ref={inputRef}
          rows={2}
          value={value}
          className="chat-composer-input min-h-[48px] flex-1 resize-none border-0 bg-transparent px-0 py-1 text-[15px] leading-6 text-foreground outline-none shadow-none transition placeholder:text-muted-foreground/65 focus:outline-none focus-visible:outline-none focus-visible:ring-0"
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          placeholder="type a message"
        />
        {running ? (
          <button
            className="ui-btn-icon-danger flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--danger-soft-border)] transition disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            onClick={onStop}
            disabled={stopDisabled}
            aria-label={stopAriaLabel}
            title={stopReason || "Stop (Esc)"}
          >
            <Square className={`h-3.5 w-3.5 fill-current ${stopBusy ? "animate-pulse" : ""}`} />
          </button>
        ) : null}
        <button
          className="ui-btn-primary !min-h-0 flex h-7 w-7 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label="Send"
          title="Send"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <InlineHoverTooltip text="Choose model">
            <select
              className="ui-input ui-control-important h-6 min-w-0 rounded-md px-1.5 text-[10px] font-semibold text-foreground"
              aria-label="Model"
              value={modelValue}
              style={{ width: `${modelSelectWidthCh}ch` }}
              onChange={(event) => {
                const nextValue = event.target.value.trim();
                onModelChange(nextValue ? nextValue : null);
                event.currentTarget.blur();
              }}
            >
              {modelOptions.length === 0 ? (
                <option value="">No models found</option>
              ) : null}
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </InlineHoverTooltip>
          {allowThinking ? (
            <InlineHoverTooltip text="Select reasoning effort">
              <select
                className="ui-input ui-control-important h-6 rounded-md px-1.5 text-[10px] font-semibold text-foreground"
                aria-label="Thinking"
                value={thinkingValue}
                style={{ width: `${thinkingSelectWidthCh}ch` }}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  onThinkingChange(nextValue ? nextValue : null);
                }}
              >
                <option value="">Default</option>
                <option value="off">Off</option>
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">XHigh</option>
              </select>
            </InlineHoverTooltip>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-mono tracking-[0.02em]">Show</span>
          <button
            type="button"
            role="switch"
            aria-label="Show tool calls"
            aria-checked={toolCallingEnabled}
            className={`inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] tracking-[0.01em] transition ${
              toolCallingEnabled
                ? "border-primary/45 bg-primary/14 text-foreground"
                : "border-border/70 bg-surface-2/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onToolCallingToggle(!toolCallingEnabled)}
          >
            Tools
          </button>
          <button
            type="button"
            role="switch"
            aria-label="Show thinking"
            aria-checked={showThinkingTraces}
            className={`inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] tracking-[0.01em] transition ${
              showThinkingTraces
                ? "border-primary/45 bg-primary/14 text-foreground"
                : "border-border/70 bg-surface-2/40 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onThinkingTracesToggle(!showThinkingTraces)}
          >
            Thinking
          </button>
        </div>
      </div>
    </div>
  );
});

export const AgentChatPanel = ({
  agent,
  isSelected,
  canSend,
  models,
  stopBusy,
  stopDisabledReason = null,
  onLoadMoreHistory,
  onOpenSettings,
  onRename,
  onNewSession,
  onModelChange,
  onThinkingChange,
  onToolCallingToggle = noopToggle,
  onThinkingTracesToggle = noopToggle,
  onDraftChange,
  onSend,
  onStopRun,
  onAvatarShuffle,
  pendingExecApprovals = [],
  onResolveExecApproval,
}: AgentChatPanelProps) => {
  const [draftValue, setDraftValue] = useState(agent.draft);
  const promptHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const savedDraftRef = useRef("");
  const historyInitRef = useRef(false);
  const [newSessionBusy, setNewSessionBusy] = useState(false);
  const [renameEditing, setRenameEditing] = useState(false);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameDraft, setRenameDraft] = useState(agent.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameEditorRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottomNextOutputRef = useRef(false);
  const plainDraftRef = useRef(agent.draft);
  const draftIdentityRef = useRef<{ agentId: string; sessionKey: string }>({
    agentId: agent.agentId,
    sessionKey: agent.sessionKey,
  });
  const pendingResizeFrameRef = useRef<number | null>(null);

  const resizeDraft = useCallback(() => {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
  }, []);

  const handleDraftRef = useCallback((el: HTMLTextAreaElement | HTMLInputElement | null) => {
    draftRef.current = el instanceof HTMLTextAreaElement ? el : null;
  }, []);

  useEffect(() => {
    const previousIdentity = draftIdentityRef.current;
    const identityChanged =
      previousIdentity.agentId !== agent.agentId ||
      previousIdentity.sessionKey !== agent.sessionKey;
    if (identityChanged) {
      draftIdentityRef.current = {
        agentId: agent.agentId,
        sessionKey: agent.sessionKey,
      };
      plainDraftRef.current = agent.draft;
      setDraftValue(agent.draft);
      return;
    }
    if (agent.draft === plainDraftRef.current) return;
    if (agent.draft.length !== 0) return;
    plainDraftRef.current = "";
    setDraftValue("");
  }, [agent.agentId, agent.draft, agent.sessionKey]);

  // Seed prompt history from existing outputLines (user messages start with "> ")
  useEffect(() => {
    if (historyInitRef.current) return;
    if (agent.outputLines.length === 0) return;
    historyInitRef.current = true;
    const userMessages: string[] = [];
    for (const line of agent.outputLines) {
      if (line.startsWith("> ")) {
        userMessages.push(line.slice(2).trim());
      }
    }
    promptHistoryRef.current = userMessages.reverse();
  }, [agent.outputLines]);

  // Reset history when agent or session changes
  useEffect(() => {
    promptHistoryRef.current = [];
    historyIndexRef.current = -1;
    savedDraftRef.current = "";
    historyInitRef.current = false;
  }, [agent.agentId, agent.sessionKey]);

  useEffect(() => {
    setRenameEditing(false);
    setRenameSaving(false);
    setRenameError(null);
    setRenameDraft(agent.name);
  }, [agent.agentId, agent.name]);

  useEffect(() => {
    if (!renameEditing) return;
    const frameId = requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [renameEditing]);

  useEffect(() => {
    if (pendingResizeFrameRef.current !== null) {
      cancelAnimationFrame(pendingResizeFrameRef.current);
    }
    pendingResizeFrameRef.current = requestAnimationFrame(() => {
      pendingResizeFrameRef.current = null;
      resizeDraft();
    });
    return () => {
      if (pendingResizeFrameRef.current !== null) {
        cancelAnimationFrame(pendingResizeFrameRef.current);
        pendingResizeFrameRef.current = null;
      }
    };
  }, [resizeDraft, draftValue]);

  const handleAddFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const id = nextAttachmentId();
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        const placeholder: PendingAttachment = {
          id,
          path: "",
          mime: file.type,
          filename: file.name,
          displayName: file.name,
          previewUrl,
        };
        setPendingAttachments((prev) => [...prev, placeholder]);
        uploadFile(file)
          .then((ref) => {
            setPendingAttachments((prev) =>
              prev.map((att) =>
                att.id === id
                  ? { ...att, path: ref.path, mime: ref.mime, filename: ref.filename }
                  : att,
              ),
            );
          })
          .catch((err) => {
            console.error("[attachment] upload failed:", err);
            setPendingAttachments((prev) => prev.filter((att) => att.id !== id));
            if (previewUrl) URL.revokeObjectURL(previewUrl);
          });
      }
    },
    [],
  );

  const handleRemoveAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => {
      const att = prev[index];
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleSend = useCallback(
    (message: string) => {
      if (!canSend || agent.status === "running") return;
      const trimmed = message.trim();
      const atts = pendingAttachments.filter((a) => a.path);
      if (!trimmed && atts.length === 0) return;
      if (trimmed) promptHistoryRef.current.unshift(trimmed);
      historyIndexRef.current = -1;
      savedDraftRef.current = "";
      plainDraftRef.current = "";
      setDraftValue("");
      onDraftChange("");
      // Revoke preview URLs and clear attachments
      for (const att of pendingAttachments) {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
      }
      setPendingAttachments([]);
      scrollToBottomNextOutputRef.current = true;
      onSend(trimmed || "(attached file)", atts.length > 0 ? atts : undefined);
    },
    [agent.status, canSend, onDraftChange, onSend, pendingAttachments]
  );

  const chatItems = useMemo(
    () =>
      buildFinalAgentChatItems({
        outputLines: agent.outputLines,
        showThinkingTraces: agent.showThinkingTraces,
        toolCallingEnabled: agent.toolCallingEnabled,
      }),
    [agent.outputLines, agent.showThinkingTraces, agent.toolCallingEnabled]
  );
  const running = agent.status === "running";
  const renderBlocks = useMemo(() => buildAgentChatRenderBlocks(chatItems), [chatItems]);
  const lastRenderBlock = renderBlocks.length > 0 ? renderBlocks[renderBlocks.length - 1] : null;
  const hasActiveStreamingTailInTranscript =
    running && lastRenderBlock !== null && lastRenderBlock.kind === "assistant" && !lastRenderBlock.text;
  const liveAssistantText =
    running && agent.streamText ? normalizeAssistantDisplayText(agent.streamText) : "";
  const liveThinkingText =
    running && agent.showThinkingTraces && agent.thinkingTrace ? agent.thinkingTrace.trim() : "";
  const hasVisibleLiveThinking = Boolean(liveThinkingText.trim());
  const showTypingIndicator =
    running &&
    !hasVisibleLiveThinking &&
    !liveAssistantText &&
    !hasActiveStreamingTailInTranscript;

  const modelOptions = useMemo(
    () =>
      models.map((entry) => {
        const key = `${entry.provider}/${entry.id}`;
        const alias = typeof entry.name === "string" ? entry.name.trim() : "";
        return {
          value: key,
          label: !alias || alias === key ? key : alias,
          reasoning: entry.reasoning,
        };
      }),
    [models]
  );
  const modelValue = agent.model ?? "";
  const modelOptionsWithFallback =
    modelValue && !modelOptions.some((option) => option.value === modelValue)
      ? [{ value: modelValue, label: modelValue, reasoning: undefined }, ...modelOptions]
      : modelOptions;
  const selectedModel = modelOptionsWithFallback.find((option) => option.value === modelValue);
  const allowThinking = selectedModel?.reasoning !== false;

  const avatarSeed = agent.avatarSeed ?? agent.agentId;
  const emptyStateTitle = useMemo(
    () => resolveEmptyChatIntroMessage(agent.agentId, agent.sessionEpoch),
    [agent.agentId, agent.sessionEpoch]
  );
  const hasReadyAttachments = pendingAttachments.some((a) => a.path);
  const sendDisabled = !canSend || running || (!draftValue.trim() && !hasReadyAttachments);

  const handleComposerChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value;
      plainDraftRef.current = value;
      setDraftValue(value);
      onDraftChange(value);
    },
    [onDraftChange]
  );

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;

      const history = promptHistoryRef.current;
      if (event.key === "ArrowUp" && history.length > 0) {
        const el = event.currentTarget;
        const beforeCursor = el.value.slice(0, el.selectionStart);
        const isFirstLine = !beforeCursor.includes("\n");
        if (isFirstLine) {
          event.preventDefault();
          if (historyIndexRef.current === -1) {
            savedDraftRef.current = draftValue;
          }
          const next = Math.min(historyIndexRef.current + 1, history.length - 1);
          historyIndexRef.current = next;
          const restored = history[next];
          plainDraftRef.current = restored;
          setDraftValue(restored);
          onDraftChange(restored);
          return;
        }
      }

      if (event.key === "ArrowDown" && historyIndexRef.current >= 0) {
        const el = event.currentTarget;
        const afterCursor = el.value.slice(el.selectionEnd);
        const isLastLine = !afterCursor.includes("\n");
        if (isLastLine) {
          event.preventDefault();
          const next = historyIndexRef.current - 1;
          historyIndexRef.current = next;
          const restored = next < 0 ? savedDraftRef.current : history[next];
          plainDraftRef.current = restored;
          setDraftValue(restored);
          onDraftChange(restored);
          return;
        }
      }

      if (event.key !== "Enter" || event.shiftKey) return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      handleSend(draftValue);
    },
    [draftValue, handleSend, onDraftChange]
  );

  const handleComposerSend = useCallback(() => {
    handleSend(draftValue);
  }, [draftValue, handleSend]);

  // Escape key triggers stop when agent is running
  useEffect(() => {
    if (!running || !canSend) return;
    const handleGlobalEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Don't intercept Escape when composing, renaming, or in a modal
      if (event.defaultPrevented) return;
      if (renameEditing) return;
      event.preventDefault();
      onStopRun();
    };
    document.addEventListener("keydown", handleGlobalEscape);
    return () => document.removeEventListener("keydown", handleGlobalEscape);
  }, [running, canSend, onStopRun, renameEditing]);

  const beginRename = useCallback(() => {
    if (!onRename) return;
    setRenameEditing(true);
    setRenameDraft(agent.name);
    setRenameError(null);
  }, [agent.name, onRename]);

  const cancelRename = useCallback(() => {
    if (renameSaving) return;
    setRenameEditing(false);
    setRenameDraft(agent.name);
    setRenameError(null);
  }, [agent.name, renameSaving]);

  useEffect(() => {
    if (!renameEditing) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (renameEditorRef.current?.contains(target)) return;
      cancelRename();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [cancelRename, renameEditing]);

  const submitRename = useCallback(async () => {
    if (!onRename || renameSaving) return;
    const nextName = renameDraft.trim();
    const currentName = agent.name.trim();
    if (!nextName) {
      setRenameError("Agent name is required.");
      return;
    }
    if (nextName === currentName) {
      setRenameEditing(false);
      setRenameError(null);
      setRenameDraft(agent.name);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const ok = await onRename(nextName);
      if (!ok) {
        setRenameError("Failed to rename agent.");
        return;
      }
      setRenameEditing(false);
      setRenameDraft(nextName);
    } finally {
      setRenameSaving(false);
    }
  }, [agent.name, onRename, renameDraft, renameSaving]);

  const handleRenameInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submitRename();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRename();
      }
    },
    [cancelRename, submitRename]
  );

  const handleNewSession = useCallback(async () => {
    if (!onNewSession || newSessionBusy || !canSend) return;
    setNewSessionBusy(true);
    try {
      await onNewSession();
    } finally {
      setNewSessionBusy(false);
    }
  }, [canSend, newSessionBusy, onNewSession]);

  const newSessionDisabled = newSessionBusy || !canSend || !onNewSession;

  return (
    <div data-agent-panel className="group fade-up relative flex h-full w-full flex-col">
      <div className="px-3 pt-2 sm:px-4 sm:pt-3">
        <div className="flex h-10 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="group/avatar relative shrink-0" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAvatarShuffle(); }} role="button" tabIndex={0} title="Shuffle avatar">
              <AgentAvatar
                seed={avatarSeed}
                name={agent.name}
                avatarUrl={agent.avatarUrl ?? null}
                size={40}
                isSelected={isSelected}
              />
            </div>

            <div className="min-w-0 flex-1">
              {renameEditing ? (
                <div ref={renameEditorRef} className="flex h-7 items-center gap-1.5">
                  <input
                    ref={renameInputRef}
                    className="ui-input agent-rename-input h-7 min-w-0 flex-1 rounded-md px-2 text-[12px] font-semibold text-foreground"
                    aria-label="Edit agent name"
                    data-testid="agent-rename-input"
                    value={renameDraft}
                    disabled={renameSaving}
                    onChange={(event) => {
                      setRenameDraft(event.target.value);
                      if (renameError) setRenameError(null);
                    }}
                    onKeyDown={handleRenameInputKeyDown}
                  />
                  <button
                    className="ui-btn-icon ui-btn-icon-xs agent-rename-control"
                    type="button"
                    aria-label="Save agent name"
                    data-testid="agent-rename-save"
                    onClick={() => { void submitRename(); }}
                    disabled={renameSaving}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    className="ui-btn-icon ui-btn-icon-xs agent-rename-control"
                    type="button"
                    aria-label="Cancel agent rename"
                    data-testid="agent-rename-cancel"
                    onClick={cancelRename}
                    disabled={renameSaving}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex h-7 min-w-0 items-center gap-1.5">
                  <div className="type-agent-name min-w-0 truncate text-foreground text-sm">
                    {agent.name}
                  </div>
                  {onRename ? (
                    <button
                      className="ui-btn-icon ui-btn-icon-xs agent-rename-control shrink-0"
                      type="button"
                      aria-label="Rename agent"
                      data-testid="agent-rename-toggle"
                      onClick={beginRename}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              )}
              {renameError ? (
                <div className="ui-text-danger mt-0.5 text-[11px]">{renameError}</div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              className="nodrag ui-btn-icon ui-btn-icon-xs disabled:cursor-not-allowed disabled:opacity-40"
              type="button"
              data-testid="agent-new-session-toggle"
              aria-label="New session"
              title="New session"
              onClick={() => { void handleNewSession(); }}
              disabled={newSessionDisabled}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${newSessionBusy ? "animate-spin" : ""}`} />
            </button>
            <button
              className="nodrag ui-btn-icon ui-btn-icon-xs"
              type="button"
              data-testid="agent-settings-toggle"
              aria-label="Agent settings"
              title="Agent settings"
              onClick={onOpenSettings}
            >
              <Cog className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col px-3 pb-3 sm:px-4 sm:pb-4">
        <AgentChatTranscript
          agentId={agent.agentId}
          name={agent.name}
          avatarSeed={avatarSeed}
          avatarUrl={agent.avatarUrl ?? null}
          status={agent.status}
          historyMaybeTruncated={agent.historyMaybeTruncated}
          historyFetchedCount={agent.historyFetchedCount}
          historyFetchLimit={agent.historyFetchLimit}
          onLoadMoreHistory={onLoadMoreHistory}
          chatItems={chatItems}
          liveThinkingText={liveThinkingText}
          liveAssistantText={liveAssistantText}
          showTypingIndicator={showTypingIndicator}
          outputLineCount={agent.outputLines.length}
          liveAssistantCharCount={liveAssistantText.length}
          liveThinkingCharCount={liveThinkingText.length}
          runStartedAt={agent.runStartedAt}
          scrollToBottomNextOutputRef={scrollToBottomNextOutputRef}
          pendingExecApprovals={pendingExecApprovals}
          onResolveExecApproval={onResolveExecApproval}
          emptyStateTitle={emptyStateTitle}
        />

        <div className="mt-3">
          <AgentChatComposer
            value={draftValue}
            inputRef={handleDraftRef}
            onChange={handleComposerChange}
            onKeyDown={handleComposerKeyDown}
            onSend={handleComposerSend}
            onStop={onStopRun}
            canSend={canSend}
            stopBusy={stopBusy}
            stopDisabledReason={stopDisabledReason}
            running={running}
            sendDisabled={sendDisabled}
            attachments={pendingAttachments}
            onAddFiles={handleAddFiles}
            onRemoveAttachment={handleRemoveAttachment}
            modelOptions={modelOptionsWithFallback.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            modelValue={modelValue}
            allowThinking={allowThinking}
            thinkingValue={agent.thinkingLevel ?? ""}
            onModelChange={onModelChange}
            onThinkingChange={onThinkingChange}
            toolCallingEnabled={agent.toolCallingEnabled}
            showThinkingTraces={agent.showThinkingTraces}
            onToolCallingToggle={onToolCallingToggle}
            onThinkingTracesToggle={onThinkingTracesToggle}
          />
        </div>
      </div>
    </div>
  );
};
