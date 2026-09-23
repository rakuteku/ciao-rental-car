# CIAO Rental Car

## Overview

Full-stack all-in-one Hokkaido travel site for CIAO, a Sapporo-based building offering short-term lodging, monthly stays, and rental car service ("All-in-one package in Hokkaido"). The front page (`/`) is a DB-backed overview of all three services; the original rental car booking flow lives under `/rentalcar`; short-term lodging rooms are DB-backed listings under `/lodging`. Admin CMS for editing content, SEO, sitemap/robots, fleet, and lodging rooms is available under `/admin`.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Frontend**: React + Vite + Tailwind CSS
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Session-based (express-session) for admin panel

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- After codegen: fix `lib/api-zod/src/index.ts` — must only export `./generated/api` (orval adds `./generated/api.schemas` which doesn't exist)

## Admin Credentials

- Username: `ADMIN_USERNAME` (defaults to `admin`)
- Password: `ADMIN_PASSWORD` (must be at least 12 characters in production)
- URL: `/admin/login`

## Site Routes

- `/` — all-in-one front page: hero, lodging overview + featured rooms, monthly stay overview, rental car overview, "Why Choose Us", location/access (Google Maps embed), contact — all content served from `GET /api/content/home`; featured rooms from `GET /api/rooms?featured=true`
- `/lodging` — short-term lodging room listing (published rooms, ordered by admin-defined sort order)
- `/lodging/:slug` — room detail page: image gallery, amenities, house rules, check-in/out times, contact-to-book CTA
- `/rentalcar` — rental car search + featured vehicles (formerly the site's home page)
- `/rentalcar/cars` — full fleet listing
- `/rentalcar/cars/:id` — car detail + booking form
- `/rentalcar/booking/success` — booking confirmation

## Admin Panel Routes

- `/admin/login` — login page
- `/admin/dashboard` — stats overview
- `/admin/fleet` — fleet management (CRUD for cars)
- `/admin/lodging` — lodging room management: CRUD (Room Details / SEO tabs per room), up/down reorder, featured/published toggle switches, delete confirmation
- `/admin/bookings` — view all bookings
- `/admin/content` — edit page content (Home Page / Rental Car Page tabs: hero, lodging, monthly stay, rental car overview, why-choose-us, location, contact, pricing table, plans, add-ons, important notes). Changes reflect immediately on public pages.
- `/admin/seo` — edit per-page SEO metadata (Home Page / Rental Car Page / Lodging Page tabs: URL slug, meta title, meta description, keywords, Open Graph title/description/image). Feeds `/sitemap.xml` and public `<head>` meta tags. Per-room SEO is edited inline on each room in `/admin/lodging`, not here.

## Features

1. **All-in-One Front Page** — Hero, lodging/monthly-stay/rental-car overviews (with featured rooms), why-choose-us, location/access map, contact — content pulled from the `page_content` table
2. **Short-Term Lodging** — Public room listing (`/lodging`) and detail pages (`/lodging/:slug`) backed by the `rooms` table; admin CRUD with reorder, featured, and publish toggles, plus per-room SEO fields
3. **Rental Car Search & Listings** — Fleet of vehicles at `/rentalcar`, each showing model, name, year, capacity, fuel efficiency, price
4. **Booking Flow** — Car detail page, date picker, location dropdowns, per-car airport fee breakdown
5. **Airport Fee Pricing** — Per-car fees applied when New Chitose Airport is selected (pickup/drop-off)
6. **Fleet Management** — Admin CRUD: add/edit/delete cars with all fields including per-car airport fees, image URLs, availability toggles and date overrides

## Database Schema

- `cars` — id, model, name, year, passenger_capacity, fuel_efficiency, price_per_day, airport_pickup_fee, airport_dropoff_fee, image_urls (jsonb), image_url, is_available, description
- `bookings` — id, car_id, pickup_date, return_date, pickup_location, return_location, name, email, phone, airport_pickup_fee, airport_dropoff_fee, total_price, created_at
- `availability` — id, car_id, date, is_available
- `rooms` — id, slug (unique), title, room_type, max_guests, beds, size, floor, description, starting_price, amenities (jsonb array), images (jsonb array), cover_image, house_rules, check_in_time, check_out_time, featured, published, sort_order, meta_title, meta_description, og_title, og_description, og_image, updated_at
- `page_content` — id, page (unique key e.g. "home"), content (jsonb, structured section data), updated_at — seeded with defaults on first read if missing
- `page_seo` — id, page (unique key, e.g. "home", "rentalcar", "lodging"), slug, meta_title, meta_description, keywords, og_title, og_description, og_image, updated_at — seeded with defaults on first read if missing

## API Endpoints

- `GET /api/cars` — list all cars
- `GET /api/cars/:id` — get car details
- `GET /api/cars/:id/availability` — get car availability
- `POST /api/bookings` — create booking (server-side applies per-car airport fees)
- `GET /api/rooms` — list published rooms, ordered by sort order (supports `?featured=true` filter)
- `GET /api/rooms/:slug` — get room details by slug
- `GET /api/content/:page` — get content blob for a page (auto-seeds defaults on first call)
- `GET /api/seo/:page` — get SEO metadata for a page (auto-seeds defaults on first call)
- `GET /sitemap.xml` — dynamically generated sitemap (from SEO slugs plus `/lodging` + one entry per published room), `GET /robots.txt` — robots file referencing the sitemap (served via a Vite dev/preview proxy plugin in `vite.config.ts`, proxied to the API server)
- `POST /api/admin/login` — admin login
- `POST /api/admin/logout` — admin logout
- `GET /api/admin/me` — check auth status
- `GET /api/admin/bookings` — list all bookings
- `GET /api/admin/cars` — list all cars (admin)
- `POST /api/admin/cars` — create new car
- `PUT /api/admin/cars/:id` — update car (all fields)
- `DELETE /api/admin/cars/:id` — delete car
- `POST /api/admin/cars/:id/availability` — set date availability
- `GET /api/admin/rooms` — list all rooms, including unpublished (admin)
- `POST /api/admin/rooms` — create new room
- `PUT /api/admin/rooms/:id` — update room (all fields, including SEO fields)
- `DELETE /api/admin/rooms/:id` — delete room
- `POST /api/admin/rooms/reorder` — reorder rooms (body: `{ orderedIds: number[] }`)
- `GET /api/admin/stats` — dashboard statistics
- `PUT /api/admin/content/:page` — update page content blob (allowlisted pages only: `home`, `rentalcar`)
- `PUT /api/admin/seo/:page` — update page SEO metadata (allowlisted pages only: `home`, `rentalcar`, `lodging`)

## Airport Fee Logic

Total = (price_per_day × days) + airport_pickup_fee (if pickup = airport) + airport_dropoff_fee (if return = airport)
- Fees are stored **per car** in the `cars` table (not global)
- Backend reads from car record on booking creation
- Frontend uses car's own fee fields for live price breakdown
- If fee = 0, UI shows "Free" badge

## Pickup Locations

- Sapporo Station
- New Chitose Airport
- Sapporo City Center

## Notes

- `lib/api-zod/src/index.ts` must only export `./generated/api` (not `./generated/api.schemas` — orval adds it but the file doesn't exist)
- Session secret is stored in `SESSION_SECRET` environment variable
- `image_urls` is jsonb array in DB; `image_url` (text) is kept for backwards compat — always sync them
