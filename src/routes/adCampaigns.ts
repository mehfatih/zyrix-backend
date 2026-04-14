// src/routes/adCampaigns.ts
import { Router } from "express"
import { authenticateToken } from "../middleware/auth"
import { adCampaignsController } from "../controllers/adCampaigns.controller"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

router.get   ("/summary",       h(adCampaignsController.getSummary))
router.get   ("/platforms",     h(adCampaignsController.getPlatformBreakdown))
router.get   ("/",              h(adCampaignsController.list))
router.post  ("/",              h(adCampaignsController.create))
router.patch ("/:id/metrics",   h(adCampaignsController.updateMetrics))
router.patch ("/:id/status",    h(adCampaignsController.updateStatus))
router.delete("/:id",           h(adCampaignsController.delete))

export default router
