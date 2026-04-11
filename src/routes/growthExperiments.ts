import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getExperiments, createExperiment, getExperiment,
  updateStatus, deleteExperiment, trackEvent, getResults,
} from "../controllers/growthExperimentsController";
 
const router5 = Router();
router5.use(authenticateToken as any);
router5.get("/",                     getExperiments as any);
router5.post("/",                    createExperiment as any);
router5.get("/:id",                  getExperiment as any);
router5.patch("/:id/status",         updateStatus as any);
router5.delete("/:id",               deleteExperiment as any);
router5.post("/events",              trackEvent as any);
router5.get("/:id/results",          getResults as any);
export default router5;
