import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getChannels, upsertChannel,
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  sendNotification, getLogs,
} from "../controllers/advancedNotificationsController";
 
const router = Router();
router.use(authenticateToken as any);
router.get("/channels",           getChannels as any);
router.post("/channels",          upsertChannel as any);
router.get("/templates",          getTemplates as any);
router.post("/templates",         createTemplate as any);
router.put("/templates/:id",      updateTemplate as any);
router.delete("/templates/:id",   deleteTemplate as any);
router.post("/send",              sendNotification as any);
router.get("/logs",               getLogs as any);
export default router;
