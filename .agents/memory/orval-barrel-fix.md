---
name: Orval barrel export fix
description: lib/api-zod/src/index.ts codegen adds a broken export line that must be removed after every orval run
---

Whenever `pnpm --filter @workspace/api-spec run codegen` (orval) runs, it rewrites `lib/api-zod/src/index.ts` to export both `./generated/api` and `./generated/api.schemas`. Only `./generated/api` actually exists as a file — the `api.schemas` export breaks the build/typecheck.

**Why:** orval's default barrel-generation behavior doesn't match this repo's generated file layout; it assumes a schemas file that isn't produced here.

**How to apply:** After every codegen run, immediately open `lib/api-zod/src/index.ts` and remove/fix any export referencing `./generated/api.schemas`, keeping only `export * from "./generated/api"`. Do this before typechecking or the error will look like a random regression.
