import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getAffiliates, createAffiliate, updateAffiliate, deleteAffiliate,
  getReferrals, trackReferral, approveReferral,
  getPayouts, createPayout, completePayout,
} from "../controllers/affiliateSystemController";
 
const router5 = Router();
router5.use(authenticateToken as any);
router5.get("/",                          getAffiliates as any);
router5.post("/",                         createAffiliate as any);
router5.put("/:id",                       updateAffiliate as any);
router5.delete("/:id",                    deleteAffiliate as any);
router5.get("/:affiliateId/referrals",    getReferrals as any);
router5.post("/referrals/track",          trackReferral as any);
router5.patch("/referrals/:id/approve",   approveReferral as any);
router5.get("/payouts",                   getPayouts as any);
router5.post("/payouts",                  createPayout as any);
router5.patch("/payouts/:id/complete",    completePayout as any);
export default router5;
