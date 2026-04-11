import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getRules, createRule, updateRule, deleteRule,
  getSequences, createSequence, deleteSequence,
  sendReminder, getLogs,
} from "../controllers/paymentRemindersController";
 
const router2 = Router();
router2.use(authenticateToken as any);
router2.get("/rules",             getRules as any);
router2.post("/rules",            createRule as any);
router2.put("/rules/:id",         updateRule as any);
router2.delete("/rules/:id",      deleteRule as any);
router2.get("/sequences",         getSequences as any);
router2.post("/sequences",        createSequence as any);
router2.delete("/sequences/:id",  deleteSequence as any);
router2.post("/send",             sendReminder as any);
router2.get("/logs",              getLogs as any);
export default router2;
