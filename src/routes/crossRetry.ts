import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  initiateRetry,
  recordAttempt,
  listRetries,
  getRetry,
  cancelRetry,
  getStats,
} from '../controllers/crossRetryController';

const router = Router();

router.use(authenticateToken as any);

router.get('/stats',              getStats      as any);
router.get('/',                   listRetries   as any);
router.get('/:retryId',           getRetry      as any);
router.post('/initiate',          initiateRetry as any);
router.post('/:retryId/attempt',  recordAttempt as any);
router.patch('/:retryId/cancel',  cancelRetry   as any);

export default router;
