// src/routes/commissionEngine.ts
import { Router } from "express"
import { authenticateToken } from "../middleware/auth"
import { commissionController } from "../controllers/commission.controller"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

// Rules
router.get   ("/rules",              h(commissionController.listRules))
router.post  ("/rules",              h(commissionController.createRule))
router.patch ("/rules/:id",          h(commissionController.updateRule))
router.delete("/rules/:id",          h(commissionController.deleteRule))

// Calculate preview
router.post  ("/calculate",          h(commissionController.calculate))

// Records
router.get   ("/records",            h(commissionController.listRecords))
router.post  ("/records",            h(commissionController.createRecord))
router.patch ("/records/:id/status", h(commissionController.updateRecordStatus))

// Stats
router.get   ("/agents",             h(commissionController.getAgentStats))
router.get   ("/summary",            h(commissionController.getSummary))

export default router
