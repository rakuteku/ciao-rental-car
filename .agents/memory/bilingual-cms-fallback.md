---
name: Bilingual CMS fallback
description: Policy for localized public content and SEO when Japanese copy has not been authored.
---

Japanese page content and metadata start empty and are never auto-translated from the English source. The public site resolves each empty Japanese field to its matching English field.

**Why:** The existing site did not contain verified Japanese source copy. Presenting fabricated translations would be misleading, while field-level fallback keeps the Japanese experience complete during editorial rollout.

**How to apply:** New public text must be added to both the English CMS defaults and the localized editor shape. Treat Japanese as optional, preserve an intentional blank value, and use the English equivalent only at rendering time.