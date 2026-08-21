import { Router, type IRouter } from "express";
import healthRouter from "./health";
import carsRouter from "./cars";
import bookingsRouter from "./bookings";
import availabilityRouter from "./availability";
import adminRouter from "./admin";
import contentRouter from "./content";
import seoRouter from "./seo";
import roomsRouter from "./rooms";
import sitemapRouter from "./sitemap";
import rentalVehiclesRouter from "./rental-vehicles";
import rentalAvailabilityBlocksRouter from "./rental-availability-blocks";
import rentalAddonsRouter from "./rental-addons";
import rentalReservationsRouter from "./rental-reservations";
import rentalOperationsRouter from "./rental-operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(carsRouter);
router.use(bookingsRouter);
router.use(availabilityRouter);
router.use(adminRouter);
router.use(contentRouter);
router.use(seoRouter);
router.use(roomsRouter);
router.use(sitemapRouter);
router.use(rentalVehiclesRouter);
router.use(rentalAvailabilityBlocksRouter);
router.use(rentalAddonsRouter);
router.use(rentalReservationsRouter);
router.use(rentalOperationsRouter);

export default router;
