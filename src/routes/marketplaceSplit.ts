import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getVendors, createVendor, updateVendor, deleteVendor,
  getSplitRules, createSplitRule, deleteSplitRule,
  processSplit, getSplitLogs,
} from "../controllers/marketplaceSplitController";
 
const router3 = Router();
router3.use(authenticateToken as any);
router3.get("/vendors",             getVendors as any);
router3.post("/vendors",            createVendor as any);
router3.put("/vendors/:id",         updateVendor as any);
router3.delete("/vendors/:id",      deleteVendor as any);
router3.get("/split-rules",         getSplitRules as any);
router3.post("/split-rules",        createSplitRule as any);
router3.delete("/split-rules/:id",  deleteSplitRule as any);
router3.post("/process",            processSplit as any);
router3.get("/logs",                getSplitLogs as any);
export default router3;
