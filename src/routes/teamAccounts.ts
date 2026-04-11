import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getTeamAccount, getMembers, inviteMember, updateMember,
  removeMember, getActivityLogs,
} from "../controllers/teamAccountsController";
 
const router = Router();
router.use(authenticateToken as any);
router.get("/",                getTeamAccount as any);
router.get("/members",         getMembers as any);
router.post("/members",        inviteMember as any);
router.put("/members/:id",     updateMember as any);
router.delete("/members/:id",  removeMember as any);
router.get("/activity",        getActivityLogs as any);
export default router;
