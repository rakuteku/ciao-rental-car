---
name: Marketplace publication boundary
description: Why new partner publication decisions do not override the established platform fleet.
---

When the marketplace flag is enabled, apply business, evidence, payout, and configurable policy gates to third-party partner cars, but preserve the platform operator's existing published fleet independently of undecided partner commercial terms. When the flag is disabled, retain the original public fleet behavior entirely.

**Why:** New partner commercial decisions must not be invented or bypassed; simultaneously, introducing those undecided terms must not take existing CIAO rental cars offline.

**How to apply:** Keep partner eligibility checked at every public search, detail, hold, and request boundary. Do not let a partner moderation decision alone make a listing bookable. Exempt only the recognized platform operator from the new partner-specific policy requirements.

Use the same normalized marketplace flag predicate for UI-facing config, direct-booking guards, listing eligibility, pricing, inventory, and document paths.

**Why:** A whitespace/case-tolerant config check can activate the request UI while an exact-string direct-booking guard stays off, bypassing operator approval. Differences in flag parsing are security-relevant here.

**How to apply:** When adding a marketplace flag check, import the shared predicate rather than comparing the environment string directly; test a normalized value such as ` TRUE ` against both request acceptance and direct reservation rejection.

When a marketplace-only router is mounted ahead of legacy routes, disabling it must pass control to the next router rather than return an error for every request.

**Why:** A catch-all flag guard on an early router blocked existing admin reservation endpoints even though none of its marketplace trip paths matched.

**How to apply:** Check routing both with the flag on and off. Under the off state, verify a legacy route still reaches its own authentication or handler, not a marketplace 404.