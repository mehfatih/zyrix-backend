import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listMethods, updateMethod, toggleMethod, getMethodsPublic, getSuccessRates, getCountryRecommendations, getLocalizationMap } from '../controllers/paymentMethodsController';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.get('/public/:merchantId', (req: Request, res: Response, next: NextFunction) => getMethodsPublic(req as AuthenticatedRequest, res, next));

router.use(authenticateToken);
router.get('/',                                 (req: Request, res: Response, next: NextFunction) => listMethods(req as AuthenticatedRequest, res, next));
router.patch('/:method',                        (req: Request, res: Response, next: NextFunction) => updateMethod(req as AuthenticatedRequest, res, next));
router.patch('/:method/toggle',                 (req: Request, res: Response, next: NextFunction) => toggleMethod(req as AuthenticatedRequest, res, next));
router.get('/success-rates',                    (req: Request, res: Response, next: NextFunction) => getSuccessRates(req as AuthenticatedRequest, res, next));
router.get('/localization-map',                 (req: Request, res: Response, next: NextFunction) => getLocalizationMap(req as AuthenticatedRequest, res, next));
router.get('/country-recommendations/:country', (req: Request, res: Response, next: NextFunction) => getCountryRecommendations(req as AuthenticatedRequest, res, next));

export default router;
