// ─────────────────────────────────────────────────────────────
// src/routes/loyalty.ts
// ─────────────────────────────────────────────────────────────
import { Router, RequestHandler } from 'express'
import { authenticateToken } from '../middleware/auth'
import * as C from '../controllers/loyalty.controller'

const router = Router()
const h = (fn: Function): RequestHandler => fn as RequestHandler

// Settings
router.get ('/settings',               authenticateToken, h(C.getSettings))
router.put ('/settings',               authenticateToken, h(C.updateSettings))

// Customers
router.get ('/customers',              authenticateToken, h(C.listCustomers))
router.get ('/customers/:id',          authenticateToken, h(C.getCustomer))

// Points operations
router.post('/points/award',           authenticateToken, h(C.awardPoints))
router.post('/points/redeem',          authenticateToken, h(C.redeemPoints))

// Reports
router.get ('/reports',                authenticateToken, h(C.getReports))

export default router
