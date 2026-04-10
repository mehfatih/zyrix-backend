import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listAlerts, analyzeForChargeback, resolveAlert, listRules, createRule, updateRule, deleteRule, getStats } from '../controllers/chargebackController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/alerts',               (req: Request, res: Response) => listAlerts(req as AuthenticatedRequest, res));
router.post('/analyze',             (req: Request, res: Response) => analyzeForChargeback(req as AuthenticatedRequest, res));
router.patch('/alerts/:id/resolve', (req: Request, res: Response) => resolveAlert(req as AuthenticatedRequest, res));
router.get('/rules',                (req: Request, res: Response) => listRules(req as AuthenticatedRequest, res));
router.post('/rules',               (req: Request, res: Response) => createRule(req as AuthenticatedRequest, res));
router.patch('/rules/:id',          (req: Request, res: Response) => updateRule(req as AuthenticatedRequest, res));
router.delete('/rules/:id',         (req: Request, res: Response) => deleteRule(req as AuthenticatedRequest, res));
router.get('/stats',                (req: Request, res: Response) => getStats(req as AuthenticatedRequest, res));

export default router;
