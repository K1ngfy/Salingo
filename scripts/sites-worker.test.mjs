import { afterEach, describe, expect, it, vi } from "vitest";
import { handleAIRequest } from "./sites-worker.mjs";

const requestBody = {
  request: {
    model: "test-model",
    temperature: 0.2,
    messages: [{ role: "user", content: "hello" }],
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("Sites same-origin AI proxy", () => {
  it("uses server-managed provider settings without exposing them to the browser", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", upstreamFetch);

    const response = await handleAIRequest(new Request("https://salingo.example/api/ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://salingo.example" },
      body: JSON.stringify(requestBody),
    }), { AI_BASE_URL: "https://provider.example/v1", AI_API_KEY: "server-secret" });

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledWith("https://provider.example/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer server-secret" }),
    }));
  });

  it("never sends a managed secret to a browser-supplied endpoint", async () => {
    const upstreamFetch = vi.fn();
    vi.stubGlobal("fetch", upstreamFetch);
    const response = await handleAIRequest(new Request("https://salingo.example/api/ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://salingo.example" },
      body: JSON.stringify({ ...requestBody, provider: { baseUrl: "https://untrusted.example/v1", apiKey: "" } }),
    }), { AI_BASE_URL: "", AI_API_KEY: "server-secret" });

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects cross-origin browser requests", async () => {
    const response = await handleAIRequest(new Request("https://salingo.example/api/ai/chat/completions", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
      body: JSON.stringify(requestBody),
    }), { AI_BASE_URL: "https://provider.example/v1", AI_API_KEY: "server-secret" });

    expect(response.status).toBe(403);
  });
});
