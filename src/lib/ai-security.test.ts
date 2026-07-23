import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialAppData } from "./db";
import { withoutStoredAIKey } from "./ai-security";

describe("AI key protection", () => {
  it("removes API keys from backup snapshots without mutating live settings", () => {
    const data = initialAppData();
    data.ai.apiKey = "secret-key";

    const safe = withoutStoredAIKey(data);

    expect(safe.ai.apiKey).toBe("");
    expect(data.ai.apiKey).toBe("secret-key");
  });

  it("does not add a plaintext reveal control for AI API keys", () => {
    const settingsSource = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");

    expect(settingsSource).toContain('API Key<input type="password"');
    expect(settingsSource).not.toContain("setShowKey");
    expect(settingsSource).not.toContain("显示密钥");
  });
});
