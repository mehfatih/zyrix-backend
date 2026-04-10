import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { analyzeTransaction, listEvents, reviewEvent, listRules, createRule, updateRule, deleteRule, getStats, mlScore, checkDeviceFingerprint } from '../controllers/fraudController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.post('/analyze',            (req: Request, res: Response, next: NextFunction) => analyzeTransaction(req as AuthenticatedRequest, res, next));
router.get('/events',              (req: Request, res: Response, next: NextFunction) => listEvents(req as AuthenticatedRequest, res, next));
router.patch('/events/:id/review', (req: Request, res: Response, next: NextFunction) => reviewEvent(req as AuthenticatedRequest, res, next));
router.get('/rules',               (req: Request, res: Response, next: NextFunction) => listRules(req as AuthenticatedRequest, res, next));
router.post('/rules',              (req: Request, res: Response, next: NextFunction) => createRule(req as AuthenticatedRequest, res, next));
router.patch('/rules/:id',         (req: Request, res: Response, next: NextFunction) => updateRule(req as AuthenticatedRequest, res, next));
router.delete('/rules/:id',        (req: Request, res: Response, next: NextFunction) => deleteRule(req as AuthenticatedRequest, res, next));
router.get('/stats',               (req: Request, res: Response, next: NextFunction) => getStats(req as AuthenticatedRequest, res, next));
router.post('/ml-score',           (req: Request, res: Response, next: NextFunction) => mlScore(req as AuthenticatedRequest, res, next));
router.post('/device-fingerprint', (req: Request, res: Response, next: NextFunction) => checkDeviceFingerprint(req as AuthenticatedRequest, res, next));

export default router;
