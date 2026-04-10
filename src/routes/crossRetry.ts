import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { initiateRetry, recordAttempt, listRetries, getRetry, cancelRetry, getStats, triggerFallbackChannel, getSmartRetryTiming } from '../controllers/crossRetryController';

const router = Router();
router.use(authenticate);

router.get('/',                         listRetries);
router.get('/stats',                    getStats);
router.get('/smart-timing',             getSmartRetryTiming);
router.post('/initiate',                initiateRetry);
router.get('/:retryId',                 getRetry);
router.post('/:retryId/attempt',        recordAttempt);
router.patch('/:retryId/cancel',        cancelRetry);

// ── ELITE #12 ──────────────────────────────────────
router.post('/:retryId/fallback-channel', triggerFallbackChannel);

export default router;
