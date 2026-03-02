import {
  syncGatewaySessionSettings,
  type GatewayClient,
  type GatewaySessionsPatchResult,
} from "@/lib/gateway/GatewayClient";

type SessionSettingField = "model" | "thinkingLevel";

type AgentSessionState = {
  agentId: string;
  sessionCreated: boolean;
};

type SessionSettingsDispatchAction =
  | {
      type: "updateAgent";
      agentId: string;
      patch: {
        model?: string | null;
        thinkingLevel?: string | null;
        sessionSettingsSynced?: boolean;
      };
    }
  | {
      type: "appendOutput";
      agentId: string;
      line: string;
    };

type SessionSettingsDispatch = (action: SessionSettingsDispatchAction) => void;

export type ApplySessionSettingMutationParams = {
  agents: AgentSessionState[];
  dispatch: SessionSettingsDispatch;
  client: GatewayClient;
  agentId: string;
  sessionKey: string;
  field: SessionSettingField;
  value: string | null;
};

const buildFallbackError = (field: SessionSettingField) =>
  field === "model" ? "Failed to set model." : "Failed to set thinking level.";

const buildErrorPrefix = (field: SessionSettingField) =>
  field === "model" ? "Model update failed" : "Thinking update failed";

export const applySessionSettingMutation = async ({
  dispatch,
  client,
  agentId,
  sessionKey,
  field,
  value,
}: ApplySessionSettingMutationParams) => {
  dispatch({
    type: "updateAgent",
    agentId,
    patch: {
      [field]: value,
      sessionSettingsSynced: false,
    },
  });
  try {
    const result = await syncGatewaySessionSettings({
      client,
      sessionKey,
      ...(field === "model" ? { model: value ?? null } : { thinkingLevel: value ?? null }),
    });
    const patch: {
      model?: string | null;
      thinkingLevel?: string | null;
      sessionSettingsSynced: boolean;
      sessionCreated: boolean;
    } = { sessionSettingsSynced: true, sessionCreated: true };
    if (field === "model") {
      const resolvedModel = resolveModelFromPatchResult(result);
      if (resolvedModel !== undefined) {
        patch.model = resolvedModel;
      }
    } else {
      const nextThinkingLevel =
        typeof result.entry?.thinkingLevel === "string" ? result.entry.thinkingLevel : undefined;
      if (nextThinkingLevel !== undefined) {
        patch.thinkingLevel = nextThinkingLevel;
      }
    }
    dispatch({
      type: "updateAgent",
      agentId,
      patch,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : buildFallbackError(field);
    dispatch({
      type: "appendOutput",
      agentId,
      line: `${buildErrorPrefix(field)}: ${msg}`,
    });
  }
};

const resolveModelFromPatchResult = (result: GatewaySessionsPatchResult): string | null | undefined => {
  const provider =
    typeof result.resolved?.modelProvider === "string" ? result.resolved.modelProvider.trim() : "";
  const model = typeof result.resolved?.model === "string" ? result.resolved.model.trim() : "";
  if (!provider || !model) return undefined;
  return `${provider}/${model}`;
};
