# Rental exceptions: controlled rollout

This is a **development rehearsal**, not authorization to operate an insurance, legal, payout, or email service. Do not switch on production until the operator, insurer and payment owner have approved the policies and a real provider configuration has been verified. Keep `RENTAL_MARKETPLACE_ENABLED` unset or `false` to leave the legacy rental flow active.

## Schema and deployment

- Review `lib/db/migrations/0027_rental_exceptions.up.sql` and `0028_rental_exceptions.up.sql` with their paired down scripts before running them on a user-managed development database. The Drizzle schema is in `lib/db/src/schema/rental-exceptions.ts`.
- Managed Replit production uses its Publish schema diff, **not** manual application of these SQL files. Follow `lib/db/migrations/README.md`; stage schema changes and back up data before publishing. Down migrations delete exception records and must not be run on production with real claims/evidence.
- Existing reservation, payment and claim states are intentionally independent. A claim does not make a reservation paid, and an accepted refund request does not prove the provider sent money. Maintain an audit trail for all financial and safety actions.

## Configuration

| Setting | Purpose |
| --- | --- |
| `RENTAL_MARKETPLACE_ENABLED=true` | Opts into marketplace routes and exception UI; unset/false leaves legacy routes and prices in place. |
| `STRIPE_SECRET_KEY` and existing Stripe webhook settings | Live provider operations; without a verified provider, payment/refund steps must fail closed. |
| `RENTAL_PUBLIC_BASE_URL` | Checkout redirect origin. Must be a reviewed public URL, not a development-domain guess. |
| `SMTP_HOST`, `SMTP_FROM`, optionally `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Delivery of queued notifications. Without SMTP, do not claim messages were delivered. |
| App Storage environment configured for existing private rental evidence | Evidence bytes remain private, never stored as a public URL. Test download permissions before rollout. |

Never put credentials in source, screenshots, or this document. Confirm actual provider webhooks, reconciliation, refund failure paths, recipient emails, evidence retention, and legal consent wording in a staging environment. Do not label an unconfigured charge or refund as completed.

## Role boundaries

| Action | Booking customer | Owning operator/staff | Platform admin | Other operator / anonymous |
| --- | --- | --- | --- | --- |
| See own exceptions, emergency contact and evidence metadata | Yes, after booking lookup | Yes, own reservations | Yes | No |
| Quote/accept cancellation and extension | Yes, explicit consent | Operational resolution/alternative | Oversight | No |
| Report incident | Yes | Yes, own vehicle | Yes | No |
| Mark unsafe vehicle safe again | No | No | Yes, after review | No |
| Submit itemized claim/private evidence | No | Yes, own reservation | Yes | No |
| Respond/dispute claim | Yes | No | No | No |
| Approve claim/provider collection | No | No | Yes, after evidence review | No |

## API routes

- Customer: `POST /api/rental/exceptions/reservations/:id/cancellation/{quote,confirm,accept-alternative}`, `GET .../cancellation/offers`, `POST .../extension/{quote,checkout,verify-payment}`, `GET .../extension/status?quoteId=`, `/alternatives/{accept,verify-payment}`, and `GET .../alternatives`. The booking-lookup session must match the reservation. A quoted refund may require manual review when saved policy terms are not machine-readable.
- Owning operator: `GET/POST /api/partner/rental/exceptions/reservations/:id/alternatives`, `POST .../cancellation/{resolve,offer}`, `GET .../extensions`, and `POST .../extensions/:quoteId/approve` with its quote version. Only the owning partner may submit a choice offer or resolve a consented manual-review cancellation. Operator-initiated offers do not cancel or refund before the customer chooses.
- Customer, owning operator and platform: `GET /api/rental/exceptions/reservations/:id` for incident/claim history; `POST .../incidents` for a report. The operator alias is `/api/rental/exceptions/operator/reservations/:id/incidents`.
- Claims: `POST /api/rental/exceptions/reservations/:id/claims`, `POST /api/rental/exceptions/claims/:claimId/items`, `PATCH .../details`, `POST .../customer-response`; private evidence uses `POST /api/rental/exceptions/reservations/:id/evidence/upload-request`, `PUT` its returned `uploadPath`, then scoped `GET /api/rental/exceptions/evidence/:token`.
- Platform: `POST /api/admin/rental/exceptions/claims/:claimId/decision`, `/incidents/:incidentId/resolve` and `/overdue-alerts/dispatch`. A deduplicated overdue sweep also runs in the API process while the flag is on.

Implementation touches the API router/finance webhook, shared rental exception schema, and booking detail pages for customer, partner and admin. General CMS, lodging, global translation and SEO code is unchanged.

## Staging checklist: twelve acceptance scenarios

Use disposable development bookings and separate browser sessions for customer, partner A, partner B and platform. Record response codes, booking/payment/exception state and notification delivery status, not sensitive evidence bytes.

1. Customer gets the saved-policy cancellation amount and reason **before** accepting; a changed policy does not change the quote already saved.
2. Customer confirms once; cancellation releases inventory; a repeat or stale quote does not duplicate a refund.
3. Staff waiver is justified and audited; operator-initiated cancellation offers customer choice of a valid alternative or full refund; failed provider refund is visible for reconciliation.
4. Extension quote shows exact additional JPY, expiry and explicit payment consent.
5. A simultaneous next booking/hold wins the vehicle lock; extension approval fails without changing return time if turnaround buffer is violated.
6. Provider payment failure or incomplete checkout leaves return time unchanged; successful verified payment extends it once.
7. Overdue reservation alerts both owning operator and platform, and does not silently collect a charge.
8. Accident/breakdown UI shows stop-and-get-safe guidance, Japan police **110**, ambulance/fire **119** and the booking's real operator contact.
9. Incident records location/time, people/police, roadside/insurer, towing/replacement and next booking impact; unsafe vehicle cannot be booked until platform review.
10. Claim requires itemized deductible/repair/cleaning/NOC and private pickup/return/invoice evidence; another operator cannot read or download it.
11. Customer dispute and platform review preserve independent claim and payment states; no disputed charge occurs before approval.
12. Flag **off** and **on** preserve `/cars` IDs/prices and existing bookings, lodging, `/admin/content` editing/publishing, ENG/JP toggle and missing-field English fallback, sitemap/robots and SEO. Complete pickup/return/finance journeys with distinct operator and customer sessions.

## Repeatable flag comparison

Start the managed API workflow against the *same disposable development database* with the flag unset. Use the proxied `/api` endpoint, not the service port:

```sh
TEST_API_BASE_URL=http://localhost:80/api MODE=baseline SNAPSHOT_FILE=/tmp/rental-legacy-baseline.json \
  node artifacts/api-server/test/rental-rollout-smoke.mjs
```

Restart the managed workflow with `RENTAL_MARKETPLACE_ENABLED=true` (through the environment configuration), then run:

```sh
TEST_API_BASE_URL=http://localhost:80/api MODE=compare SNAPSHOT_FILE=/tmp/rental-legacy-baseline.json \
  node artifacts/api-server/test/rental-rollout-smoke.mjs
```

The script checks public fleet/details, lodging/details, content, Japanese content, SEO, sitemap and robots, and anonymous access to booking/admin content. It **does not** exercise authenticated content editing, actual payment, browser translation toggle, webhooks or live email delivery; these require dedicated staging credentials and the role-separated manual journey above. Never claim those scenarios passed based on the snapshot alone.

## Development verification

- Typechecks: shared libraries, API server and CIAO Rental web app passed.
- Database migration tests and saved-policy/legacy trip contract tests passed.
- Isolated PostgreSQL exception integration test passed: flag gating, reservation ownership, saved-policy quote, incident holds (including multiple concurrent unsafe reports), claims/dispute/decision boundaries, and private evidence with provider charging explicitly unconfigured. Extension approval-version and stale-price rules passed focused policy tests, not a live paid-checkout journey.
- Public flag comparison passed using the same development database: legacy fleet/prices, lodging, EN/JA content, SEO, sitemap/robots paths and anonymous access checks matched with the feature off and on. Absolute sitemap origins were normalized because the two API processes had different hosts.
- With the flag enabled, a legacy website/manual booking still uses its original cancellation and document options; marketplace exception panels appear only on marketplace-origin bookings. A signed, asynchronous refund callback now reconciles the linked cancellation exception status as well as the payment ledger; simulated success/failure and out-of-order callbacks passed focused tests. Real provider delivery remains a staging check.
- Remaining staging checks: authenticated CMS edit/publish, browser ENG/JP toggle/fallback and SEO rendering; live Stripe checkout/refund webhooks, real email delivery, policy/legal approval, and operator emergency escalation have **not** been certified here.

## Decisions required before production

- Approved cancellation windows, no-show and weather exceptions, partial taxes/add-ons/deposit treatment, staff waiver authority and written customer consent.
- Insurance reporting obligations, deductible/NOC caps, evidence retention/deletion, and which roles can declare a vehicle roadworthy.
- Verified Stripe refund/charge idempotency and reconciliation on asynchronous provider failure, operator payouts and separate accounting approval.
- Real emergency phone and escalation recipient for every operator, monitored platform escalation channel and SMTP deliverability.