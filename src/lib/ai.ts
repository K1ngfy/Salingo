import { explanationSchema, questionSchema } from "./validation";
import type { AISettings, Difficulty, DomainId, Explanation, Question } from "./types";
import { getDomain } from "./domains";

function chatEndpoint(url: string) {
  const cleanUrl = url.trim().replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(cleanUrl) ? cleanUrl : `${cleanUrl}/chat/completions`;
}

const configuredProxyUrl = process.env.NEXT_PUBLIC_AI_PROXY_URL?.replace(/\/+$/, "");
const developmentProxyUrl = process.env.NODE_ENV === "development" ? "http://127.0.0.1:43128" : "";
export const aiProxyUrl = configuredProxyUrl || developmentProxyUrl;

type ChatBody = {
  model: string;
  temperature: number;
  response_format?: { type: "json_object" };
  messages: Array<{ role: string; content: string }>;
};

async function requestCompletion(settings: AISettings, body: ChatBody) {
  const target = aiProxyUrl ? `${aiProxyUrl}/chat/completions` : chatEndpoint(settings.baseUrl);
  return fetch(target, {
    method: "POST",
    headers: aiProxyUrl
      ? { "Content-Type": "application/json" }
      : { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey.trim()}` },
    body: JSON.stringify(aiProxyUrl
      ? { provider: { baseUrl: settings.baseUrl.trim(), apiKey: settings.apiKey.trim() }, request: body }
      : body),
  });
}

async function chatCompletion(settings: AISettings, body: ChatBody) {
  if (!aiProxyUrl && !settings.baseUrl.trim()) throw new Error("请先填写 AI 接口地址");
  if (!aiProxyUrl && !settings.apiKey.trim()) throw new Error("请先填写 API Key");
  try {
    let response = await requestCompletion(settings, body);
    if ((response.status === 400 || response.status === 422) && body.response_format) {
      response = await requestCompletion(settings, { ...body, response_format: undefined });
    }
    return response;
  } catch {
    throw new Error(aiProxyUrl
      ? "无法连接本地 AI 代理，请用 npm run dev 启动完整开发环境"
      : "浏览器无法连接 AI 接口；该提供商可能未开放 CORS，请配置统一 AI 代理");
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
  return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/gi, "")) as Record<string, unknown>;
}

export async function generateQuestion(settings: AISettings, input: { domainId: DomainId; difficulty: Difficulty; tag: string }): Promise<Question> {
  const domain = getDomain(input.domainId);
  const prompt = `你是 CISSP 中文培训题目编辑。请基于当前生效的 ISC² CISSP Exam Outline（2024-04-15 生效，适用于 2025-2026 备考）创作一道全新、非复刻、无版权争议的情境题。
知识域：Domain ${domain.number} ${domain.name}；难度：${input.difficulty}；考点：${input.tag || "由你从该域选择"}。
强调管理者先评估风险、业务目标和流程，再选技术；不要声称是真题，不要复制 Boson、Sybex/OSG 或任何考试原题。
只输出 JSON，不使用 Markdown。结构必须为：{"type":"single|multiple","tags":["标签"],"stem":"题干","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correctAnswers":["A"],"explanation":{"logic":"核心作答逻辑","optionAnalysis":{"A":"逐项说明","B":"...","C":"...","D":"..."},"knowledgePoint":"考点定位","plainLanguage":"通俗企业场景解读"}}`;
  const response = await chatCompletion(settings, { model: settings.model, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "system", content: "你只输出有效 JSON。" }, { role: "user", content: prompt }] });
  if (!response.ok) throw await responseError(response, "AI 出题失败");
  const content = extractContent(await response.json());
  if (!content) throw new Error("AI 没有返回题目内容");
  const raw = parseJsonContent(content);
  return questionSchema.parse({ ...raw, id: `ai-${input.domainId}-${crypto.randomUUID()}`, domainId: input.domainId, difficulty: input.difficulty, source: "ai", outlineVersion: "2024-current", createdAt: new Date().toISOString() });
}

export async function explainQuestion(settings: AISettings, question: Question, selectedAnswers: string[]): Promise<Explanation> {
  const response = await chatCompletion(settings, {
    model: settings.model,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "你是严谨的 CISSP 中文导师，只输出有效 JSON，不声称接触过真实考试题。" },
      { role: "user", content: `依据当前生效的 ISC² CISSP Exam Outline 深度解析以下原创练习。题目：${question.stem}\n选项：${question.options.map((option) => `${option.id}.${option.text}`).join("；")}\n用户选择：${selectedAnswers.join("、") || "未选择"}\n正确答案：${question.correctAnswers.join("、")}。只输出 {"logic":"核心作答逻辑，强调管理者优先顺序","optionAnalysis":{"A":"逐项说明","B":"逐项说明","C":"逐项说明","D":"逐项说明"},"knowledgePoint":"知识域与细分考点","plainLanguage":"企业场景通俗解读"}。` },
    ],
  });
  if (!response.ok) throw await responseError(response, "AI 解析失败");
  const content = extractContent(await response.json());
  if (!content) throw new Error("AI 没有返回解析，已保留内置解析");
  return explanationSchema.parse(parseJsonContent(content));
}
