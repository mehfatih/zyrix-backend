import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { lookupBin, getLookupHistory, getBinStats, addBinRecord, get3dsDecision, getCountry3dsRules } from '../controllers/binController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.post('/lookup',           (req: Request, res: Response) => lookupBin(req as AuthenticatedRequest, res));
router.get('/history',           (req: Request, res: Response) => getLookupHistory(req as AuthenticatedRequest, res));
router.get('/stats',             (req: Request, res: Response) => getBinStats(req as AuthenticatedRequest, res));
router.post('/records',          (req: Request, res: Response) => addBinRecord(req as AuthenticatedRequest, res));
router.post('/3ds-decision',     (req: Request, res: Response) => get3dsDecision(req as AuthenticatedRequest, res));
router.get('/country-3ds-rules', (req: Request, res: Response) => getCountry3dsRules(req as AuthenticatedRequest, res));

export default router;
