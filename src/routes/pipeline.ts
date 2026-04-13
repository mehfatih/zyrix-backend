// ─────────────────────────────────────────────────────────────
// src/routes/pipeline.ts
// ─────────────────────────────────────────────────────────────
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import * as C from '../controllers/pipeline.controller'

const router = Router()

// Stages
router.get   ('/stages',               authenticateToken, C.listStages)
router.post  ('/stages',               authenticateToken, C.createStage)
router.patch ('/stages/:id',           authenticateToken, C.updateStage)
router.delete('/stages/:id',           authenticateToken, C.deleteStage)
router.patch ('/stages/reorder',       authenticateToken, C.reorderStages)

// Deals
router.get   ('/deals',                authenticateToken, C.listDeals)
router.post  ('/deals',                authenticateToken, C.createDeal)
router.get   ('/deals/reports',        authenticateToken, C.getReports)
router.get   ('/deals/:id',            authenticateToken, C.getDeal)
router.patch ('/deals/:id',            authenticateToken, C.updateDeal)
router.delete('/deals/:id',            authenticateToken, C.deleteDeal)
router.patch ('/deals/:id/stage',      authenticateToken, C.moveDealStage)
router.post  ('/deals/:id/activity',   authenticateToken, C.addActivity)
router.get   ('/deals/:id/activities', authenticateToken, C.getActivities)

export default router
