import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import { getCohortRetention, getCohortRevenue, getCohortChurn } from "../controllers/cohortAnalysisController";
const router = Router();
router.use(authenticateToken as any);
router.get("/retention", getCohortRetention as any);
router.get("/revenue",   getCohortRevenue   as any);
router.get("/churn",     getCohortChurn     as any);
export default router;
