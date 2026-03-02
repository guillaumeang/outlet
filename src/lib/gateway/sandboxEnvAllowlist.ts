import { GatewayResponseError, type GatewayClient } from "@/lib/gateway/GatewayClient";
import type { GatewayConfigSnapshot } from "@/lib/gateway/agentConfig";
import { fetchJson } from "@/lib/http";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const shouldRetryConfigWrite = (err: unknown) => {
  if (!(err instanceof GatewayResponseError)) return false;
  return /re-run config\.get|config changed since last load/i.test(err.message);
};

const readDotEnvKeys = async (): Promise<string[]> => {
  if (typeof window === "undefined") {
    return [];
  }
  const url = new URL("/api/gateway/dotenv-keys", window.location.origin).toString();
  const { keys } = await fetchJson<{ keys: string[] }>(url);
  return Array.isArray(keys) ? keys : [];
};

const readDefaultSandboxEnvMap = (config: Record<string, unknown>): Record<string, string> => {
  const agents = isRecord(config.agents) ? config.agents : null;
  const defaults = agents && isRecord(agents.defaults) ? agents.defaults : null;
  const sandbox = defaults && isRecord(defaults.sandbox) ? defaults.sandbox : null;
  const docker = sandbox && isRecord(sandbox.docker) ? sandbox.docker : null;
  const env = docker && isRecord(docker.env) ? docker.env : null;

  const result: Record<string, string> = {};
  if (!env) return result;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
};

const writeDefaultSandboxEnvMap = (
  config: Record<string, unknown>,
  env: Record<string, string>,
): Record<string, unknown> => {
  const agents = isRecord(config.agents) ? { ...config.agents } : {};
  const defaults = isRecord(agents.defaults) ? { ...(agents.defaults as Record<string, unknown>) } : {};
  const sandbox = isRecord(defaults.sandbox) ? { ...(defaults.sandbox as Record<string, unknown>) } : {};
  const docker = isRecord(sandbox.docker) ? { ...(sandbox.docker as Record<string, unknown>) } : {};

  docker.env = env;
  sandbox.docker = docker;
  defaults.sandbox = sandbox;
  (agents as Record<string, unknown>).defaults = defaults;

  return { ...config, agents };
};

export const ensureGatewaySandboxEnvAllowlistFromDotEnv = async (params: {
  client: GatewayClient;
}): Promise<void> => {
  let keys: string[] = [];
  try {
    keys = await readDotEnvKeys();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("status 404")) {
      return;
    }
    console.warn("Failed to sync sandbox env allowlist from dotenv keys.", err);
    return;
  }
  if (keys.length === 0) return;

  const tryOnce = async (attempt: number): Promise<void> => {
    const snapshot = await params.client.call<GatewayConfigSnapshot>("config.get", {});
    const baseConfig = isRecord(snapshot.config) ? snapshot.config : {};

    const currentEnv = readDefaultSandboxEnvMap(baseConfig);
    const nextEnv: Record<string, string> = { ...currentEnv };

    let changed = false;
    for (const key of keys) {
      if (key in nextEnv) continue;
      nextEnv[key] = `\${${key}}`;
      changed = true;
    }
    if (!changed) return;

    const nextConfig = writeDefaultSandboxEnvMap(baseConfig, nextEnv);
    const payload: Record<string, unknown> = {
      raw: JSON.stringify(nextConfig, null, 2),
    };
    const baseHash = typeof snapshot.hash === "string" ? snapshot.hash.trim() : "";
    if (snapshot.exists !== false) {
      if (!baseHash) {
        throw new Error("Gateway config hash unavailable; re-run config.get.");
      }
      payload.baseHash = baseHash;
    }
    try {
      await params.client.call("config.set", payload);
    } catch (err) {
      if (attempt < 1 && shouldRetryConfigWrite(err)) {
        return tryOnce(attempt + 1);
      }
      throw err;
    }
  };

  await tryOnce(0);
};
