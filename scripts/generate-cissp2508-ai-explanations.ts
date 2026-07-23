import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { CISSP2508_QUESTIONS } from "../src/data/cissp2508";
import { explanationSchema } from "../src/lib/validation";
import type { Explanation, Question } from "../src/lib/types";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

type ExplanationFile = {
  generatedAt: string;
  model: string;
  explanations: Record<string, Explanation>;
};

const outputPath = resolve(process.cwd(), "src/data/cissp2508-ai-explanations.json");
const baseUrl = (process.env.AI_BASE_URL || process.env.NEXT_PUBLIC_AI_BASE_URL || "").trim().replace(/\/+$/, "");
const apiKey = (process.env.AI_API_KEY || "").trim();
const model = (process.env.AI_MODEL || process.env.NEXT_PUBLIC_AI_MODEL || "").trim();
const force = process.argv.includes("--force");
const concurrencyArg = process.argv.find((value) => value.startsWith("--concurrency="));
const limitArg = process.argv.find((value) => value.startsWith("--limit="));
const concurrency = Math.max(1, Math.min(8, Number(concurrencyArg?.split("=")[1] || 3)));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1])) : Number.POSITIVE_INFINITY;

function chatEndpoint() {
  if (!baseUrl) throw new Error("缺少 AI_BASE_URL 或 NEXT_PUBLIC_AI_BASE_URL");
  return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
}

function extractContent(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = first.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.map((part) => {
    if (typeof part === "string") return part;
    if (!part || typeof part !== "object") return "";
    return typeof (part as Record<string, unknown>).text === "string" ? (part as Record<string, unknown>).text as string : "";
  }).join("");
}

function parseJson(content: string) {
  const clean = content.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI 返回内容不含 JSON 对象");
  return JSON.parse(clean.slice(start, end + 1)) as unknown;
}

function assertQuality(question: Question, explanation: Explanation) {
  const expectedOptionIds = question.options.map((option) => option.id).sort();
  const actualOptionIds = Object.keys(explanation.optionAnalysis).sort();
  if (expectedOptionIds.join() !== actualOptionIds.join()) throw new Error("逐项解析的选项不完整");
  if (explanation.logic.length < 70) throw new Error("核心逻辑过短");
  if (explanation.knowledgePoint.length < 20) throw new Error("考点定位过短");
  if (!/Domain\s*[1-8]/i.test(explanation.knowledgePoint)) throw new Error("考点定位缺少标准 Domain 编号");
  if (explanation.plainLanguage.length < 45) throw new Error("通俗解读过短");
  if (Object.values(explanation.optionAnalysis).some((value) => value.length < 25)) throw new Error("存在过短的选项解析");
  const combined = `${explanation.logic} ${Object.values(explanation.optionAnalysis).join(" ")} ${explanation.knowledgePoint} ${explanation.plainLanguage}`;
  if (/可使用 AI 深度解析|原始题库(?:将|未将)|逐项说明|进一步核对其适用条件|进一步分析该选项/.test(combined)) {
    throw new Error("解析仍包含占位文本");
  }
}

function promptFor(question: Question) {
  const answer = question.type === "matching"
    ? Object.entries(question.correctMatches).map(([prompt, option]) => `${prompt}→${option}`).join("；")
    : question.correctAnswers.join("、");
  const optionShape = Object.fromEntries(question.options.map((option) => [option.id, "针对该选项的具体判断、适用条件和干扰点"]));
  return `请为以下 CISSP 练习题生成可直接随题发布的中文解析。必须结合题干情境、CISSP 管理者视角和每个选项的具体含义，不得使用模板占位句，不得声称题目是真题，也不要引入题干无法支持的事实或法规。以题库标注答案为讲解对象；若答案或知识存在明显争议、过时风险或翻译歧义，要在核心逻辑中明确提示，但不要擅自修改答案。系统自动分类 ${question.domainId ?? "未分类"} 仅供参考，可能不准确；请根据题意独立判断，并在 knowledgePoint 中使用“Domain N · 标准中文域名”的格式。\n题目：${question.stem}\n选项：${question.options.map((option) => `${option.id}. ${option.text}`).join("\n")}\n题库答案：${answer}\n只输出有效 JSON：${JSON.stringify({ logic: "不少于70字的核心作答逻辑", optionAnalysis: optionShape, knowledgePoint: "Domain N · 标准中文域名；细分考点、判断原则与易错点", plainLanguage: "不少于45字的企业场景通俗解读" })}`;
}

async function generate(question: Question) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(chatEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "你是严谨的 CISSP 中文导师和题库编辑。独立判断知识域，不照抄可能错误的自动分类；只输出有效 JSON。" },
            { role: "user", content: promptFor(question) },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
      const explanation = explanationSchema.parse(parseJson(extractContent(await response.json())));
      assertQuality(question, explanation);
      return explanation;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1_500));
    }
  }
  throw lastError;
}

async function save(file: ExplanationFile) {
  const next: ExplanationFile = { ...file, generatedAt: new Date().toISOString(), model };
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
}

async function main() {
  if (!apiKey) throw new Error("缺少 AI_API_KEY");
  if (!model) throw new Error("缺少 AI_MODEL 或 NEXT_PUBLIC_AI_MODEL");
  const current = JSON.parse(await readFile(outputPath, "utf8")) as ExplanationFile;
  const pending = CISSP2508_QUESTIONS
    .filter((question) => force || !current.explanations[question.id])
    .slice(0, limit);
  console.log(`Generating ${pending.length} explanations with ${model}; concurrency ${concurrency}.`);
  const failures: Array<{ id: string; error: string }> = [];
  for (let offset = 0; offset < pending.length; offset += concurrency) {
    const batch = pending.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map(async (question) => ({ question, explanation: await generate(question) })));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") current.explanations[result.value.question.id] = result.value.explanation;
      else failures.push({ id: batch[index].id, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    });
    await save(current);
    console.log(`Progress ${Math.min(offset + batch.length, pending.length)}/${pending.length}; stored ${Object.keys(current.explanations).length}.`);
  }
  if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    throw new Error(`${failures.length} explanations failed; successful results were saved and can be resumed.`);
  }
}

void main();
