import { existsSync, rmSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const workspaceRoot = resolve(import.meta.dirname, "..");
const appRoot = resolve(workspaceRoot, "artifacts/ciao-rental");
const outputDir = resolve(appRoot, "dist/public");
const stagingSource = resolve(appRoot, "staging/cloudflare-pages");
const zipPath = resolve(workspaceRoot, "ciao-rental-pages-staging.zip");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: appRoot,
    stdio: "inherit",
    ...options,
  });
}

run("pnpm", ["run", "build:pages-staging"]);

if (!existsSync(resolve(outputDir, "index.html"))) {
  throw new Error(`Staging build did not produce ${resolve(outputDir, "index.html")}`);
}

copyFileSync(
  resolve(stagingSource, "_worker.js"),
  resolve(outputDir, "_worker.js"),
);
copyFileSync(
  resolve(stagingSource, "robots.txt"),
  resolve(outputDir, "robots.txt"),
);

if (existsSync(zipPath)) {
  rmSync(zipPath);
}

run("zip", ["-qr", zipPath, "."], { cwd: outputDir });

console.log(`Cloudflare Pages staging bundle: ${zipPath}`);