// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Feature Flags Routes
// ─────────────────────────────────────────────────────────────

import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  listFlags,
  updateFlag,
  bulkUpdateFlags,
  getFlagsMap,
} from "../controllers/featureFlagsController";

const router = Router();

// All routes require auth
router.use(authenticateToken);

router.get("/",         listFlags);       // GET  /api/feature-flags
router.get("/map",      getFlagsMap);     // GET  /api/feature-flags/map  ← app uses this on startup
router.patch("/bulk",   bulkUpdateFlags); // PATCH /api/feature-flags/bulk
router.patch("/:key",   updateFlag);      // PATCH /api/feature-flags/:key

export default router;
