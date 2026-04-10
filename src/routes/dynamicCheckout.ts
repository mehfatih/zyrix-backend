import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listCheckouts, createCheckout, getCheckout, updateCheckout, deleteCheckout, createRule, updateRule, deleteRule, resolveCheckout, getAnalytics, personalizeCheckout, getCustomerPreferences } from '../controllers/dynamicCheckoutController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/',                               (req: Request, res: Response) => listCheckouts(req as AuthenticatedRequest, res));
router.post('/',                              (req: Request, res: Response) => createCheckout(req as AuthenticatedRequest, res));
router.get('/:id',                            (req: Request, res: Response) => getCheckout(req as AuthenticatedRequest, res));
router.patch('/:id',                          (req: Request, res: Response) => updateCheckout(req as AuthenticatedRequest, res));
router.delete('/:id',                         (req: Request, res: Response) => deleteCheckout(req as AuthenticatedRequest, res));
router.post('/:id/rules',                     (req: Request, res: Response) => createRule(req as AuthenticatedRequest, res));
router.patch('/:id/rules/:ruleId',            (req: Request, res: Response) => updateRule(req as AuthenticatedRequest, res));
router.delete('/:id/rules/:ruleId',           (req: Request, res: Response) => deleteRule(req as AuthenticatedRequest, res));
router.post('/:id/resolve',                   (req: Request, res: Response) => resolveCheckout(req as AuthenticatedRequest, res));
router.get('/:id/analytics',                  (req: Request, res: Response) => getAnalytics(req as AuthenticatedRequest, res));
router.post('/:id/personalize',               (req: Request, res: Response) => personalizeCheckout(req as AuthenticatedRequest, res));
router.get('/:id/preferences/:customerPhone', (req: Request, res: Response) => getCustomerPreferences(req as AuthenticatedRequest, res));

export default router;
