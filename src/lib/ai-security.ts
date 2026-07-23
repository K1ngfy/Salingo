import type { AppData } from "./types";

export function withoutStoredAIKey(data: AppData): AppData {
  return {
    ...data,
    ai: {
      ...data.ai,
      apiKey: "",
    },
  };
}
