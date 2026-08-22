---
name: Generated client freshness
description: Frontend checks can resolve stale generated-client declarations after API work lands.
---

After API contract or generated-client changes are merged, run the workspace library typecheck before checking the frontend. The frontend package resolves the generated client through its built declarations, so a direct app typecheck can report missing hooks or types even when the source and API contract are current.

**Why:** The workspace keeps generated client source and built declaration output separately, and merged work can update one before the other.

**How to apply:** Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/ciao-rental run typecheck` or the full workspace typecheck when rental API changes are present.