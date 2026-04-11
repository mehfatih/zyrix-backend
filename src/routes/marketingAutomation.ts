import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getCampaigns, createCampaign, updateCampaign, deleteCampaign, sendCampaign,
  getAutomations, createAutomation, toggleAutomation, deleteAutomation,
  trackEvent,
} from "../controllers/marketingAutomationController";
 
const router4 = Router();
router4.use(authenticateToken as any);
router4.get("/campaigns",               getCampaigns as any);
router4.post("/campaigns",              createCampaign as any);
router4.put("/campaigns/:id",           updateCampaign as any);
router4.delete("/campaigns/:id",        deleteCampaign as any);
router4.post("/campaigns/:id/send",     sendCampaign as any);
router4.get("/automations",             getAutomations as any);
router4.post("/automations",            createAutomation as any);
router4.patch("/automations/:id/toggle", toggleAutomation as any);
router4.delete("/automations/:id",      deleteAutomation as any);
router4.post("/events",                 trackEvent as any);
export default router4;
