"use client";

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Loader2 } from "lucide-react";
import type { ToolBody } from "../types";
import { getTool } from "./registry";

// ─── Tool registrations (side-effect imports) ────────────────────────────────
// Placed here (not in registry.ts) to avoid circular TDZ errors.
import "./twitter-post";

// ─── Deep merge ──────────────────────────────────────────────────────────────
// Merges nested plain objects recursively. Arrays and primitives are replaced.

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const tVal = target[key];
    const sVal = source[key];
    if (
      tVal &&
      sVal &&
      typeof tVal === "object" &&
      !Array.isArray(tVal) &&
      typeof sVal === "object" &&
      !Array.isArray(sVal)
    ) {
      result[key] = deepMerge(tVal as Record<string, unknown>, sVal as Record<string, unknown>);
    } else {
      result[key] = sVal;
    }
  }
  return result;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

type ToolState = {
  toolId: string;
  agentData: Record<string, unknown>;
  localOverrides: Record<string, unknown>;
};

type ToolAction =
  | { type: "AGENT_REPLACE"; toolId: string; data: Record<string, unknown> }
  | { type: "AGENT_MERGE"; data: Record<string, unknown> }
  | { type: "LOCAL_EDIT"; patch: Record<string, unknown> };

function toolReducer(state: ToolState, action: ToolAction): ToolState {
  switch (action.type) {
    case "AGENT_REPLACE":
      return { toolId: action.toolId, agentData: action.data, localOverrides: {} };
    case "AGENT_MERGE":
      return { ...state, agentData: deepMerge(state.agentData, action.data) };
    case "LOCAL_EDIT":
      return { ...state, localOverrides: { ...state.localOverrides, ...action.patch } };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

type ToolHostProps = {
  body: ToolBody;
  onSendPrompt: (prompt: string) => void;
};

export const ToolHost = ({ body, onSendPrompt }: ToolHostProps) => {
  const { tool: toolId, data, update } = body;
  const entry = getTool(toolId);

  const [state, dispatch] = useReducer(toolReducer, {
    toolId,
    agentData: data,
    localOverrides: {},
  });

  // Track last-processed data ref to avoid re-dispatching on re-renders
  const lastDataRef = useRef<Record<string, unknown>>(data);
  const initializedRef = useRef(true);

  useEffect(() => {
    // Skip the initial render — reducer already has the data
    if (initializedRef.current) {
      initializedRef.current = false;
      return;
    }
    if (data === lastDataRef.current) return;
    lastDataRef.current = data;

    if (state.toolId !== toolId) {
      dispatch({ type: "AGENT_REPLACE", toolId, data });
    } else if (update) {
      dispatch({ type: "AGENT_MERGE", data });
    } else {
      dispatch({ type: "AGENT_REPLACE", toolId, data });
    }
  }, [toolId, data, update, state.toolId]);

  const mergedData = useMemo(
    () => deepMerge(state.agentData, state.localOverrides),
    [state.agentData, state.localOverrides],
  );

  const handleLocalEdit = useCallback(
    (patch: Record<string, unknown>) => dispatch({ type: "LOCAL_EDIT", patch }),
    [],
  );

  // ── Unknown tool ──
  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Unknown tool
        </div>
        <div className="font-mono text-[11px] text-muted-foreground/70">
          &quot;{toolId}&quot;
        </div>
      </div>
    );
  }

  // ── Validate merged data against tool schema ──
  const parseResult = entry.schema.safeParse(mergedData);
  if (!parseResult.success) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-destructive">
          Tool data validation failed
        </div>
        <pre className="max-h-64 w-full overflow-auto rounded-md bg-surface-2 px-3 py-3 font-mono text-[10px] text-muted-foreground">
          {JSON.stringify(parseResult.error.issues, null, 2)}
        </pre>
      </div>
    );
  }

  const ToolComponent = entry.component;

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        </div>
      }
    >
      <ToolComponent data={parseResult.data} onLocalEdit={handleLocalEdit} onSendPrompt={onSendPrompt} />
    </Suspense>
  );
};
