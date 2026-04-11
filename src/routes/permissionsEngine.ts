import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getRoles, createRole, updateRole, deleteRole,
  getGrants, upsertGrant, checkPermission, assignRoleToMember,
} from "../controllers/permissionsEngineController";
 
const router2 = Router();
router2.use(authenticateToken as any);
router2.get("/roles",                        getRoles as any);
router2.post("/roles",                       createRole as any);
router2.put("/roles/:id",                    updateRole as any);
router2.delete("/roles/:id",                 deleteRole as any);
router2.get("/grants/:memberId",             getGrants as any);
router2.post("/grants",                      upsertGrant as any);
router2.post("/check",                       checkPermission as any);
router2.post("/members/:memberId/assign-role", assignRoleToMember as any);
export default router2;
