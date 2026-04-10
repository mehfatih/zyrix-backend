// src/routes/customers.ts
import { Router } from 'express'
import { authenticateToken } from '../middleware/auth'
import { listCustomers, getCustomer, upsertCustomer, updateCustomer, getCustomersSummary } from '../controllers/customersController'

const router = Router()
router.use(authenticateToken)

router.get('/summary',      getCustomersSummary)
router.get('/',             listCustomers)
router.get('/:customerId',  getCustomer)
router.post('/',            upsertCustomer)
router.put('/:customerId',  updateCustomer)

export default router
