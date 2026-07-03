---
name: Well-known files via Vite proxy
description: Pattern for serving /robots.txt and /sitemap.xml from a backend API through a Vite dev/preview plugin in a monorepo with separate frontend/API services
---

In this monorepo, the frontend (Vite) and API server are separate services behind a shared reverse proxy that routes by path. Well-known files like `/robots.txt` and `/sitemap.xml` need to live at the site root, but that root path is served by the frontend service, not the API.

**Why:** Search engines and crawlers expect these files at the domain root, but the API service (which has the DB-backed content needed to build them) is mounted under `/api`. There's no way to make the API service itself answer requests at `/robots.txt`/`/sitemap.xml` without also owning `/`.

**How to apply:** Add a small custom Vite plugin (`configureServer`/`configurePreviewServer` hooks) in the frontend's `vite.config.ts` that intercepts requests for `/robots.txt` and `/sitemap.xml`, then proxies them server-side to the API service (e.g. `http://localhost:80/api/sitemap.xml?origin=...`), forwarding the original request's host/protocol as an `origin` query param so the generated URLs are correct. This works in both dev and preview modes since both use Vite's server hooks.
