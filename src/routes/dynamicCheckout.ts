import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listCheckouts, createCheckout, getCheckout, updateCheckout, deleteCheckout, createRule, updateRule, deleteRule, resolveCheckout, getAnalytics, personalizeCheckout, getCustomerPreferences } from '../controllers/dynamicCheckoutController';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(authenticateToken);

router.get('/',                               (req: Request, res: Response, next: NextFunction) => listCheckouts(req as AuthenticatedRequest, res, next));
router.post('/',                              (req: Request, res: Response, next: NextFunction) => createCheckout(req as AuthenticatedRequest, res, next));
router.get('/:id',                            (req: Request, res: Response, next: NextFunction) => getCheckout(req as AuthenticatedRequest, res, next));
router.patch('/:id',                          (req: Request, res: Response, next: NextFunction) => updateCheckout(req as AuthenticatedRequest, res, next));
router.delete('/:id',                         (req: Request, res: Response, next: NextFunction) => deleteCheckout(req as AuthenticatedRequest, res, next));
router.post('/:id/rules',                     (req: Request, res: Response, next: NextFunction) => createRule(req as AuthenticatedRequest, res, next));
router.patch('/:id/rules/:ruleId',            (req: Request, res: Response, next: NextFunction) => updateRule(req as AuthenticatedRequest, res, next));
router.delete('/:id/rules/:ruleId',           (req: Request, res: Response, next: NextFunction) => deleteRule(req as AuthenticatedRequest, res, next));
router.post('/:id/resolve',                   (req: Request, res: Response, next: NextFunction) => resolveCheckout(req as AuthenticatedRequest, res, next));
router.get('/:id/analytics',                  (req: Request, res: Response, next: NextFunction) => getAnalytics(req as AuthenticatedRequest, res, next));
router.post('/:id/personalize',               (req: Request, res: Response, next: NextFunction) => personalizeCheckout(req as AuthenticatedRequest, res, next));
router.get('/:id/preferences/:customerPhone', (req: Request, res: Response, next: NextFunction) => getCustomerPreferences(req as AuthenticatedRequest, res, next));

export default router;
