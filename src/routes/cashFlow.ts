// src/routes/cashFlow.ts
import { Router, Request, Response, NextFunction } from "express"
import { authenticateToken } from "../middleware/auth"
import { cashFlowController } from "../controllers/cashFlow.controller"
import { AuthenticatedRequest } from "../types"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

router.get   ("/entries",          h(cashFlowController.listEntries))
router.post  ("/entries",          h(cashFlowController.createEntry))
router.delete("/entries/:id",      h(cashFlowController.deleteEntry))
router.get   ("/summary",          h(cashFlowController.getMonthlySummary))
router.post  ("/forecast/generate",h(cashFlowController.generateForecast))
router.get   ("/forecast",         h(cashFlowController.getForecasts))
router.get   ("/runway",           h(cashFlowController.getRunway))

export default router
