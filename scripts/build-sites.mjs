import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "out");
const dist = resolve(root, "dist");

await execFileAsync("npx", ["next", "build"], { cwd: root, stdio: "inherit" });
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await cp(out, resolve(dist, "client"), { recursive: true });

await writeFile(
  resolve(dist, "server", "index.js"),
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    const url = new URL(request.url);
    if (url.pathname.endsWith("/")) {
      return env.ASSETS.fetch(new Request(new URL(url.pathname + "index.html", url)));
    }
    return response;
  },
};
`,
);
