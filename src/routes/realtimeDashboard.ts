import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { getLiveMetrics, getDrillDown, recordMetric, getSummary } from "../controllers/realtimeDashboardController";
const router = Router();
router.get( "/live",       authenticateToken, getLiveMetrics);
router.get( "/drill-down", authenticateToken, getDrillDown);
router.get( "/summary",    authenticateToken, getSummary);
router.post("/record",     authenticateToken, recordMetric);
export default router;
