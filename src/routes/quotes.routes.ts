// ─────────────────────────────────────────────────────────────
// src/routes/quotes.routes.ts
// ─────────────────────────────────────────────────────────────
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import * as QuotesController from '../controllers/quotes.controller'

const router = Router()

// كل الـ routes محمية بـ auth ماعدا public view endpoint
router.get('/',                         authenticateToken, QuotesController.listQuotes)
router.post('/',                        authenticateToken, QuotesController.createQuote)
router.get('/reports',                  authenticateToken, QuotesController.getReports)
router.get('/templates',                authenticateToken, QuotesController.listTemplates)
router.post('/templates',               authenticateToken, QuotesController.createTemplate)
router.put('/templates/:id',            authenticateToken, QuotesController.updateTemplate)
router.delete('/templates/:id',         authenticateToken, QuotesController.deleteTemplate)
router.get('/:id',                      authenticateToken, QuotesController.getQuote)
router.patch('/:id',                    authenticateToken, QuotesController.updateQuote)
router.delete('/:id',                   authenticateToken, QuotesController.deleteQuote)
router.post('/:id/send',                authenticateToken, QuotesController.sendQuote)
router.post('/:id/convert-invoice',     authenticateToken, QuotesController.convertToInvoice)
router.get('/:id/pdf',                  authenticateToken, QuotesController.downloadPdf)
router.get('/:id/activities',           authenticateToken, QuotesController.getActivities)

// Public endpoint — العميل يفتح العرض بالـ token
router.get('/public/:viewToken',        QuotesController.viewPublicQuote)
router.post('/public/:viewToken/accept', QuotesController.acceptPublicQuote)
router.post('/public/:viewToken/reject', QuotesController.rejectPublicQuote)

export default router
