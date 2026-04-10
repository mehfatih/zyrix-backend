import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getConfig, updateConfig, analyzeApproval, updateEvent, getStats, listSla, upsertSla, checkSla } from '../controllers/approvalOptimizationController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/config',                (req: Request, res: Response) => getConfig(req as AuthenticatedRequest, res));
router.patch('/config',              (req: Request, res: Response) => updateConfig(req as AuthenticatedRequest, res));
router.post('/analyze',              (req: Request, res: Response) => analyzeApproval(req as AuthenticatedRequest, res));
router.patch('/events/:id',          (req: Request, res: Response) => updateEvent(req as AuthenticatedRequest, res));
router.get('/stats',                 (req: Request, res: Response) => getStats(req as AuthenticatedRequest, res));
router.get('/sla',                   (req: Request, res: Response) => listSla(req as AuthenticatedRequest, res));
router.post('/sla',                  (req: Request, res: Response) => upsertSla(req as AuthenticatedRequest, res));
router.post('/sla/:gatewayId/check', (req: Request, res: Response) => checkSla(req as AuthenticatedRequest, res));

export default router;
