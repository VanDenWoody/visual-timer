// Copies the web app into dist/ for the Tauri build. Tauri refuses a frontend
// folder that also holds src-tauri and node_modules, so the repository root cannot be used.
import { cpSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

// The service worker is left out: the desktop app ships its files and never caches them.
const files = readdirSync(root).filter(
  (name) => /\.(html|css|js|json)$/.test(name) && !name.endsWith(".test.js")
    && !["sw.js", "package.json", "package-lock.json"].includes(name),
);

rmSync(dist, { recursive: true, force: true });
for (const name of files) cpSync(join(root, name), join(dist, name));
cpSync(join(root, "icons"), join(dist, "icons"), { recursive: true });
