import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getConfig, updateConfig, analyzeApproval, updateEvent, getStats, listSla, upsertSla, checkSla } from '../controllers/approvalOptimizationController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/config',                (req: Request, res: Response, next: NextFunction) => getConfig(req as AuthenticatedRequest, res, next));
router.patch('/config',              (req: Request, res: Response, next: NextFunction) => updateConfig(req as AuthenticatedRequest, res, next));
router.post('/analyze',              (req: Request, res: Response, next: NextFunction) => analyzeApproval(req as AuthenticatedRequest, res, next));
router.patch('/events/:id',          (req: Request, res: Response, next: NextFunction) => updateEvent(req as AuthenticatedRequest, res, next));
router.get('/stats',                 (req: Request, res: Response, next: NextFunction) => getStats(req as AuthenticatedRequest, res, next));
router.get('/sla',                   (req: Request, res: Response, next: NextFunction) => listSla(req as AuthenticatedRequest, res, next));
router.post('/sla',                  (req: Request, res: Response, next: NextFunction) => upsertSla(req as AuthenticatedRequest, res, next));
router.post('/sla/:gatewayId/check', (req: Request, res: Response, next: NextFunction) => checkSla(req as AuthenticatedRequest, res, next));

export default router;
