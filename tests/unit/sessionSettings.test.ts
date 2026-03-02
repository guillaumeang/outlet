import { describe, expect, it, vi } from "vitest";

import { syncGatewaySessionSettings } from "@/lib/gateway/GatewayClient";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

describe("session settings sync helper", () => {
  it("throws when session key is missing", async () => {
    const client = { call: vi.fn() } as unknown as GatewayClient;
    await expect(
      syncGatewaySessionSettings({
        client,
        sessionKey: "",
        model: "openai/gpt-5",
      })
    ).rejects.toThrow("Session key is required.");
  });

  it("throws when no settings are provided", async () => {
    const client = { call: vi.fn() } as unknown as GatewayClient;
    await expect(
      syncGatewaySessionSettings({
        client,
        sessionKey: "agent:1:studio:abc",
      })
    ).rejects.toThrow("At least one session setting must be provided.");
  });

  it("patches model and thinking level together", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await syncGatewaySessionSettings({
      client,
      sessionKey: "agent:1:studio:abc",
      model: "openai/gpt-5",
      thinkingLevel: "medium",
    });

    expect(client.call).toHaveBeenCalledWith("sessions.patch", {
      key: "agent:1:studio:abc",
      model: "openai/gpt-5",
      thinkingLevel: "medium",
    });
  });

  it("patches only model when thinking is omitted", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await syncGatewaySessionSettings({
      client,
      sessionKey: "agent:1:studio:abc",
      model: null,
    });

    expect(client.call).toHaveBeenCalledWith("sessions.patch", {
      key: "agent:1:studio:abc",
      model: null,
    });
  });

  it("patches exec session overrides without model settings", async () => {
    const client = {
      call: vi.fn(async () => ({ ok: true })),
    } as unknown as GatewayClient;

    await syncGatewaySessionSettings({
      client,
      sessionKey: "agent:1:studio:abc",
      execHost: "gateway",
      execSecurity: "allowlist",
      execAsk: "always",
    });

    expect(client.call).toHaveBeenCalledWith("sessions.patch", {
      key: "agent:1:studio:abc",
      execHost: "gateway",
      execSecurity: "allowlist",
      execAsk: "always",
    });
  });
});
