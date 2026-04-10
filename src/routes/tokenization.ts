import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listTokens, createToken, getToken, updateToken, deleteToken, chargeToken, getStats } from '../controllers/tokenizationController';

const router = Router();
router.use(authenticate);

router.get('/',            listTokens);
router.post('/',           createToken);
router.get('/stats',       getStats);
router.get('/:id',         getToken);
router.patch('/:id',       updateToken);
router.delete('/:id',      deleteToken);
router.post('/:id/charge', chargeToken);

export default router;
