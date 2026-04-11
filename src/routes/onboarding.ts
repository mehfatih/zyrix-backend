import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getOnboardingStatus,
  updateOnboardingStep,
  completeOnboarding,
  autoFillKYC,
} from "../controllers/onboardingController";

const router = Router();

router.use(authenticateToken as any);

router.get("/", getOnboardingStatus as any);
router.post("/step", updateOnboardingStep as any);
router.post("/complete", completeOnboarding as any);
router.post("/auto-fill", autoFillKYC as any);

export default router;
