---
name: Development marketplace schema
description: How to handle an older development database when adding marketplace request storage
---

The development database can lag behind the marketplace catalog schema already present in code, even after applying the versioned request migration. If the API startup backfill fails on missing catalog columns, inspect the database schema and align development with the current Drizzle schema before diagnosing request routes. Do not infer that the request migration itself is broken from an unrelated missing catalog column.

**Why:** An otherwise successful request migration was followed by startup failures on older operator and vehicle catalog columns. The development schema sync resolved those missing fields without replacing or resetting data.

**How to apply:** Check startup logs and the actual development schema. Use the project's managed development schema flow when needed; never manually apply these SQL files to managed production, whose Publish flow handles schema changes.