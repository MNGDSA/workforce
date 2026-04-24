#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fg from "fast-glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const roots = ["server", "shared", "client/src"];
const ignore = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "e2e-tests/**",
  "**/e2e-tests/**",
];

const patterns = roots.map((root) => `${root}/**/*.test.ts`);

const files = await fg(patterns, {
  cwd: projectRoot,
  ignore,
  onlyFiles: true,
  unique: true,
  dot: false,
});

files.sort();

if (files.length === 0) {
  console.log("No test files found.");
  process.exit(0);
}

const extraArgs = process.argv.slice(2);

console.log(`Running ${files.length} test file(s):`);
for (const f of files) console.log(`  - ${f}`);

const child = spawn("tsx", ["--test", ...extraArgs, ...files], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("error", (err) => {
  console.error(`Failed to launch tsx: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
