import { Router, type IRouter } from "express";
import healthRouter from "./health";
import carsRouter from "./cars";
import bookingsRouter from "./bookings";
import availabilityRouter from "./availability";
import adminRouter from "./admin";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(carsRouter);
router.use(bookingsRouter);
router.use(availabilityRouter);
router.use(adminRouter);
router.use(settingsRouter);

export default router;
