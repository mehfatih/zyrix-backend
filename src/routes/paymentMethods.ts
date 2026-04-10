import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listMethods, updateMethod, toggleMethod, getMethodsPublic, getSuccessRates, getCountryRecommendations, getLocalizationMap } from '../controllers/paymentMethodsController';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.get('/public/:merchantId', (req: Request, res: Response) => getMethodsPublic(req as AuthenticatedRequest, res));

router.use(authenticateToken);
router.get('/',                                 (req: Request, res: Response) => listMethods(req as AuthenticatedRequest, res));
router.patch('/:method',                        (req: Request, res: Response) => updateMethod(req as AuthenticatedRequest, res));
router.patch('/:method/toggle',                 (req: Request, res: Response) => toggleMethod(req as AuthenticatedRequest, res));
router.get('/success-rates',                    (req: Request, res: Response) => getSuccessRates(req as AuthenticatedRequest, res));
router.get('/localization-map',                 (req: Request, res: Response) => getLocalizationMap(req as AuthenticatedRequest, res));
router.get('/country-recommendations/:country', (req: Request, res: Response) => getCountryRecommendations(req as AuthenticatedRequest, res));

export default router;
