// src/routes/marketingCampaigns.ts
import { Router } from "express"
import { authenticateToken } from "../middleware/auth"
import { marketingCampaignsController } from "../controllers/marketingCampaigns.controller"

const router = Router()
const h = (fn: Function) => fn as any

router.use(authenticateToken)

router.get   ("/stats",           h(marketingCampaignsController.getStats))
router.get   ("/",                h(marketingCampaignsController.list))
router.post  ("/",                h(marketingCampaignsController.create))
router.patch ("/:id",             h(marketingCampaignsController.update))
router.post  ("/:id/launch",      h(marketingCampaignsController.launch))
router.patch ("/:id/status",      h(marketingCampaignsController.updateStatus))
router.delete("/:id",             h(marketingCampaignsController.delete))
router.get   ("/:id/contacts",    h(marketingCampaignsController.getContacts))

export default router
