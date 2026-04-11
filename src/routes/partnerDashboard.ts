import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getPartners, createPartner, updatePartner, deletePartner,
  getPartnerMetrics, recordMetric, addSubMerchant,
} from "../controllers/partnerDashboardController";
 
const router4 = Router();
router4.use(authenticateToken as any);
router4.get("/",                          getPartners as any);
router4.post("/",                         createPartner as any);
router4.put("/:id",                       updatePartner as any);
router4.delete("/:id",                    deletePartner as any);
router4.get("/:id/metrics",              getPartnerMetrics as any);
router4.post("/:id/metrics",             recordMetric as any);
router4.post("/:id/sub-merchants",       addSubMerchant as any);
export default router4;
