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
});
