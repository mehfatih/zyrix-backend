// src/routes/featureFlags.ts
import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  listFlags,
  updateFlag,
  bulkUpdateFlags,
  getFlagsMap,
} from "../controllers/featureFlagsController";

const router = Router();

router.use(authenticateToken as any);

router.get("/",       listFlags       as any);
router.get("/map",    getFlagsMap     as any);
router.patch("/bulk", bulkUpdateFlags as any);
router.patch("/:key", updateFlag      as any);

export default router;
