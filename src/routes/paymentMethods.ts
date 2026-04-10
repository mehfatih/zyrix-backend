import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listMethods, updateMethod, toggleMethod, getMethodsPublic, getSuccessRates, getCountryRecommendations, getLocalizationMap } from '../controllers/paymentMethodsController';

const router = Router();

router.get('/public/:merchantId', (req: Request, res: Response) => getMethodsPublic(req, res));

router.use(authenticateToken);
router.get('/',                                 (req: Request, res: Response) => listMethods(req, res));
router.patch('/:method',                        (req: Request, res: Response) => updateMethod(req, res));
router.patch('/:method/toggle',                 (req: Request, res: Response) => toggleMethod(req, res));
router.get('/success-rates',                    (req: Request, res: Response) => getSuccessRates(req, res));
router.get('/localization-map',                 (req: Request, res: Response) => getLocalizationMap(req, res));
router.get('/country-recommendations/:country', (req: Request, res: Response) => getCountryRecommendations(req, res));

export default router;
