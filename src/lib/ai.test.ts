import { afterEach, describe, expect, it, vi } from "vitest";
import { explainQuestion } from "./ai";
import { choiceResponse } from "./question-utils";
import type { AISettings, Question } from "./types";

const settings: AISettings = {
  baseUrl: "",
  apiKey: "",
  model: "gpt-5-mini",
};

const question: Question = {
  id: "test-ai-latency",
  bankId: "salingo-original",
  sectionId: "d1",
  domainId: "d1",
  difficulty: "基础",
  tags: ["风险管理"],
  stem: "管理层在选择安全控制前首先应该做什么？",
  options: [
    { id: "A", text: "评估业务风险" },
    { id: "B", text: "购买最新设备" },
    { id: "C", text: "直接实施加密" },
    { id: "D", text: "复制同行方案" },
  ],
  type: "single",
  correctAnswers: ["A"],
  explanation: {
    logic: "先理解业务风险，再选择相称的控制。",
    optionAnalysis: { A: "正确", B: "技术先行", C: "技术先行", D: "忽略自身风险" },
    knowledgePoint: "风险管理",
    plainLanguage: "先诊断，再开药。",
  },
  source: "original",
  outlineVersion: "2024-current",
  createdAt: "2026-07-23T00:00:00.000Z",
};

const completion = {
  choices: [{
    message: {
      content: JSON.stringify({
        logic: "先评估风险，再选择控制。",
        optionAnalysis: { A: "符合风险管理顺序。", B: "不能以设备替代评估。", C: "控制选择为时过早。", D: "同行方案未必匹配自身风险。" },
        knowledgePoint: "D1 风险管理",
        plainLanguage: "先诊断风险，再决定采用什么控制。",
      }),
    },
  }],
};

afterEach(() => vi.unstubAllGlobals());

describe("AI question explanations", () => {
  it("uses minimal reasoning and a bounded output for GPT-5 mini", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(completion), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await explainQuestion(settings, question, choiceResponse(["A"]));

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).request;
    expect(request).toMatchObject({
      model: "gpt-5-mini",
      reasoning_effort: "minimal",
      max_completion_tokens: 1_400,
    });
    expect(request).not.toHaveProperty("temperature");
  });

  it("falls back when a compatible provider rejects reasoning hints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unsupported parameter" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(explainQuestion(settings, question, choiceResponse(["A"]))).resolves.toMatchObject({
      knowledgePoint: "D1 风险管理",
    });

    const fallback = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).request;
    expect(fallback).not.toHaveProperty("reasoning_effort");
    expect(fallback).not.toHaveProperty("max_completion_tokens");
    expect(fallback.response_format).toEqual({ type: "json_object" });
  });

  it("retries one transient upstream failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(completion), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(explainQuestion(settings, question, choiceResponse(["A"]))).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
