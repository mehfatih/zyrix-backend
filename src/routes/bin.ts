import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { lookupBin, getLookupHistory, getBinStats, addBinRecord, get3dsDecision, getCountry3dsRules } from '../controllers/binController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.post('/lookup',           (req: Request, res: Response, next: NextFunction) => lookupBin(req as AuthenticatedRequest, res, next));
router.get('/history',           (req: Request, res: Response, next: NextFunction) => getLookupHistory(req as AuthenticatedRequest, res, next));
router.get('/stats',             (req: Request, res: Response, next: NextFunction) => getBinStats(req as AuthenticatedRequest, res, next));
router.post('/records',          (req: Request, res: Response, next: NextFunction) => addBinRecord(req as AuthenticatedRequest, res, next));
router.post('/3ds-decision',     (req: Request, res: Response, next: NextFunction) => get3dsDecision(req as AuthenticatedRequest, res, next));
router.get('/country-3ds-rules', (req: Request, res: Response, next: NextFunction) => getCountry3dsRules(req as AuthenticatedRequest, res, next));

export default router;
