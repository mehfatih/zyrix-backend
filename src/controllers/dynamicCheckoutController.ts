import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// ─── GET /api/dynamic-checkout ────────────────────────────────
export const listCheckouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    const checkouts = await prisma.dynamicCheckout.findMany({
      where: { merchantId },
      include: {
        rules: { where: { isActive: true }, orderBy: { priority: 'asc' } },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: { checkouts } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch checkouts' });
    return;
  }
};

// ─── POST /api/dynamic-checkout ───────────────────────────────
export const createCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { name, description, brandColor, logoUrl, defaultCurrency, allowedMethods, showBinHints, showGatewayName, autoSelectGateway } = req.body;
  if (!name) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }
  try {
    const checkout = await prisma.dynamicCheckout.create({
      data: {
        merchantId,
        name,
        description: description || null,
        brandColor: brandColor || '#1A56DB',
        logoUrl: logoUrl || null,
        defaultCurrency: defaultCurrency || 'SAR',
        allowedMethods: allowedMethods || [],
        showBinHints: showBinHints !== undefined ? showBinHints : true,
        showGatewayName: showGatewayName !== undefined ? showGatewayName : false,
        autoSelectGateway: autoSelectGateway !== undefined ? autoSelectGateway : true,
      },
    });
    res.status(201).json({ success: true, data: { checkout } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create checkout' });
    return;
  }
};

// ─── GET /api/dynamic-checkout/:id ───────────────────────────
export const getCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({
      where: { id, merchantId },
      include: {
        rules: { orderBy: { priority: 'asc' } },
        _count: { select: { events: true } },
      },
    });
    if (!checkout) {
      res.status(404).json({ success: false, error: 'Checkout not found' });
      return;
    }
    res.json({ success: true, data: { checkout } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch checkout' });
    return;
  }
};

// ─── PATCH /api/dynamic-checkout/:id ─────────────────────────
export const updateCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { name, description, brandColor, logoUrl, defaultCurrency, allowedMethods, showBinHints, showGatewayName, autoSelectGateway, isActive, status } = req.body;
  try {
    const existing = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Checkout not found' });
      return;
    }
    const checkout = await prisma.dynamicCheckout.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(brandColor !== undefined && { brandColor }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(defaultCurrency !== undefined && { defaultCurrency }),
        ...(allowedMethods !== undefined && { allowedMethods }),
        ...(showBinHints !== undefined && { showBinHints }),
        ...(showGatewayName !== undefined && { showGatewayName }),
        ...(autoSelectGateway !== undefined && { autoSelectGateway }),
        ...(isActive !== undefined && { isActive }),
        ...(status !== undefined && { status }),
      },
    });
    res.json({ success: true, data: { checkout } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update checkout' });
    return;
  }
};

// ─── DELETE /api/dynamic-checkout/:id ────────────────────────
export const deleteCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  try {
    const existing = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } });
    if (!existing) {
      res.status(404).json({ success: false, error: 'Checkout not found' });
      return;
    }
    await prisma.dynamicCheckout.delete({ where: { id } });
    res.json({ success: true, message: 'Checkout deleted' });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete checkout' });
    return;
  }
};

// ─── POST /api/dynamic-checkout/:id/rules ────────────────────
export const createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { trigger, condition, action, actionValue, priority } = req.body;
  if (!trigger || !condition || !action) {
    res.status(400).json({ success: false, error: 'trigger, condition, action are required' });
    return;
  }
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } });
    if (!checkout) {
      res.status(404).json({ success: false, error: 'Checkout not found' });
      return;
    }
    const rule = await prisma.dynamicCheckoutRule.create({
      data: { checkoutId: id, trigger, condition, action, actionValue: actionValue || null, priority: priority || 0 },
    });
    res.status(201).json({ success: true, data: { rule } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to create rule' });
    return;
  }
};

// ─── PATCH /api/dynamic-checkout/:id/rules/:ruleId ───────────
export const updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { ruleId } = req.params;
  const { condition, action, actionValue, priority, isActive } = req.body;
  try {
    const rule = await prisma.dynamicCheckoutRule.update({
      where: { id: ruleId },
      data: {
        ...(condition !== undefined && { condition }),
        ...(action !== undefined && { action }),
        ...(actionValue !== undefined && { actionValue }),
        ...(priority !== undefined && { priority }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ success: true, data: { rule } });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update rule' });
    return;
  }
};

// ─── DELETE /api/dynamic-checkout/:id/rules/:ruleId ──────────
export const deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { ruleId } = req.params;
  try {
    await prisma.dynamicCheckoutRule.delete({ where: { id: ruleId } });
    res.json({ success: true, message: 'Rule deleted' });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete rule' });
    return;
  }
};

// ─── POST /api/dynamic-checkout/:id/resolve ──────────────────
// Core engine — يحدد طريقة الدفع والـ gateway بناءً على context
export const resolveCheckout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const { country, currency, amount, isReturningCustomer, timeOfDay } = req.body;
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({
      where: { id, merchantId, isActive: true },
      include: { rules: { where: { isActive: true }, orderBy: { priority: 'asc' } } },
    });
    if (!checkout) {
      res.status(404).json({ success: false, error: 'Checkout not found or inactive' });
      return;
    }

    let resolvedMethods = checkout.allowedMethods.length ? [...checkout.allowedMethods] : ['CREDIT_CARD', 'MADA', 'STC_PAY'];
    let resolvedGateway: string | null = null;
    let appliedRules: string[] = [];

    // تطبيق الـ rules بالترتيب
    for (const rule of checkout.rules) {
      let matches = false;
      switch (rule.trigger) {
        case 'CUSTOMER_COUNTRY':
          matches = country && rule.condition === country;
          break;
        case 'AMOUNT_RANGE': {
          const [min, max] = rule.condition.split('-').map(Number);
          matches = amount && Number(amount) >= min && Number(amount) <= max;
          break;
        }
        case 'RETURNING_CUSTOMER':
          matches = rule.condition === 'true' && isReturningCustomer === true;
          break;
        case 'TIME_OF_DAY': {
          const [startH, endH] = rule.condition.split('-').map(Number);
          const hour = timeOfDay !== undefined ? Number(timeOfDay) : new Date().getHours();
          matches = hour >= startH && hour < endH;
          break;
        }
        case 'PAYMENT_METHOD':
          matches = resolvedMethods.includes(rule.condition);
          break;
      }

      if (matches) {
        appliedRules.push(`${rule.trigger}:${rule.condition} → ${rule.action}`);
        if (rule.action === 'SET_GATEWAY' && rule.actionValue) resolvedGateway = rule.actionValue;
        if (rule.action === 'ADD_METHOD' && rule.actionValue && !resolvedMethods.includes(rule.actionValue)) resolvedMethods.push(rule.actionValue);
        if (rule.action === 'REMOVE_METHOD' && rule.actionValue) resolvedMethods = resolvedMethods.filter(m => m !== rule.actionValue);
        if (rule.action === 'SET_METHODS' && rule.actionValue) resolvedMethods = rule.actionValue.split(',');
      }
    }

    // Auto-select gateway من BIN intelligence إذا لم يُحدد
    if (!resolvedGateway && checkout.autoSelectGateway && country) {
      const countryGatewayMap: Record<string, string> = { SA: 'tap', AE: 'stripe', TR: 'iyzico', KW: 'tap', QA: 'tap', EG: 'stripe', IQ: 'stripe' };
      resolvedGateway = countryGatewayMap[country] || 'stripe';
    }

    // سجّل الحدث
    await prisma.dynamicCheckoutEvent.create({
      data: { checkoutId: id, eventType: 'RESOLVE', country: country || null, currency: currency || null, amount: amount || null, gatewayUsed: resolvedGateway, completed: false },
    });

    // تحديث usage count
    await prisma.dynamicCheckout.update({ where: { id }, data: { usageCount: { increment: 1 } } });

    res.json({
      success: true,
      data: {
        resolvedMethods,
        resolvedGateway,
        appliedRules,
        showBinHints: checkout.showBinHints,
        showGatewayName: checkout.showGatewayName,
        brandColor: checkout.brandColor,
        logoUrl: checkout.logoUrl,
        defaultCurrency: checkout.defaultCurrency,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to resolve checkout' });
    return;
  }
};

// ─── GET /api/dynamic-checkout/:id/analytics ─────────────────
export const getAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { id } = req.params;
  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000);
  try {
    const checkout = await prisma.dynamicCheckout.findFirst({ where: { id, merchantId } });
    if (!checkout) {
      res.status(404).json({ success: false, error: 'Checkout not found' });
      return;
    }
    const events = await prisma.dynamicCheckoutEvent.findMany({
      where: { checkoutId: id, createdAt: { gte: since } },
    });

    const total = events.length;
    const completed = events.filter(e => e.completed).length;
    const conversionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const gatewayBreakdown: Record<string, number> = {};
    const countryBreakdown: Record<string, number> = {};
    events.forEach(e => {
      if (e.gatewayUsed) gatewayBreakdown[e.gatewayUsed] = (gatewayBreakdown[e.gatewayUsed] || 0) + 1;
      if (e.country)     countryBreakdown[e.country]     = (countryBreakdown[e.country]     || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        period: `${days}d`,
        totalSessions: total,
        completedSessions: completed,
        conversionRate,
        totalRevenue: Number(checkout.totalRevenue),
        usageCount: checkout.usageCount,
        gatewayBreakdown,
        countryBreakdown,
      },
    });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    return;
  }
};
