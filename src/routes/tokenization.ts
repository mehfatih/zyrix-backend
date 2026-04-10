import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listTokens, createToken, getToken, updateToken, deleteToken, chargeToken, getStats } from '../controllers/tokenizationController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/',            (req: Request, res: Response, next: NextFunction) => listTokens(req as AuthenticatedRequest, res, next));
router.post('/',           (req: Request, res: Response, next: NextFunction) => createToken(req as AuthenticatedRequest, res, next));
router.get('/stats',       (req: Request, res: Response, next: NextFunction) => getStats(req as AuthenticatedRequest, res, next));
router.get('/:id',         (req: Request, res: Response, next: NextFunction) => getToken(req as AuthenticatedRequest, res, next));
router.patch('/:id',       (req: Request, res: Response, next: NextFunction) => updateToken(req as AuthenticatedRequest, res, next));
router.delete('/:id',      (req: Request, res: Response, next: NextFunction) => deleteToken(req as AuthenticatedRequest, res, next));
router.post('/:id/charge', (req: Request, res: Response, next: NextFunction) => chargeToken(req as AuthenticatedRequest, res, next));

export default router;
