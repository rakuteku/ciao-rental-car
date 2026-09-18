---
name: Localized CMS fallback
description: Policy for localized public content and SEO when Japanese or Chinese copy has not been authored.
---

Japanese and Simplified Chinese page content and metadata start empty and are never auto-translated from the English source. The public site resolves each empty localized field to its matching English field.

**Why:** The existing site did not contain verified Japanese or Chinese source copy. Presenting fabricated translations would be misleading, while field-level fallback keeps each localized experience complete during editorial rollout.

**How to apply:** New public text must be added to the English CMS defaults and the localized editor shape. Treat Japanese and Chinese as optional, preserve intentional blank values, and use the English equivalent only at rendering time. API localized-route responses must apply this fallback recursively; admin/API records must preserve blanks.