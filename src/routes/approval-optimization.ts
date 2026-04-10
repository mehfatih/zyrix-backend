import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getConfig, updateConfig, analyzeApproval, updateEvent, getStats, listSla, upsertSla, checkSla } from '../controllers/approvalOptimizationController';

const router = Router();
router.use(authenticate);

router.get('/config',                    getConfig);
router.patch('/config',                  updateConfig);
router.post('/analyze',                  analyzeApproval);
router.patch('/events/:id',              updateEvent);
router.get('/stats',                     getStats);
router.get('/sla',                       listSla);
router.post('/sla',                      upsertSla);
router.post('/sla/:gatewayId/check',     checkSla);

export default router;
