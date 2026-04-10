import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  listCheckouts, createCheckout, getCheckout, updateCheckout, deleteCheckout,
  createRule, updateRule, deleteRule, resolveCheckout, getAnalytics,
} from '../controllers/dynamicCheckoutController';

const router = Router();

router.use(authenticateToken as any);

router.get('/',                          listCheckouts   as any);
router.post('/',                         createCheckout  as any);
router.get('/:id',                       getCheckout     as any);
router.patch('/:id',                     updateCheckout  as any);
router.delete('/:id',                    deleteCheckout  as any);
router.post('/:id/rules',                createRule      as any);
router.patch('/:id/rules/:ruleId',       updateRule      as any);
router.delete('/:id/rules/:ruleId',      deleteRule      as any);
router.post('/:id/resolve',              resolveCheckout as any);
router.get('/:id/analytics',             getAnalytics    as any);

export default router;
