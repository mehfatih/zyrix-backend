import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listTokens, createToken, getToken, updateToken, deleteToken, chargeToken, getStats } from '../controllers/tokenizationController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/',            (req: Request, res: Response) => listTokens(req as AuthenticatedRequest, res));
router.post('/',           (req: Request, res: Response) => createToken(req as AuthenticatedRequest, res));
router.get('/stats',       (req: Request, res: Response) => getStats(req as AuthenticatedRequest, res));
router.get('/:id',         (req: Request, res: Response) => getToken(req as AuthenticatedRequest, res));
router.patch('/:id',       (req: Request, res: Response) => updateToken(req as AuthenticatedRequest, res));
router.delete('/:id',      (req: Request, res: Response) => deleteToken(req as AuthenticatedRequest, res));
router.post('/:id/charge', (req: Request, res: Response) => chargeToken(req as AuthenticatedRequest, res));

export default router;
