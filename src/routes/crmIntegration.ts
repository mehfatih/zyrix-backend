import { Router } from "express";
import { authenticateToken } from "../middleware/auth";
import {
  getConnections, createConnection, updateConnection, deleteConnection,
  syncConnection, getSyncLogs,
  getMappings, upsertMapping,
} from "../controllers/crmIntegrationController";
 
const router3 = Router();
router3.use(authenticateToken as any);
router3.get("/connections",                             getConnections as any);
router3.post("/connections",                            createConnection as any);
router3.put("/connections/:id",                         updateConnection as any);
router3.delete("/connections/:id",                      deleteConnection as any);
router3.post("/connections/:id/sync",                   syncConnection as any);
router3.get("/logs",                                    getSyncLogs as any);
router3.get("/connections/:connectionId/mappings",      getMappings as any);
router3.post("/connections/:connectionId/mappings",     upsertMapping as any);
export default router3;
