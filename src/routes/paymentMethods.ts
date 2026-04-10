import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { listMethods, updateMethod, toggleMethod, getMethodsPublic, getSuccessRates, getCountryRecommendations, getLocalizationMap } from '../controllers/paymentMethodsController';

const router = Router();

router.get('/public/:merchantId', getMethodsPublic);

router.use(authenticateToken);
router.get('/',                                  listMethods);
router.patch('/:method',                         updateMethod);
router.patch('/:method/toggle',                  toggleMethod);
router.get('/success-rates',                     getSuccessRates);
router.get('/localization-map',                  getLocalizationMap);
router.get('/country-recommendations/:country',  getCountryRecommendations);

export default router;
