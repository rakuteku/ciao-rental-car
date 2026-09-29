import app from "./app";
import { logger } from "./lib/logger";
import { startRentalNotificationWorker } from "./lib/rental-events";
import { runRentalCatalogBackfill } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  await runRentalCatalogBackfill((message) => {
    logger.info({ message }, "Rental catalog backfill");
  });
  startRentalNotificationWorker();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

startServer().catch((err) => {
  logger.error({ err }, "Rental catalog backfill failed; server will not start");
  process.exit(1);
});
