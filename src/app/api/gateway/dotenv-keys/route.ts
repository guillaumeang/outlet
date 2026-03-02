import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { resolveStateDir } from "@/lib/clawdbot/paths";
import { isLocalGatewayUrl } from "@/lib/gateway/local-gateway";
import {
  resolveConfiguredSshTarget,
  resolveGatewaySshTargetFromGatewayUrl,
  runSshJson,
} from "@/lib/ssh/gateway-host";
import { loadStudioSettings } from "@/lib/studio/settings-store";

export const runtime = "nodejs";

type DotenvKeysResponse = { keys: string[] };

const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

const parseDotEnvKeys = (raw: string): string[] => {
  const keys: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const idx = withoutExport.indexOf("=");
    if (idx === -1) continue;
    const key = withoutExport.slice(0, idx).trim();
    if (!ENV_KEY_PATTERN.test(key)) continue;
    const value = withoutExport.slice(idx + 1).trim();
    if (!value) continue;
    keys.push(key);
  }
  return Array.from(new Set(keys)).sort();
};

const readLocalDotEnvKeys = (): string[] => {
  const envPath = path.join(resolveStateDir(), ".env");
  if (!fs.existsSync(envPath)) return [];
  const raw = fs.readFileSync(envPath, "utf8");
  return parseDotEnvKeys(raw);
};

const DOTENV_KEYS_SCRIPT = `
set -euo pipefail

python3 - <<'PY'
import json
import pathlib
import re

pattern = re.compile(r"^[A-Z_][A-Z0-9_]*$")
env_path = pathlib.Path.home() / ".openclaw" / ".env"
keys = []

try:
  raw = env_path.read_text(encoding="utf-8")
except FileNotFoundError:
  raw = ""

for line in raw.splitlines():
  trimmed = line.strip()
  if not trimmed or trimmed.startswith("#"):
    continue
  if trimmed.startswith("export "):
    trimmed = trimmed[len("export "):].strip()
  if "=" not in trimmed:
    continue
  key, value = trimmed.split("=", 1)
  key = key.strip()
  if not pattern.fullmatch(key):
    continue
  value = value.strip()
  if not value:
    continue
  keys.append(key)

print(json.dumps({"keys": sorted(set(keys))}))
PY
`;

const readRemoteDotEnvKeys = (sshTarget: string): string[] => {
  const result = runSshJson({
    sshTarget,
    argv: ["bash", "-s"],
    input: DOTENV_KEYS_SCRIPT,
    label: "read dotenv keys",
    fallbackMessage: "Failed to read remote ~/.openclaw/.env.",
  }) as DotenvKeysResponse;
  return Array.isArray(result?.keys) ? result.keys.filter((key) => typeof key === "string") : [];
};

const resolveDotEnvSshTarget = (): string | null => {
  const configured = resolveConfiguredSshTarget(process.env);
  if (configured) return configured;
  const settings = loadStudioSettings();
  const gatewayUrl = settings.gateway?.url ?? "";
  if (!gatewayUrl.trim()) return null;
  if (isLocalGatewayUrl(gatewayUrl)) return null;
  return resolveGatewaySshTargetFromGatewayUrl(gatewayUrl, process.env);
};

export async function GET() {
  try {
    const settings = loadStudioSettings();
    const gatewayUrl = settings.gateway?.url ?? "";

    const sshTarget = resolveDotEnvSshTarget();
    const keys = sshTarget ? readRemoteDotEnvKeys(sshTarget) : readLocalDotEnvKeys();

    if (!isLocalGatewayUrl(gatewayUrl) && !sshTarget) {
      return NextResponse.json(
        { error: "Gateway is remote but no SSH target is configured." },
        { status: 400 },
      );
    }

    return NextResponse.json({ keys });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read dotenv keys.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

