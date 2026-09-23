/**
 * Run with: pnpm --filter @workspace/scripts run seed-rental
 */
import { runRentalCatalogBackfill } from "@workspace/db";

runRentalCatalogBackfill().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});