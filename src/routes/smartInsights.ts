import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { getInsights, markInsightRead, markAllInsightsRead } from "../controllers/smartInsightsController";
const router = Router();
router.use(authenticateToken as any);
router.get("/",               getInsights         as any);
router.patch("/read-all",     markAllInsightsRead as any);
router.patch("/:id/read",     markInsightRead     as any);
export default router;
