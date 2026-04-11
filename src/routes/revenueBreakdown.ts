import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getOverview,
  getByMethod,
  getByCountry,
  getByCustomer,
  getByChannel,
  getTimeline,
} from "../controllers/revenueBreakdownController";

const router = Router();

router.get("/overview",    authenticate, getOverview);
router.get("/by-method",   authenticate, getByMethod);
router.get("/by-country",  authenticate, getByCountry);
router.get("/by-customer", authenticate, getByCustomer);
router.get("/by-channel",  authenticate, getByChannel);
router.get("/timeline",    authenticate, getTimeline);

export default router;
