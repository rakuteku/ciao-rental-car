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

## Admin Credentials

- Username: `admin`
- Password: `ciao2024`
- URL: `/admin/login`

## Features

1. **Landing Page** — Hero with booking form, car listings, "Why CIAO" features section
2. **Car Listings** — 3 vehicles: Toyota Alphard (¥18,000/day), Toyota Vellfire (¥20,000/day), Toyota Sienta (¥9,800/day)
3. **Booking Flow** — Car selection, date picker, contact form, total price calculation
4. **Admin Panel** — Auth-protected dashboard, car pricing editor, availability manager, bookings list

## Database Schema

- `cars` — id, name, passenger_capacity, price_per_day, image_url, is_available, description
- `bookings` — id, car_id, pickup_date, return_date, pickup_location, return_location, name, email, phone, total_price, created_at
- `availability` — id, car_id, date, is_available

## API Endpoints

- `GET /api/cars` — list all cars
- `GET /api/cars/:id` — get car details
- `GET /api/cars/:id/availability` — get car availability
- `POST /api/bookings` — create booking
- `POST /api/admin/login` — admin login
- `POST /api/admin/logout` — admin logout
- `GET /api/admin/me` — check auth status
- `GET /api/admin/bookings` — list all bookings
- `GET /api/admin/cars` — list all cars (admin)
- `PUT /api/admin/cars/:id` — update car pricing/availability
- `POST /api/admin/cars/:id/availability` — set date availability
- `GET /api/admin/stats` — dashboard statistics

## Pickup Locations

- Sapporo Station
- New Chitose Airport
- Sapporo City Center

## Notes

- `lib/api-zod/src/index.ts` must only export `./generated/api` (not `./generated/types` — causes name conflicts with Zod schemas)
- Session secret is stored in `SESSION_SECRET` environment variable
