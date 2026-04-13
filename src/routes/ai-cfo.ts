// ─────────────────────────────────────────────────────────────
// src/routes/ai-cfo.ts
// ─────────────────────────────────────────────────────────────
import { Router, RequestHandler } from 'express'
import { authenticateToken } from '../middleware/auth'
import * as C from '../controllers/ai-cfo.controller'

const router = Router()
const h = (fn: Function): RequestHandler => fn as RequestHandler

router.get ('/summary',  authenticateToken, h(C.getSummary))
router.get ('/insights', authenticateToken, h(C.getInsights))
router.get ('/reports',  authenticateToken, h(C.getReports))
router.post('/ask',      authenticateToken, h(C.askAI))

export default router
