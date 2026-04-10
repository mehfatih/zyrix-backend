import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listAlerts, analyzeForChargeback, resolveAlert, listRules, createRule, updateRule, deleteRule, getStats } from '../controllers/chargebackController';

const router = Router();
router.use(authenticateToken);

router.get('/alerts',               listAlerts);
router.post('/analyze',             analyzeForChargeback);
router.patch('/alerts/:id/resolve', resolveAlert);
router.get('/rules',                listRules);
router.post('/rules',               createRule);
router.patch('/rules/:id',          updateRule);
router.delete('/rules/:id',         deleteRule);
router.get('/stats',                getStats);

export default router;
