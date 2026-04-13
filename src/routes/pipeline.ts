// ─────────────────────────────────────────────────────────────
// src/routes/pipeline.ts
// ─────────────────────────────────────────────────────────────
import { Router, RequestHandler } from 'express'
import { authenticateToken } from '../middleware/auth'
import * as C from '../controllers/pipeline.controller'

const router = Router()
const h = (fn: Function): RequestHandler => fn as RequestHandler

// Stages
router.get   ('/stages',               authenticateToken, h(C.listStages))
router.post  ('/stages',               authenticateToken, h(C.createStage))
router.patch ('/stages/reorder',       authenticateToken, h(C.reorderStages))
router.patch ('/stages/:id',           authenticateToken, h(C.updateStage))
router.delete('/stages/:id',           authenticateToken, h(C.deleteStage))

// Deals
router.get   ('/deals',                authenticateToken, h(C.listDeals))
router.post  ('/deals',                authenticateToken, h(C.createDeal))
router.get   ('/deals/reports',        authenticateToken, h(C.getReports))
router.get   ('/deals/:id',            authenticateToken, h(C.getDeal))
router.patch ('/deals/:id',            authenticateToken, h(C.updateDeal))
router.delete('/deals/:id',            authenticateToken, h(C.deleteDeal))
router.patch ('/deals/:id/stage',      authenticateToken, h(C.moveDealStage))
router.post  ('/deals/:id/activity',   authenticateToken, h(C.addActivity))
router.get   ('/deals/:id/activities', authenticateToken, h(C.getActivities))

export default router
