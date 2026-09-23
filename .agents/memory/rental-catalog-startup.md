---
name: Startup rental catalog backfill
description: Why the rental catalog seed is shared between manual runs and API startup.
---

The rental catalog backfill is intentionally a shared database-package operation used by both the CLI and API startup. API startup completes it before opening the listening port, and a failure prevents the server from accepting traffic.

**Why:** Development and production can have different database contents even when the code is identical. Keeping the manual seed and startup repair on one implementation prevents a successful local seed from masking a missing production initialization path.

**How to apply:** Keep future catalog migrations idempotent, transactional, and narrowly scoped. Preserve legacy rows and unrelated add-ons, and only repair CMS content when the full known contaminated marker matches exactly.