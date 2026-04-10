import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listCheckouts, createCheckout, getCheckout, updateCheckout, deleteCheckout, createRule, updateRule, deleteRule, resolveCheckout, getAnalytics, personalizeCheckout, getCustomerPreferences } from '../controllers/dynamicCheckoutController';

const router = Router();
router.use(authenticateToken);

router.get('/',                               listCheckouts);
router.post('/',                              createCheckout);
router.get('/:id',                            getCheckout);
router.patch('/:id',                          updateCheckout);
router.delete('/:id',                         deleteCheckout);
router.post('/:id/rules',                     createRule);
router.patch('/:id/rules/:ruleId',            updateRule);
router.delete('/:id/rules/:ruleId',           deleteRule);
router.post('/:id/resolve',                   resolveCheckout);
router.get('/:id/analytics',                  getAnalytics);
router.post('/:id/personalize',               personalizeCheckout);
router.get('/:id/preferences/:customerPhone', getCustomerPreferences);

export default router;
