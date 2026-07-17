const AI_ROUTE = "/api/ai/chat/completions";
const AI_HEALTH_ROUTE = "/api/ai/health";
const MAX_BODY_BYTES = 1_500_000;

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function chatEndpoint(input) {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AI 接口只支持 HTTP 或 HTTPS");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (!/\/chat\/completions$/i.test(url.pathname)) url.pathname += "/chat/completions";
  return url.toString();
}

function providerConfig(payload, env) {
  const provider = payload?.provider && typeof payload.provider === "object" && !Array.isArray(payload.provider)
    ? payload.provider
    : {};
  const requestBaseUrl = stringValue(provider.baseUrl);
  const requestApiKey = stringValue(provider.apiKey);

  // A browser-supplied endpoint may only be used with its matching browser-supplied key.
  // This prevents an arbitrary endpoint from receiving the server-managed secret.
  if (requestApiKey) {
    if (!requestBaseUrl) throw new Error("自定义 AI 配置缺少接口地址");
    return { baseUrl: requestBaseUrl, apiKey: requestApiKey };
  }

  return {
    baseUrl: stringValue(env.AI_BASE_URL),
    apiKey: stringValue(env.AI_API_KEY),
  };
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}

async function parseRequestBody(request) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_BODY_BYTES) throw new Error("请求体超过 AI 代理限制");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new Error("请求体超过 AI 代理限制");
  }
  return JSON.parse(text);
}

export async function handleAIRequest(request, env) {
  const url = new URL(request.url);
  if (!isSameOrigin(request)) return jsonResponse(403, { error: "Origin not allowed" });

  if (request.method === "GET" && url.pathname === AI_HEALTH_ROUTE) {
    return jsonResponse(200, {
      ok: true,
      mode: "same-origin",
      environmentDefaults: {
        baseUrl: Boolean(stringValue(env.AI_BASE_URL)),
        apiKey: Boolean(stringValue(env.AI_API_KEY)),
      },
    });
  }
  if (request.method !== "POST" || url.pathname !== AI_ROUTE) {
    return jsonResponse(404, { error: "Not found" });
  }

  try {
    const payload = await parseRequestBody(request);
    const completionRequest = payload?.request;
    if (!completionRequest || typeof completionRequest !== "object" || Array.isArray(completionRequest)) {
      return jsonResponse(400, { error: "无效的 Chat Completions 请求" });
    }
    const { baseUrl, apiKey } = providerConfig(payload, env);
    if (!baseUrl || !apiKey) {
      return jsonResponse(400, { error: "AI 服务尚未配置，请在 Sites 托管环境设置 AI_BASE_URL 和 AI_API_KEY，或在浏览器中填写完整的自定义配置" });
    }

    const upstream = await fetch(chatEndpoint(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(completionRequest),
      signal: AbortSignal.timeout(120_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 代理请求失败";
    return jsonResponse(502, { error: message });
  }
}

async function serveAssets(request, env) {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) return response;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/")) {
    return env.ASSETS.fetch(new Request(new URL(url.pathname + "index.html", url)));
  }
  return response;
}

const worker = {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/api/ai/")) return handleAIRequest(request, env);
    return serveAssets(request, env);
  },
};

export default worker;
