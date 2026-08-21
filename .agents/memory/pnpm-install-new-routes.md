---
name: pnpm install after new server routes
description: When new API route files import workspace-level deps (zod, drizzle-zod), pnpm must re-link those packages into the artifact's node_modules or esbuild fails to bundle them.
---

# Problem

The API server uses esbuild to bundle `artifacts/api-server/src` into `dist/index.mjs`. esbuild resolves modules from the source file's directory upward. In this pnpm workspace, packages declared in a workspace package's `dependencies` are NOT automatically symlinked into that package's `node_modules` until `pnpm install` is run. If a new route file imports a package (e.g. `zod/v4`) that wasn't previously imported by any file in that artifact, the symlink may be absent and esbuild will fail with `Could not resolve "zod/v4"`.

**Why:** pnpm strict isolation means root `node_modules` only gets symlinks for packages declared at root level; artifact-level packages get their symlinks under `artifacts/<name>/node_modules`. A missing symlink there causes esbuild (which starts resolution from the source dir) to not find the package.

**How to apply:** After adding new route files that import any package (especially `zod`, `drizzle-zod`, or other workspace-catalog deps), run:
```
pnpm install --filter @workspace/api-server
```
Then rebuild. This creates the missing symlinks without a full workspace install.

Do NOT add `zod` to esbuild `external` as a workaround — the artifact's `dist/` is ESM and the runtime also cannot find externalized packages from the artifact directory.
