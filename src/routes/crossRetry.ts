import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { initiateRetry, recordAttempt, listRetries, getRetry, cancelRetry, getStats, triggerFallbackChannel, getSmartRetryTiming } from '../controllers/crossRetryController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/',                           (req: Request, res: Response, next: NextFunction) => listRetries(req as AuthenticatedRequest, res, next));
router.get('/stats',                      (req: Request, res: Response, next: NextFunction) => getStats(req as AuthenticatedRequest, res, next));
router.get('/smart-timing',               (req: Request, res: Response, next: NextFunction) => getSmartRetryTiming(req as AuthenticatedRequest, res, next));
router.post('/initiate',                  (req: Request, res: Response, next: NextFunction) => initiateRetry(req as AuthenticatedRequest, res, next));
router.get('/:retryId',                   (req: Request, res: Response, next: NextFunction) => getRetry(req as AuthenticatedRequest, res, next));
router.post('/:retryId/attempt',          (req: Request, res: Response, next: NextFunction) => recordAttempt(req as AuthenticatedRequest, res, next));
router.patch('/:retryId/cancel',          (req: Request, res: Response, next: NextFunction) => cancelRetry(req as AuthenticatedRequest, res, next));
router.post('/:retryId/fallback-channel', (req: Request, res: Response, next: NextFunction) => triggerFallbackChannel(req as AuthenticatedRequest, res, next));

export default router;
