import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  getLiveMetrics,
  getDrillDown,
  recordMetric,
  getSummary,
} from "../controllers/realtimeDashboardController";

const router = Router();

router.get( "/live",       authenticate, getLiveMetrics);
router.get( "/drill-down", authenticate, getDrillDown);
router.get( "/summary",    authenticate, getSummary);
router.post("/record",     authenticate, recordMetric);

export default router;
