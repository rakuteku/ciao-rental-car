# CIAO Rental Car

## Overview

Full-stack rental car reservation web app for CIAO Rental Car, a Sapporo-based car rental service.

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

- Username: `admin`
- Password: `ciao2024`
- URL: `/admin/login`

## Admin Panel Routes

- `/admin/login` — login page
- `/admin/dashboard` — stats overview
- `/admin/fleet` — fleet management (CRUD for cars)
- `/admin/bookings` — view all bookings

## Features

1. **Landing Page** — Hero with Sapporo winter photo, booking form, car listings, "Why CIAO" section
2. **Car Listings** — Fleet of vehicles, each showing model, name, year, capacity, fuel efficiency, price
3. **Booking Flow** — Car detail page, date picker, location dropdowns, per-car airport fee breakdown
4. **Airport Fee Pricing** — Per-car fees applied when New Chitose Airport is selected (pickup/drop-off)
5. **Fleet Management** — Admin CRUD: add/edit/delete cars with all fields including per-car airport fees, image URLs, availability toggles and date overrides

## Database Schema

- `cars` — id, model, name, year, passenger_capacity, fuel_efficiency, price_per_day, airport_pickup_fee, airport_dropoff_fee, image_urls (jsonb), image_url, is_available, description
- `bookings` — id, car_id, pickup_date, return_date, pickup_location, return_location, name, email, phone, airport_pickup_fee, airport_dropoff_fee, total_price, created_at
- `availability` — id, car_id, date, is_available

## API Endpoints

- `GET /api/cars` — list all cars
- `GET /api/cars/:id` — get car details
- `GET /api/cars/:id/availability` — get car availability
- `POST /api/bookings` — create booking (server-side applies per-car airport fees)
- `POST /api/admin/login` — admin login
- `POST /api/admin/logout` — admin logout
- `GET /api/admin/me` — check auth status
- `GET /api/admin/bookings` — list all bookings
- `GET /api/admin/cars` — list all cars (admin)
- `POST /api/admin/cars` — create new car
- `PUT /api/admin/cars/:id` — update car (all fields)
- `DELETE /api/admin/cars/:id` — delete car
- `POST /api/admin/cars/:id/availability` — set date availability
- `GET /api/admin/stats` — dashboard statistics

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
