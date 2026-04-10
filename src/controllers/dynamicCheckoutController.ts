import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

export const listCheckouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try { const checkouts = await prisma.dynamicCheckout.findMany({ where: { merchantId }, include: { rules: { where: { isActive: true }, orderBy: { priority: 'asc' } }, _count: { select: { events: true } } }, orderBy: { createdAt: 'desc' } }); res.json({ success: true, data: { checkouts } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch checkouts' }); return; }
};

export const createCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { name, description, brandColor, logoUrl, defaultCurrency, allowedMethods, showBinHints, showGatewayName, autoSelectGateway } = req.body;
  if (!name) { res.status(400).json({ success: false, error: 'name is required' }); return; }
  try { const checkout = await prisma.dynamicCheckout.create({ data: { merchantId, name, description: description || null, brandColor: brandColor || '#1A56DB', logoUrl: logoUrl || null, defaultCurrency: defaultCurrency || 'SAR', allowedMethods: allowedMethods || [], showBinHints: showBinHints !== undefined ? showBinHints : true, showGatewayName: showGatewayName !== undefined ? showGatewayName : false, autoSelectGateway: autoSelectGateway !== undefined ? autoSelectGateway : true } }); res.status(201).json({ success: true, data: { checkout } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to create checkout' }); return; }
};

export const getCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  try { const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId }, include: { rules: { orderBy: { priority: 'asc' } }, _count: { select: { events: true } } } }); if (!checkout) { res.status(404).json({ success: false, error: 'Checkout not found' }); return; } res.json({ success: true, data: { checkout } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch checkout' }); return; }
};

export const updateCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params; const { name, description, brandColor, logoUrl, defaultCurrency, allowedMethods, showBinHints, showGatewayName, autoSelectGateway, isActive, status } = req.body;
  try {
    const existing = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Checkout not found' }); return; }
    const checkout = await prisma.dynamicCheckout.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(brandColor !== undefined && { brandColor }), ...(logoUrl !== undefined && { logoUrl }), ...(defaultCurrency !== undefined && { defaultCurrency }), ...(allowedMethods !== undefined && { allowedMethods }), ...(showBinHints !== undefined && { showBinHints }), ...(showGatewayName !== undefined && { showGatewayName }), ...(autoSelectGateway !== undefined && { autoSelectGateway }), ...(isActive !== undefined && { isActive }), ...(status !== undefined && { status }) } });
    res.json({ success: true, data: { checkout } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to update checkout' }); return; }
};

export const deleteCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  try { const existing = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } }); if (!existing) { res.status(404).json({ success: false, error: 'Checkout not found' }); return; } await prisma.dynamicCheckout.delete({ where: { id } }); res.json({ success: true, message: 'Checkout deleted' }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to delete checkout' }); return; }
};

export const createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params; const { trigger, condition, action, actionValue, priority } = req.body;
  if (!trigger || !condition || !action) { res.status(400).json({ success: false, error: 'trigger, condition, action are required' }); return; }
  try { const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } }); if (!checkout) { res.status(404).json({ success: false, error: 'Checkout not found' }); return; } const rule = await prisma.dynamicCheckoutRule.create({ data: { checkoutId: id, trigger, condition, action, actionValue: actionValue || null, priority: priority || 0 } }); res.status(201).json({ success: true, data: { rule } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to create rule' }); return; }
};

export const updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { ruleId } = req.params; const { condition, action, actionValue, priority, isActive } = req.body;
  try { const rule = await prisma.dynamicCheckoutRule.update({ where: { id: ruleId }, data: { ...(condition !== undefined && { condition }), ...(action !== undefined && { action }), ...(actionValue !== undefined && { actionValue }), ...(priority !== undefined && { priority }), ...(isActive !== undefined && { isActive }) } }); res.json({ success: true, data: { rule } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to update rule' }); return; }
};

export const deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { ruleId } = req.params;
  try { await prisma.dynamicCheckoutRule.delete({ where: { id: ruleId } }); res.json({ success: true, message: 'Rule deleted' }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to delete rule' }); return; }
};

export const resolveCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  // timeOfDay used inside switch — extracted separately to avoid TS unused warning
  const { country, currency, amount, isReturningCustomer } = req.body;
  const _timeOfDay: number | undefined = req.body.timeOfDay;
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId, isActive: true }, include: { rules: { where: { isActive: true }, orderBy: { priority: 'asc' } } } });
    if (!checkout) { res.status(404).json({ success: false, error: 'Checkout not found or inactive' }); return; }
    let resolvedMethods = checkout.allowedMethods.length ? [...checkout.allowedMethods] : ['CREDIT_CARD', 'MADA', 'STC_PAY']; let resolvedGateway: string | null = null; let appliedRules: string[] = [];
    for (const rule of checkout.rules) {
      let matches = false;
      switch (rule.trigger) {
        case 'CUSTOMER_COUNTRY': matches = country && rule.condition === country; break;
        case 'AMOUNT_RANGE': { const [min, max] = rule.condition.split('-').map(Number); matches = amount && Number(amount) >= min && Number(amount) <= max; break; }
        case 'RETURNING_CUSTOMER': matches = rule.condition === 'true' && isReturningCustomer === true; break;
        case 'TIME_OF_DAY': { const [startH, endH] = rule.condition.split('-').map(Number); const hour = _timeOfDay !== undefined ? Number(_timeOfDay) : new Date().getHours(); matches = hour >= startH && hour < endH; break; }
        case 'PAYMENT_METHOD': matches = resolvedMethods.includes(rule.condition); break;
      }
      if (matches) { appliedRules.push(`${rule.trigger}:${rule.condition} → ${rule.action}`); if (rule.action === 'SET_GATEWAY' && rule.actionValue) resolvedGateway = rule.actionValue; if (rule.action === 'ADD_METHOD' && rule.actionValue && !resolvedMethods.includes(rule.actionValue)) resolvedMethods.push(rule.actionValue); if (rule.action === 'REMOVE_METHOD' && rule.actionValue) resolvedMethods = resolvedMethods.filter(m => m !== rule.actionValue); if (rule.action === 'SET_METHODS' && rule.actionValue) resolvedMethods = rule.actionValue.split(','); }
    }
    if (!resolvedGateway && checkout.autoSelectGateway && country) { const cgm: Record<string, string> = { SA: 'tap', AE: 'stripe', TR: 'iyzico', KW: 'tap', QA: 'tap', EG: 'stripe', IQ: 'stripe' }; resolvedGateway = cgm[country] || 'stripe'; }
    await prisma.dynamicCheckoutEvent.create({ data: { checkoutId: id, eventType: 'RESOLVE', country: country || null, currency: currency || null, amount: amount || null, gatewayUsed: resolvedGateway, completed: false } });
    await prisma.dynamicCheckout.update({ where: { id }, data: { usageCount: { increment: 1 } } });
    res.json({ success: true, data: { resolvedMethods, resolvedGateway, appliedRules, showBinHints: checkout.showBinHints, showGatewayName: checkout.showGatewayName, brandColor: checkout.brandColor, logoUrl: checkout.logoUrl, defaultCurrency: checkout.defaultCurrency } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to resolve checkout' }); return; }
};

export const getAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params; const days = parseInt(req.query.days as string) || 30; const since = new Date(Date.now() - days * 86400000);
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } }); if (!checkout) { res.status(404).json({ success: false, error: 'Checkout not found' }); return; }
    const events = await prisma.dynamicCheckoutEvent.findMany({ where: { checkoutId: id, createdAt: { gte: since } } });
    const total = events.length; const completed = events.filter(e => e.completed).length; const conversionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const gatewayBreakdown: Record<string, number> = {}; const countryBreakdown: Record<string, number> = {};
    events.forEach(e => { if (e.gatewayUsed) gatewayBreakdown[e.gatewayUsed] = (gatewayBreakdown[e.gatewayUsed] || 0) + 1; if (e.country) countryBreakdown[e.country] = (countryBreakdown[e.country] || 0) + 1; });
    res.json({ success: true, data: { period: `${days}d`, totalSessions: total, completedSessions: completed, conversionRate, totalRevenue: Number(checkout.totalRevenue), usageCount: checkout.usageCount, gatewayBreakdown, countryBreakdown } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch analytics' }); return; }
};

export const personalizeCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  const { customerPhone, customerEmail, country, currency, amount, deviceType = 'mobile', timeOfDay, recentFailedGateway } = req.body;
  // timeOfDay accepted for future use
  void timeOfDay;
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId, isActive: true }, include: { rules: { where: { isActive: true }, orderBy: { priority: 'asc' } } } });
    if (!checkout) { res.status(404).json({ success: false, error: 'Checkout not found' }); return; }
    let customerData: any = null; let rfmSegment = 'new';
    if (customerPhone || customerEmail) {
      const customers = await prisma.customer.findMany({ where: { merchantId, ...(customerPhone ? { phone: customerPhone } : {}), ...(customerEmail ? { email: customerEmail } : {}) }, take: 1 });
      if (customers.length) {
        customerData = customers[0]; const orders = customerData.totalOrders || 0; const daysSince = Math.floor((Date.now() - new Date(customerData.lastSeenAt).getTime()) / 86400000);
        if (orders >= 5 && daysSince <= 30) rfmSegment = 'VIP';
        else if (orders >= 3) rfmSegment = 'loyal';
        else if (daysSince > 60) rfmSegment = 'at_risk';
        else rfmSegment = 'active';
      }
    }
    const personalization: any = { displayLanguage: country === 'TR' ? 'tr' : 'ar', preferredCurrency: currency || checkout.defaultCurrency };
    const countryMethods: Record<string, string[]> = { SA: ['MADA', 'STC_PAY', 'CREDIT_CARD', 'APPLE_PAY', 'TAMARA', 'TABBY'], AE: ['CREDIT_CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'BANK_TRANSFER'], TR: ['CREDIT_CARD', 'BANK_TRANSFER'], KW: ['CREDIT_CARD', 'KNET', 'APPLE_PAY'], QA: ['CREDIT_CARD', 'APPLE_PAY'], EG: ['CREDIT_CARD', 'MEEZA', 'COD'], IQ: ['CREDIT_CARD', 'COD'] };
    personalization.suggestedMethods = countryMethods[country] || checkout.allowedMethods;
    const upsellMessages: Record<string, string> = { VIP: 'مرحباً بعودتك! لديك شحن مجاني كعميل مميز', loyal: 'شكراً لولائك — استخدم كود LOYAL10 للحصول على خصم', active: 'أهلاً! لديك عروض جديدة في انتظارك', at_risk: 'اشتاقنا إليك! خصم 15% على طلبك اليوم', new: 'مرحباً! أول طلب بدون رسوم شحن' };
    personalization.upsellMessage = upsellMessages[rfmSegment] || null;
    personalization.rfmSegment = rfmSegment;
    let recommendedGateway: string | null = null;
    if (country) { const cgm: Record<string, string> = { SA: 'tap', AE: 'stripe', TR: 'iyzico', KW: 'tap', QA: 'tap', EG: 'stripe', IQ: 'stripe' }; recommendedGateway = cgm[country] || 'stripe'; }
    if (recentFailedGateway && recommendedGateway === recentFailedGateway) { const fallbacks: Record<string, string> = { tap: 'stripe', stripe: 'payfort', iyzico: 'stripe', payfort: 'tap' }; recommendedGateway = fallbacks[recentFailedGateway] || recommendedGateway; personalization.gatewayNote = `تم تغيير الـ gateway تلقائياً بسبب فشل حديث مع ${recentFailedGateway}`; }
    personalization.uiHints = { showQrCode: deviceType === 'desktop', showApplePay: deviceType === 'mobile' || deviceType === 'tablet', compactLayout: deviceType === 'mobile', showSavedCards: rfmSegment !== 'new' };
    await prisma.dynamicCheckoutEvent.create({ data: { checkoutId: id, eventType: 'PERSONALIZE', country: country || null, currency: currency || null, amount: amount || null, gatewayUsed: recommendedGateway, completed: false } });
    res.json({ success: true, data: { personalization, recommendedGateway, customerSegment: rfmSegment, customerName: customerData?.name || null, totalOrders: customerData?.totalOrders || 0, brandColor: checkout.brandColor, logoUrl: checkout.logoUrl } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Personalization failed' }); return; }
};

export const getCustomerPreferences = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id: _id, customerPhone } = req.params;
  // _id (checkoutId) available for future checkout-specific logic
  void _id;
  try {
    const customer = await prisma.customer.findFirst({ where: { merchantId, phone: customerPhone } });
    if (!customer) { res.json({ success: true, data: { found: false, preferences: null } }); return; }
    const recentTx = await prisma.transaction.findMany({ where: { merchantId, customerPhone }, orderBy: { createdAt: 'desc' }, take: 5, select: { method: true, country: true, currency: true, status: true } });
    const methodCount: Record<string, number> = {};
    recentTx.filter(t => t.status === 'SUCCESS').forEach(t => { const m = String(t.method); methodCount[m] = (methodCount[m] || 0) + 1; });
    const preferredMethod = Object.entries(methodCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    res.json({ success: true, data: { found: true, customerId: customer.id, customerName: customer.name, preferredMethod, preferredCurrency: recentTx[0]?.currency || null, totalOrders: customer.totalOrders, lastOrderDaysAgo: Math.floor((Date.now() - new Date(customer.lastSeenAt).getTime()) / 86400000), recentMethods: Object.entries(methodCount).map(([method, count]) => ({ method, count })) } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to get preferences' }); return; }
};
