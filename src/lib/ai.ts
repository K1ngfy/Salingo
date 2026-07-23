import { explanationSchema, questionSchema } from "./validation";
import type { AISettings, AnswerResponse, Difficulty, DomainId, Explanation, PrepCard, Question } from "./types";
import { getDomain } from "./domains";
import { correctResponse, responseLabel } from "./question-utils";

function chatEndpoint(url: string) {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(cleanUrl) ? cleanUrl : `${cleanUrl}/chat/completions`;
}

const configuredProxyUrl = process.env.NEXT_PUBLIC_AI_PROXY_URL?.replace(/\/+$/, "");
const developmentProxyUrl = process.env.NODE_ENV === "development" ? "http://127.0.0.1:43128" : "";
export const aiProxyUrl = configuredProxyUrl || developmentProxyUrl || "/api/ai";
export const aiProxyMode = configuredProxyUrl ? "custom" : developmentProxyUrl ? "local" : "hosted";

type ChatBody = {
  model: string;
  temperature?: number;
  reasoning_effort?: "minimal" | "low";
  max_completion_tokens?: number;
  max_tokens?: number;
  thinking?: { type: "disabled" };
  reasoning_split?: boolean;
  response_format?: { type: "json_object" };
  messages: Array<{ role: string; content: string }>;
};

type CompletionOptions = {
  lowLatency?: boolean;
  maxOutputTokens?: number;
};

const AI_REQUEST_TIMEOUT_MS = 40_000;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function modelName(model: string) {
  return model.trim().split("/").pop()?.toLowerCase() ?? "";
}

function isReasoningModel(model: string) {
  return /^(gpt-5|o\d)/.test(modelName(model));
}

function fastReasoningEffort(model: string): ChatBody["reasoning_effort"] {
  return /^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/.test(modelName(model)) ? "minimal" : "low";
}

function providerFamily(settings: AISettings, model: string) {
  const identity = `${settings.baseUrl} ${model}`.toLowerCase();
  if (/minimax|minimaxi\.com/.test(identity)) return "minimax";
  if (/(?:^|[\s/])glm-|bigmodel\.cn|z\.ai/.test(identity)) return "zhipu";
  if (/sensechat|sensenova|sensecore/.test(identity)) return "sensetime";
  if (/api\.openai\.com/.test(identity) || isReasoningModel(model)) return "openai";
  return "generic";
}

function optimizeRequestBody(settings: AISettings, body: ChatBody, options: CompletionOptions) {
  if (!options.lowLatency) return body;
  const maxOutputTokens = options.maxOutputTokens;
  switch (providerFamily(settings, body.model)) {
    case "minimax":
      return {
        ...body,
        reasoning_split: true,
        ...(maxOutputTokens ? { max_completion_tokens: Math.min(maxOutputTokens, 2_048) } : {}),
      };
    case "zhipu":
      return {
        ...body,
        thinking: { type: "disabled" as const },
        ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
      };
    case "sensetime":
      return {
        ...body,
        reasoning_effort: "low" as const,
        ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
      };
    case "openai": {
      if (!isReasoningModel(body.model)) return body;
      const { temperature: _temperature, ...compatible } = body;
      void _temperature;
      return {
        ...compatible,
        reasoning_effort: fastReasoningEffort(body.model),
        ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
      };
    }
    default:
      return body;
  }
}

function withoutOptionalHints(body: ChatBody) {
  const {
    reasoning_effort: _reasoningEffort,
    max_completion_tokens: _maxCompletionTokens,
    max_tokens: _maxTokens,
    thinking: _thinking,
    reasoning_split: _reasoningSplit,
    ...compatible
  } = body;
  void _reasoningEffort;
  void _maxCompletionTokens;
  void _maxTokens;
  void _thinking;
  void _reasoningSplit;
  return compatible;
}

function hasOptionalHints(body: ChatBody) {
  return Boolean(body.reasoning_effort || body.max_completion_tokens || body.max_tokens || body.thinking || body.reasoning_split);
}

function waitBeforeRetry(response: Response, signal: AbortSignal) {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  const delay = Number.isFinite(seconds) ? Math.min(Math.max(seconds * 1_000, 0), 1_500) : 350;
  return new Promise<void>((resolve, reject) => {
    const aborted = () => {
      globalThis.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, delay);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

async function requestCompletion(settings: AISettings, body: ChatBody, signal: AbortSignal) {
  const target = aiProxyUrl ? `${aiProxyUrl}/chat/completions` : chatEndpoint(settings.baseUrl);
  return fetch(target, {
    method: "POST",
    headers: aiProxyUrl
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey.trim()}` },
    body: JSON.stringify(aiProxyUrl
      ? { provider: { baseUrl: settings.baseUrl.trim(), apiKey: settings.apiKey.trim() }, request: body }
      : body),
    signal,
  });
}

async function requestWithRetry(settings: AISettings, body: ChatBody, signal: AbortSignal) {
  let response = await requestCompletion(settings, body, signal);
  if (RETRYABLE_STATUSES.has(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    await waitBeforeRetry(response, signal);
    response = await requestCompletion(settings, body, signal);
  }
  return response;
}

async function chatCompletion(settings: AISettings, requestedBody: ChatBody, options: CompletionOptions = {}) {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(new DOMException("AI request timed out", "TimeoutError")), AI_REQUEST_TIMEOUT_MS);
  try {
    const body = optimizeRequestBody(settings, requestedBody, options);
    let response = await requestWithRetry(settings, body, controller.signal);
    if ((response.status === 400 || response.status === 422) && hasOptionalHints(body)) {
      await response.body?.cancel().catch(() => undefined);
      response = await requestWithRetry(settings, withoutOptionalHints(body), controller.signal);
    }
    if ((response.status === 400 || response.status === 422) && body.response_format) {
      await response.body?.cancel().catch(() => undefined);
      response = await requestWithRetry(settings, { ...withoutOptionalHints(body), response_format: undefined }, controller.signal);
    }
    return response;
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error("AI 解析超过 40 秒，已自动停止；原始解析仍可正常使用，请稍后重试");
    }
    void cause;
    throw new Error(aiProxyMode === "local"
      ? "无法连接本地 AI 代理，请用 npm run dev 启动完整开发环境"
      : "无法连接同源 AI 代理，请检查网络或 Sites 托管环境配置");
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" ? value as UnknownRecord : undefined;
}

function extractContent(payload: unknown) {
  const outer = asRecord(payload);
  const root = asRecord(outer?.data) || outer;
  const choices = root?.choices;
  if (!Array.isArray(choices)) return "";
  const message = asRecord(asRecord(choices[0])?.message);
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      const item = asRecord(part);
      return typeof item?.text === "string" ? item.text : "";
    }).join("");
  }
  return "";
}

function extractErrorMessage(payload: unknown) {
  const root = asRecord(payload);
  const error = root?.error;
  if (typeof error === "string") return error;
  const nested = asRecord(error);
  if (typeof nested?.message === "string") return nested.message;
  return typeof root?.message === "string" ? root.message : "";
}

async function responseError(response: Response, prefix: string) {
  const text = await response.text().catch(() => "");
  let message = "";
  if (text) {
    try { message = extractErrorMessage(JSON.parse(text)); } catch { message = text; }
  }
  return new Error(`${prefix}（HTTP ${response.status}）${message ? `：${message.slice(0, 160)}` : ""}`);
}

function parseJsonContent(content: string) {
  const withoutThinking = content.replace(/^\s*(?:<think>[\s\S]*?<\/think>\s*)+/i, "");
  return JSON.parse(withoutThinking.replace(/^```(?:json)?\s*|\s*```$/gi, "")) as Record<string, unknown>;
}

export async function generateQuestion(settings: AISettings, input: { domainId: DomainId; difficulty: Difficulty; tag: string }): Promise<Question> {
  const domain = getDomain(input.domainId);
  const prompt = `你是 CISSP 中文培训题目编辑。请基于当前生效的 ISC² CISSP Exam Outline（2024-04-15 生效，适用于 2025-2026 备考）创作一道全新、非复刻、无版权争议的情境题。
知识域：Domain ${domain.number} ${domain.name}；难度：${input.difficulty}；考点：${input.tag || "由你从该域选择"}。
强调管理者先评估风险、业务目标和流程，再选技术；不要声称是真题，不要复制 Boson、Sybex/OSG 或任何考试原题。
只输出 JSON，不使用 Markdown。结构必须为：{"type":"single|multiple","tags":["标签"],"stem":"题干","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correctAnswers":["A"],"explanation":{"logic":"核心作答逻辑","optionAnalysis":{"A":"逐项说明","B":"...","C":"...","D":"..."},"knowledgePoint":"考点定位","plainLanguage":"通俗企业场景解读"}}`;
  const response = await chatCompletion(settings, { model: settings.model, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "system", content: "你只输出有效 JSON。" }, { role: "user", content: prompt }] }, { lowLatency: true, maxOutputTokens: 1_600 });
  if (!response.ok) throw await responseError(response, "AI 出题失败");
  const content = extractContent(await response.json());
  if (!content) throw new Error("AI 没有返回题目内容");
  const raw = parseJsonContent(content);
  return questionSchema.parse({ ...raw, id: `ai-${input.domainId}-${crypto.randomUUID()}`, domainId: input.domainId, difficulty: input.difficulty, source: "ai", outlineVersion: "2024-current", createdAt: new Date().toISOString() });
}

export async function explainQuestion(settings: AISettings, question: Question, answer: AnswerResponse): Promise<Explanation> {
  const typeLabel = question.type === "matching" ? "匹配题" : question.type === "multiple" ? "多选题" : "单选题";
  const promptItems = question.type === "matching"
    ? `待匹配项：${question.matchingPrompts.map((item) => `${item.id}.${item.text}`).join("；")}\n匹配目标：${question.options.map((option) => `${option.id}.${option.text}`).join("；")}`
    : `选项：${question.options.map((option) => `${option.id}.${option.text}`).join("；")}`;
  const optionShape = Object.fromEntries(question.options.map((option) => [option.id, "逐项说明"]));
  const provenance = question.source === "imported" ? "用户提供的导入练习题" : question.source === "ai" ? "AI 原创练习" : "Salingo 原创练习";
  const response = await chatCompletion(settings, {
    model: settings.model,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "你是严谨的 CISSP 中文导师，只输出有效 JSON，不声称接触过真实考试题，也不臆造缺失的图形。" },
      { role: "user", content: `依据当前生效的 ISC² CISSP Exam Outline 解析以下${provenance}。如果题目知识与当前考纲或实践可能不一致，必须明确指出。${question.requiresFigure ? "原始图形缺失，只能依据现有文字分析，并明确说明限制。" : ""}\n题型：${typeLabel}\n题目：${question.stem}\n${promptItems}\n用户作答：${responseLabel(answer) || "未作答"}\n正确答案：${responseLabel(correctResponse(question))}。保持简明：logic、knowledgePoint、plainLanguage 各不超过 120 个汉字，每个选项说明不超过 90 个汉字。只输出 ${JSON.stringify({ logic: "核心作答逻辑", optionAnalysis: optionShape, knowledgePoint: "知识域与细分考点", plainLanguage: "企业场景通俗解读" })}。` },
    ],
  }, { lowLatency: true, maxOutputTokens: 1_400 });
  if (!response.ok) throw await responseError(response, "AI 解析失败");
  const content = extractContent(await response.json());
  if (!content) throw new Error("AI 没有返回解析，已保留内置解析");
  return explanationSchema.parse(parseJsonContent(content));
}

export async function explainPrepCard(settings: AISettings, card: PrepCard) {
  const provenance = card.kind === "knowledge" ? "个人备考指南中的知识判断" : card.kind === "vocabulary" ? "个人备考指南中的双语词汇" : "个人备考指南中的学习策略";
  const response = await chatCompletion(settings, {
    model: settings.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "你是严谨的 CISSP 中文导师。必须区分 ISC2 官方考纲与个人经验，只输出有效 JSON。" },
      { role: "user", content: `请解释以下${provenance}。状态：${card.verificationStatus}。内容：${card.front}\n参考说明：${card.back}\n${card.correction ?? ""}\n不得把个人笔记包装为 ISC2 官方结论；如果可能过时、有争议或缺少权威依据，必须明确说明。只输出 {"explanation":"简明解释","caution":"来源与时效提示"}。` },
    ],
  }, { lowLatency: true, maxOutputTokens: 700 });
  if (!response.ok) throw await responseError(response, "AI 讲解失败");
  const content = extractContent(await response.json());
  if (!content) throw new Error("AI 没有返回讲解");
  const parsed = parseJsonContent(content);
  if (typeof parsed.explanation !== "string" || typeof parsed.caution !== "string") throw new Error("AI 返回格式无效");
  return { explanation: parsed.explanation, caution: parsed.caution };
}
