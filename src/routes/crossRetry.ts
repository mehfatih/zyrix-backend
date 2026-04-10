import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { initiateRetry, recordAttempt, listRetries, getRetry, cancelRetry, getStats, triggerFallbackChannel, getSmartRetryTiming } from '../controllers/crossRetryController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/',                           (req: Request, res: Response) => listRetries(req as AuthenticatedRequest, res));
router.get('/stats',                      (req: Request, res: Response) => getStats(req as AuthenticatedRequest, res));
router.get('/smart-timing',               (req: Request, res: Response) => getSmartRetryTiming(req as AuthenticatedRequest, res));
router.post('/initiate',                  (req: Request, res: Response) => initiateRetry(req as AuthenticatedRequest, res));
router.get('/:retryId',                   (req: Request, res: Response) => getRetry(req as AuthenticatedRequest, res));
router.post('/:retryId/attempt',          (req: Request, res: Response) => recordAttempt(req as AuthenticatedRequest, res));
router.patch('/:retryId/cancel',          (req: Request, res: Response) => cancelRetry(req as AuthenticatedRequest, res));
router.post('/:retryId/fallback-channel', (req: Request, res: Response) => triggerFallbackChannel(req as AuthenticatedRequest, res));

export default router;
