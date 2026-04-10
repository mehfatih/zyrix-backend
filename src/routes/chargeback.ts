import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listAlerts, analyzeForChargeback, resolveAlert, listRules, createRule, updateRule, deleteRule, getStats } from '../controllers/chargebackController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/alerts',               (req: Request, res: Response, next: NextFunction) => listAlerts(req as AuthenticatedRequest, res, next));
router.post('/analyze',             (req: Request, res: Response, next: NextFunction) => analyzeForChargeback(req as AuthenticatedRequest, res, next));
router.patch('/alerts/:id/resolve', (req: Request, res: Response, next: NextFunction) => resolveAlert(req as AuthenticatedRequest, res, next));
router.get('/rules',                (req: Request, res: Response, next: NextFunction) => listRules(req as AuthenticatedRequest, res, next));
router.post('/rules',               (req: Request, res: Response, next: NextFunction) => createRule(req as AuthenticatedRequest, res, next));
router.patch('/rules/:id',          (req: Request, res: Response, next: NextFunction) => updateRule(req as AuthenticatedRequest, res, next));
router.delete('/rules/:id',         (req: Request, res: Response, next: NextFunction) => deleteRule(req as AuthenticatedRequest, res, next));
router.get('/stats',                (req: Request, res: Response, next: NextFunction) => getStats(req as AuthenticatedRequest, res, next));

export default router;
