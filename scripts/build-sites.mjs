import { cp, mkdir, rm } from "node:fs/promises";
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
await cp(resolve(root, "scripts", "sites-worker.mjs"), resolve(dist, "server", "index.js"));
