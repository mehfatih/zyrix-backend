import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listMethods, updateMethod, toggleMethod, getMethodsPublic, getSuccessRates, getCountryRecommendations, getLocalizationMap } from '../controllers/paymentMethodsController';

const router = Router();

// Public (no auth)
router.get('/public/:merchantId', getMethodsPublic);

// Protected
router.use(authenticate);
router.get('/',                              listMethods);
router.patch('/:method',                     updateMethod);
router.patch('/:method/toggle',              toggleMethod);

// ── ELITE #19 ──────────────────────────────────────
router.get('/success-rates',                 getSuccessRates);
router.get('/localization-map',              getLocalizationMap);
router.get('/country-recommendations/:country', getCountryRecommendations);

export default router;
