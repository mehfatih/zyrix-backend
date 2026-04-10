import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

export const listGateways = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    const gateways = await prisma.paymentGateway.findMany({ where: { merchantId }, include: { routingRules: { where: { isActive: true }, orderBy: { priority: 'asc' } }, _count: { select: { events: true } } }, orderBy: { priority: 'asc' } });
    res.json({ success: true, data: { gateways } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch gateways' }); return; }
};

export const createGateway = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { name, code, description, logoUrl, supportedCountries, supportedCurrencies, supportedMethods, costPercent, costFixed, priority, config } = req.body;
  if (!name || !code) { res.status(400).json({ success: false, error: 'name and code are required' }); return; }
  try {
    const gateway = await prisma.paymentGateway.create({ data: { merchantId, name, code, description: description || null, logoUrl: logoUrl || null, supportedCountries: supportedCountries || [], supportedCurrencies: supportedCurrencies || [], supportedMethods: supportedMethods || [], costPercent: costPercent || 0, costFixed: costFixed || 0, priority: priority || 0, config: config || null } });
    res.status(201).json({ success: true, data: { gateway } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to create gateway' }); return; }
};

export const updateGateway = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  const { name, description, status, isDefault, priority, costPercent, costFixed, supportedCountries, supportedCurrencies, supportedMethods, config } = req.body;
  try {
    const existing = await prisma.paymentGateway.findFirst({ where: { id, merchantId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Gateway not found' }); return; }
    if (isDefault) { await prisma.paymentGateway.updateMany({ where: { merchantId, isDefault: true }, data: { isDefault: false } }); }
    const gateway = await prisma.paymentGateway.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(status !== undefined && { status }), ...(isDefault !== undefined && { isDefault }), ...(priority !== undefined && { priority }), ...(costPercent !== undefined && { costPercent }), ...(costFixed !== undefined && { costFixed }), ...(supportedCountries !== undefined && { supportedCountries }), ...(supportedCurrencies !== undefined && { supportedCurrencies }), ...(supportedMethods !== undefined && { supportedMethods }), ...(config !== undefined && { config }) } });
    res.json({ success: true, data: { gateway } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to update gateway' }); return; }
};

export const deleteGateway = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  try {
    const existing = await prisma.paymentGateway.findFirst({ where: { id, merchantId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Gateway not found' }); return; }
    await prisma.paymentGateway.delete({ where: { id } });
    res.json({ success: true, message: 'Gateway deleted' }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to delete gateway' }); return; }
};

export const getConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    let config = await prisma.gatewayRoutingConfig.findUnique({ where: { merchantId } });
    if (!config) { config = await prisma.gatewayRoutingConfig.create({ data: { merchantId, mode: 'SUCCESS_RATE', fallbackEnabled: true, maxRetries: 2 } }); }
    res.json({ success: true, data: { config } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch config' }); return; }
};

export const updateConfig = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { mode, fallbackEnabled, maxRetries } = req.body;
  try {
    const config = await prisma.gatewayRoutingConfig.upsert({ where: { merchantId }, create: { merchantId, mode: mode || 'SUCCESS_RATE', fallbackEnabled: fallbackEnabled !== undefined ? fallbackEnabled : true, maxRetries: maxRetries || 2 }, update: { ...(mode !== undefined && { mode }), ...(fallbackEnabled !== undefined && { fallbackEnabled }), ...(maxRetries !== undefined && { maxRetries }) } });
    res.json({ success: true, data: { config } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to update config' }); return; }
};

export const listRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try {
    const rules = await prisma.gatewayRoutingRule.findMany({ where: { merchantId }, include: { gateway: { select: { id: true, name: true, code: true, status: true } } }, orderBy: { priority: 'asc' } });
    res.json({ success: true, data: { rules } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch rules' }); return; }
};

export const createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { gatewayId, type, value, priority } = req.body;
  if (!gatewayId || !type || !value) { res.status(400).json({ success: false, error: 'gatewayId, type, value are required' }); return; }
  try {
    const gatewayExists = await prisma.paymentGateway.findFirst({ where: { id: gatewayId, merchantId } });
    if (!gatewayExists) { res.status(404).json({ success: false, error: 'Gateway not found' }); return; }
    const rule = await prisma.gatewayRoutingRule.create({ data: { merchantId, gatewayId, type, value, priority: priority || 0 } });
    res.status(201).json({ success: true, data: { rule } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to create rule' }); return; }
};

export const updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params; const { value, priority, isActive } = req.body;
  try {
    const existing = await prisma.gatewayRoutingRule.findFirst({ where: { id, merchantId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Rule not found' }); return; }
    const rule = await prisma.gatewayRoutingRule.update({ where: { id }, data: { ...(value !== undefined && { value }), ...(priority !== undefined && { priority }), ...(isActive !== undefined && { isActive }) } });
    res.json({ success: true, data: { rule } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to update rule' }); return; }
};

export const deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  try {
    const existing = await prisma.gatewayRoutingRule.findFirst({ where: { id, merchantId } });
    if (!existing) { res.status(404).json({ success: false, error: 'Rule not found' }); return; }
    await prisma.gatewayRoutingRule.delete({ where: { id } });
    res.json({ success: true, message: 'Rule deleted' }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to delete rule' }); return; }
};

export const getAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const days = parseInt(req.query.days as string) || 30; const since = new Date(Date.now() - days * 86400000);
  try {
    const gateways = await prisma.paymentGateway.findMany({ where: { merchantId }, include: { events: { where: { createdAt: { gte: since } }, select: { eventType: true, responseMs: true, amount: true, createdAt: true } } } });
    const analytics = gateways.map((gw) => {
      const total = gw.events.length; const success = gw.events.filter(e => e.eventType === 'SUCCESS').length; const failures = gw.events.filter(e => e.eventType === 'FAILURE').length;
      const responseTimes = gw.events.filter(e => e.responseMs).map(e => e.responseMs as number); const avgResponse = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
      const volume = gw.events.filter(e => e.eventType === 'SUCCESS' && e.amount).reduce((sum, e) => sum + Number(e.amount), 0);
      return { id: gw.id, name: gw.name, code: gw.code, status: gw.status, isDefault: gw.isDefault, successRate: total > 0 ? Math.round((success / total) * 100) : 0, totalEvents: total, successCount: success, failureCount: failures, avgResponseMs: avgResponse, volume: Math.round(volume * 100) / 100, costPercent: Number(gw.costPercent), costFixed: Number(gw.costFixed) };
    });
    res.json({ success: true, data: { analytics, period: `${days}d` } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch analytics' }); return; }
};

export const routeTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { country, currency, method: _method } = req.body;
  if (!country || !currency) { res.status(400).json({ success: false, error: 'country and currency are required' }); return; }
  try {
    const [config, gateways] = await Promise.all([
      prisma.gatewayRoutingConfig.findUnique({ where: { merchantId } }),
      prisma.paymentGateway.findMany({ where: { merchantId, status: 'ACTIVE' }, include: { routingRules: { where: { isActive: true } } }, orderBy: { priority: 'asc' } }),
    ]);
    const mode = config?.mode || 'SUCCESS_RATE';
    let eligible = gateways.filter((gw) => {
      const countryRules = gw.routingRules.filter(r => r.type === 'COUNTRY'); const currencyRules = gw.routingRules.filter(r => r.type === 'CURRENCY');
      if (countryRules.length && !countryRules.some(r => r.value === country)) return false;
      if (currencyRules.length && !currencyRules.some(r => r.value === currency)) return false;
      return true;
    });
    if (!eligible.length && config?.fallbackEnabled) eligible = gateways;
    if (!eligible.length) { res.status(404).json({ success: false, error: 'No eligible gateway found' }); return; }
    if (mode === 'SUCCESS_RATE') eligible.sort((a, b) => Number(b.successRate) - Number(a.successRate));
    else if (mode === 'COST_OPTIMIZED') eligible.sort((a, b) => Number(a.costPercent) - Number(b.costPercent));
    else if (mode === 'LOAD_BALANCED') eligible.sort((a, b) => a.totalTransactions - b.totalTransactions);
    const selected = eligible[0]; const fallbacks = eligible.slice(1, (config?.maxRetries || 2) + 1).map(g => ({ id: g.id, name: g.name, code: g.code }));
    res.json({ success: true, data: { gateway: { id: selected.id, name: selected.name, code: selected.code, config: selected.config }, fallbacks, mode, eligibleCount: eligible.length } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Routing failed' }); return; }
};

export const recordEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { gatewayId, eventType, responseMs, errorCode, errorMessage, country, currency, amount, transactionId } = req.body;
  if (!gatewayId || !eventType) { res.status(400).json({ success: false, error: 'gatewayId and eventType are required' }); return; }
  try {
    const gatewayExists = await prisma.paymentGateway.findFirst({ where: { id: gatewayId, merchantId } });
    if (!gatewayExists) { res.status(404).json({ success: false, error: 'Gateway not found' }); return; }
    const event = await prisma.gatewayEvent.create({ data: { merchantId, gatewayId, transactionId: transactionId || null, eventType, responseMs: responseMs || null, errorCode: errorCode || null, errorMessage: errorMessage || null, country: country || null, currency: currency || null, amount: amount || null } });
    const recentEvents = await prisma.gatewayEvent.findMany({ where: { gatewayId, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { eventType: true, responseMs: true } });
    const total = recentEvents.length; const successes = recentEvents.filter(e => e.eventType === 'SUCCESS').length; const times = recentEvents.filter(e => e.responseMs).map(e => e.responseMs as number); const avgMs = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    await prisma.paymentGateway.update({ where: { id: gatewayId }, data: { successRate: total > 0 ? (successes / total) * 100 : 0, avgResponseMs: avgMs, totalTransactions: { increment: 1 } } });
    res.status(201).json({ success: true, data: { event } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to record event' }); return; }
};

export const aiRouteTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  const { country, currency, amount, successWeight = 0.5, costWeight = 0.3, speedWeight = 0.2 } = req.body;
  if (!country || !currency) { res.status(400).json({ success: false, error: 'country and currency are required' }); return; }
  try {
    const gateways = await prisma.paymentGateway.findMany({ where: { merchantId, status: 'ACTIVE' }, include: { routingRules: { where: { isActive: true } }, events: { where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) }, country }, select: { eventType: true, responseMs: true } } } });
    const eligible = gateways.filter((gw) => {
      const cr = gw.routingRules.filter(r => r.type === 'COUNTRY'); const curr = gw.routingRules.filter(r => r.type === 'CURRENCY');
      if (cr.length && !cr.some(r => r.value === country)) return false;
      if (curr.length && !curr.some(r => r.value === currency)) return false;
      return true;
    });
    if (!eligible.length) { res.status(404).json({ success: false, error: 'No eligible gateway found' }); return; }
    const scored = eligible.map((gw) => {
      const ce = gw.events; const ct = ce.length; const cs = ce.filter(e => e.eventType === 'SUCCESS').length;
      const csr = ct > 0 ? (cs / ct) * 100 : Number(gw.successRate);
      const txCost = amount ? (Number(gw.costPercent) / 100) * Number(amount) + Number(gw.costFixed) : Number(gw.costPercent);
      const costScore = Math.max(0, 100 - (txCost / 5) * 100);
      const rts = ce.filter(e => e.responseMs).map(e => e.responseMs as number);
      const avgMs = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : Number(gw.avgResponseMs) || 2000;
      const speedScore = Math.max(0, 100 - (avgMs / 5000) * 100);
      const aiScore = (csr * Number(successWeight)) + (costScore * Number(costWeight)) + (speedScore * Number(speedWeight));
      return { id: gw.id, name: gw.name, code: gw.code, aiScore: Math.round(aiScore * 10) / 10, countrySuccessRate: Math.round(csr * 10) / 10, costScore: Math.round(costScore * 10) / 10, speedScore: Math.round(speedScore * 10) / 10, estimatedCost: Math.round(txCost * 100) / 100, avgResponseMs: Math.round(avgMs), countryEvents: ct, config: gw.config };
    });
    scored.sort((a, b) => b.aiScore - a.aiScore);
    const selected = scored[0]; const fallbacks = scored.slice(1, 3);
    res.json({ success: true, data: { gateway: selected, fallbacks, weights: { success: successWeight, cost: costWeight, speed: speedWeight }, allScores: scored, explanation: `${selected.name} فاز بـ AI score ${selected.aiScore}` } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'AI routing failed' }); return; }
};

export const getAiInsights = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const days = parseInt(req.query.days as string) || 30; const since = new Date(Date.now() - days * 86400000);
  try {
    const events = await prisma.gatewayEvent.findMany({ where: { merchantId, createdAt: { gte: since }, country: { not: null } }, select: { gatewayId: true, eventType: true, country: true, amount: true, responseMs: true } });
    const gateways = await prisma.paymentGateway.findMany({ where: { merchantId }, select: { id: true, name: true, code: true, costPercent: true } });
    const gwMap = new Map(gateways.map(g => [g.id, g]));
    const matrix: Record<string, Record<string, { success: number; total: number; volume: number; msArr: number[] }>> = {};
    events.forEach(e => {
      const c = e.country!; const g = e.gatewayId;
      if (!matrix[c]) matrix[c] = {}; if (!matrix[c][g]) matrix[c][g] = { success: 0, total: 0, volume: 0, msArr: [] };
      matrix[c][g].total++; if (e.eventType === 'SUCCESS') { matrix[c][g].success++; matrix[c][g].volume += Number(e.amount || 0); } if (e.responseMs) matrix[c][g].msArr.push(e.responseMs);
    });
    const insights = Object.entries(matrix).map(([country, gwData]) => {
      const gwStats = Object.entries(gwData).map(([gwId, data]) => {
        const gw = gwMap.get(gwId); const avgMs = data.msArr.length ? Math.round(data.msArr.reduce((a, b) => a + b, 0) / data.msArr.length) : 0;
        return { gatewayId: gwId, gatewayName: gw?.name || 'Unknown', gatewayCode: gw?.code || 'unknown', successRate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0, total: data.total, volume: Math.round(data.volume), avgResponseMs: avgMs, costPercent: Number(gw?.costPercent || 0) };
      }).sort((a, b) => b.successRate - a.successRate);
      const best = gwStats[0];
      return { country, bestGateway: best || null, allGateways: gwStats, recommendation: best ? `استخدم ${best.gatewayName} لـ ${country} — نجاح ${best.successRate}%` : 'لا يوجد بيانات كافية' };
    });
    res.json({ success: true, data: { insights, period: `${days}d`, totalCountries: insights.length } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to get AI insights' }); return; }
};

export const getFallbackChain = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { country, currency } = req.query;
  try {
    const [config, gateways] = await Promise.all([
      prisma.gatewayRoutingConfig.findUnique({ where: { merchantId } }),
      prisma.paymentGateway.findMany({ where: { merchantId, status: 'ACTIVE' }, include: { routingRules: { where: { isActive: true } } }, orderBy: { successRate: 'desc' } }),
    ]);
    const eligible = country && currency ? gateways.filter((gw) => {
      const cr = gw.routingRules.filter(r => r.type === 'COUNTRY'); const cur = gw.routingRules.filter(r => r.type === 'CURRENCY');
      if (cr.length && !cr.some(r => r.value === country)) return false;
      if (cur.length && !cur.some(r => r.value === currency)) return false;
      return true;
    }) : gateways;
    const chain = eligible.map((gw, i) => ({ step: i + 1, gateway: { id: gw.id, name: gw.name, code: gw.code }, successRate: Number(gw.successRate), avgResponseMs: gw.avgResponseMs, costPercent: Number(gw.costPercent), isDefault: gw.isDefault, reason: i === 0 ? 'Primary (highest success rate)' : `Fallback #${i}` }));
    res.json({ success: true, data: { chain, maxRetries: config?.maxRetries || 2, fallbackEnabled: config?.fallbackEnabled !== false, country: country || 'any', currency: currency || 'any' } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to get fallback chain' }); return; }
};
