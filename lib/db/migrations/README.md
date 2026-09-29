# Versioned marketplace migration

`0022_marketplace_tenant_foundation.up.sql` is a reviewed, versioned PostgreSQL
migration for controlled development rehearsal and external databases.
`down.sql` is its explicit rollback. These SQL files are not the mechanism for
managed Replit production.

## Managed Replit production: staged Publish rollout

Do not apply these SQL files manually to managed Replit production. Replit's
Publish flow computes and applies the production schema diff. Use two schema
stages so populated tables are never made `NOT NULL` before their rows have
owners:

1. Publish the first-stage Drizzle schema with nullable `operator_id` columns
   on vehicles, add-ons, reservations, and driver documents. New operator and
   verification tables and nullable ownership columns can be added without
   requiring values on existing records. Do not include `NOT NULL` constraints
   in this Publish diff.
2. On application startup, `runRentalCatalogBackfill` inserts/resolves the
   stable `platform` operator and assigns it to rows whose ownership is null
   across those four tables. This runs transactionally before the API calls
   `listen`; startup fails before serving requests if the transaction fails.
   When `RENTAL_MARKETPLACE_ENABLED=true`, startup also explicitly checks all
   four tables and fails closed if any null owner remains. No DDL runs at
   startup.
3. Before hardening, verify there are no remaining null owners in all four
   tables. In a later schema release, change the Drizzle ownership columns to
   `NOT NULL` and use the managed Publish diff to apply those constraints.
   Never request that constraint diff before the backfill has completed and
   been verified.

The managed Publish schema diff does not seed the platform row; startup
backfill does. Do not connect to managed production with `psql`, and do not use
`drizzle-kit push` or `push-force` as a substitute for the managed Publish
flow.

## Controlled development / external database rehearsal

1. Take a restorable backup and restore it into a disposable database.
2. Review the SQL and affected-row counts on that database. For a rollback-only
   dry run, use a temporary copy of `up.sql`: remove its outer `BEGIN;` and
   final `COMMIT;`, append `ROLLBACK;`, and run it with
   `psql -v ON_ERROR_STOP=1`. This verifies statements without retaining their
   changes. Never use a rollback-only dry run as a backup or production plan.
3. Apply the unmodified migration to the disposable database and validate its
   constraints and data. For a controlled development or external database,
   apply with:

   ```sh
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0022_marketplace_tenant_foundation.up.sql
   ```

4. Record version `0022` in that database's migration ledger. This repository
   does not automatically apply SQL migrations at startup.

The versioned SQL migration is for controlled development/external databases:
it creates/resolves the stable `platform` slug, backfills existing ownership,
then applies `NOT NULL` constraints within the same transaction. Existing
primary keys are retained. The legacy-car link is nullable and unique; only the
known Alphard, Vellfire, and Sienta seed name/slug pairs are reconciled. If both
canonical and old-slug vehicle rows exist for one legacy car, only the
canonical row gets the link; otherwise one old-slug match is selected. Other
rows remain unmapped, and status/publication fields are untouched. No catalog
fields, identities, or unrelated rows are rewritten.

The operator row exposes `verification_status` independently from its
operational `status`; marketplace auth checks for `approved`. Staff roles are
`owner`, `manager`, `counter`, and `operations`; `active` is kept consistent
with the staff lifecycle status, and each staff row requires a password hash.

## Rollback

Rollback guidance applies only to controlled development/external databases.
For managed Replit production, use the managed Publish/recovery process rather
than these SQL files. SQL rollback is explicit and destructive to marketplace
foundation data. Before running `0022_marketplace_tenant_foundation.down.sql`,
back up any new operators, staff, verifications, documents, and ownership
assignments. The down migration drops the new tables/types and ownership/link
columns, including any marketplace data written after deployment. Apply it only
if the application has not started relying on those records, or after separately
exporting and reconciling them:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/migrations/0022_marketplace_tenant_foundation.down.sql
```

Do not use `drizzle-kit push --force` as a rollback mechanism.

## Checks

The static migration contract test checks that ownership backfill, known legacy
link reconciliation, and rollback counterparts remain present:

```sh
pnpm --filter @workspace/db run test:migrations
```