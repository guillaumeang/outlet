import type { z } from "zod";
import type { ComponentType } from "react";

/** Props passed to every tool component. */
export type ToolComponentProps<TData = Record<string, unknown>> = {
  /** Merged agent data + user local overrides. */
  data: TData;
  /** Apply a local edit — shallow-merged into local overrides. */
  onLocalEdit: (patch: Partial<TData>) => void;
  /** Send a prompt message to the agent. */
  onSendPrompt: (prompt: string) => void;
};

/** Registration entry for a single tool. */
export type ToolRegistryEntry<TData = Record<string, unknown>> = {
  id: string;
  displayName: string;
  schema: z.ZodType<TData>;
  component: ComponentType<ToolComponentProps<TData>>;
};
