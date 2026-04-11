import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getSetupProgress,
  completeTask,
  updateWizardStep,
  dismissSetup,
  getUiPreferences,
  updateUiPreferences,
  logPerformance,
  getPerformanceStats,
  logEmptyStateAction,
} from "../controllers/setupProgressController";

const router = Router();
router.use(authenticateToken as any);

router.get("/",              getSetupProgress as any);
router.post("/task",         completeTask as any);
router.post("/wizard-step",  updateWizardStep as any);
router.post("/dismiss",      dismissSetup as any);
router.get("/ui-prefs",      getUiPreferences as any);
router.patch("/ui-prefs",    updateUiPreferences as any);
router.post("/perf-log",     logPerformance as any);
router.get("/perf-stats",    getPerformanceStats as any);
router.post("/empty-action", logEmptyStateAction as any);

export default router;
