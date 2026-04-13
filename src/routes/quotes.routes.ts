// ─────────────────────────────────────────────────────────────
// src/routes/quotes.routes.ts
// ─────────────────────────────────────────────────────────────
import { Router, RequestHandler } from 'express'
import { authenticateToken } from '../middleware/auth'
import * as C from '../controllers/quotes.controller'

const router = Router()
const h = (fn: Function): RequestHandler => fn as RequestHandler

router.get   ('/',                          authenticateToken, h(C.listQuotes))
router.post  ('/',                          authenticateToken, h(C.createQuote))
router.get   ('/reports',                   authenticateToken, h(C.getReports))
router.get   ('/templates',                 authenticateToken, h(C.listTemplates))
router.post  ('/templates',                 authenticateToken, h(C.createTemplate))
router.put   ('/templates/:id',             authenticateToken, h(C.updateTemplate))
router.delete('/templates/:id',             authenticateToken, h(C.deleteTemplate))
router.get   ('/:id',                       authenticateToken, h(C.getQuote))
router.patch ('/:id',                       authenticateToken, h(C.updateQuote))
router.delete('/:id',                       authenticateToken, h(C.deleteQuote))
router.post  ('/:id/send',                  authenticateToken, h(C.sendQuote))
router.post  ('/:id/convert-invoice',       authenticateToken, h(C.convertToInvoice))
router.get   ('/:id/pdf',                   authenticateToken, h(C.downloadPdf))
router.get   ('/:id/activities',            authenticateToken, h(C.getActivities))

// Public — بدون auth
router.get   ('/public/:viewToken',         C.viewPublicQuote  as RequestHandler)
router.post  ('/public/:viewToken/accept',  C.acceptPublicQuote as RequestHandler)
router.post  ('/public/:viewToken/reject',  C.rejectPublicQuote as RequestHandler)

export default router
