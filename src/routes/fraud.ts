import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { analyzeTransaction, listEvents, reviewEvent, listRules, createRule, updateRule, deleteRule, getStats, mlScore, checkDeviceFingerprint } from '../controllers/fraudController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.post('/analyze',            (req: Request, res: Response) => analyzeTransaction(req as AuthenticatedRequest, res));
router.get('/events',              (req: Request, res: Response) => listEvents(req as AuthenticatedRequest, res));
router.patch('/events/:id/review', (req: Request, res: Response) => reviewEvent(req as AuthenticatedRequest, res));
router.get('/rules',               (req: Request, res: Response) => listRules(req as AuthenticatedRequest, res));
router.post('/rules',              (req: Request, res: Response) => createRule(req as AuthenticatedRequest, res));
router.patch('/rules/:id',         (req: Request, res: Response) => updateRule(req as AuthenticatedRequest, res));
router.delete('/rules/:id',        (req: Request, res: Response) => deleteRule(req as AuthenticatedRequest, res));
router.get('/stats',               (req: Request, res: Response) => getStats(req as AuthenticatedRequest, res));
router.post('/ml-score',           (req: Request, res: Response) => mlScore(req as AuthenticatedRequest, res));
router.post('/device-fingerprint', (req: Request, res: Response) => checkDeviceFingerprint(req as AuthenticatedRequest, res));

export default router;
