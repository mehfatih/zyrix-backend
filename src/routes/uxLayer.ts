import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getLangPrefs,
  updateLangPrefs,
  logInteraction,
  getInteractionStats,
  logHelpSearch,
  getTopHelpSearches,
  getDesignPrefs,
  updateDesignPrefs,
  getA11yPrefs,
  updateA11yPrefs,
} from "../controllers/uxLayerController";

const router = Router();
router.use(authenticateToken as any);

// Feature 46 — Language
router.get("/lang",              getLangPrefs as any);
router.patch("/lang",            updateLangPrefs as any);

// Feature 47 — Micro-interactions
router.post("/interaction",      logInteraction as any);
router.get("/interaction/stats", getInteractionStats as any);

// Feature 48 — Help
router.post("/help/search",      logHelpSearch as any);
router.get("/help/top-searches", getTopHelpSearches as any);

// Feature 49 — Design
router.get("/design",            getDesignPrefs as any);
router.patch("/design",          updateDesignPrefs as any);

// Feature 50 — Accessibility
router.get("/a11y",              getA11yPrefs as any);
router.patch("/a11y",            updateA11yPrefs as any);

export default router;
