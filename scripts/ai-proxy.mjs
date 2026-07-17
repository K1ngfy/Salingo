import { createServer } from "node:http";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const HOST = "127.0.0.1";
const PORT = Number(process.env.SALINGO_AI_PROXY_PORT || 43128);
const envBaseUrl = process.env.AI_BASE_URL || "";
const envApiKey = process.env.AI_API_KEY || "";

function isAllowedOrigin(origin) {
  return !origin || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function setCors(response, origin) {
  if (origin && isAllowedOrigin(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Max-Age", "86400");
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_500_000) throw new Error("请求体超过本地代理限制");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function chatEndpoint(input) {
  const url = new URL(input.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("AI 接口只支持 HTTP 或 HTTPS");
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!/\/chat\/completions$/i.test(url.pathname)) url.pathname += "/chat/completions";
  return url.toString();
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  setCors(response, origin);
  if (!isAllowedOrigin(origin)) return sendJson(response, 403, { error: "Origin not allowed" });
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, {
      ok: true,
      mode: "provider-agnostic",
      environmentDefaults: { baseUrl: Boolean(envBaseUrl), apiKey: Boolean(envApiKey) },
    });
  }
  if (request.method !== "POST" || request.url !== "/chat/completions") {
    return sendJson(response, 404, { error: "Not found" });
  }
  try {
    const payload = await readJson(request);
    const baseUrl = payload?.provider?.baseUrl?.trim() || envBaseUrl.trim();
    const apiKey = payload?.provider?.apiKey?.trim() || envApiKey.trim();
    const completionRequest = payload?.request;
    if (!baseUrl || !apiKey) return sendJson(response, 400, { error: "请配置 AI 接口地址和 API Key" });
    if (!completionRequest || typeof completionRequest !== "object" || Array.isArray(completionRequest)) {
      return sendJson(response, 400, { error: "无效的 Chat Completions 请求" });
    }
    const upstream = await fetch(chatEndpoint(baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(completionRequest),
      signal: AbortSignal.timeout(120_000),
    });
    const responseBody = await upstream.text();
    response.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(responseBody);
  } catch (error) {
    const message = error instanceof Error ? error.message : "本地代理请求失败";
    sendJson(response, 502, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Provider-agnostic AI proxy ready at http://${HOST}:${PORT}`);
});
