import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getOverview,
  getByBank,
  getByCountry,
  getByMethod,
  getFailureReasons,
} from "../controllers/successRateAnalysisController";

const router = Router();

router.get("/overview",        authenticate, getOverview);
router.get("/by-bank",         authenticate, getByBank);
router.get("/by-country",      authenticate, getByCountry);
router.get("/by-method",       authenticate, getByMethod);
router.get("/failure-reasons", authenticate, getFailureReasons);

export default router;
