import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

function calculateRiskLevel(score: number): string {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

export const analyzeTransaction = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { transactionId, amount, currency, country, customerPhone, customerEmail, ipAddress } = req.body;
  if (!amount || !currency) { res.status(400).json({ success: false, error: 'amount and currency are required' }); return; }
  try {
    const rules = await prisma.fraudRule.findMany({ where: { merchantId, isActive: true } });
    const since1h = new Date(Date.now() - 3600000); const since24h = new Date(Date.now() - 86400000);
    const recentByPhone = customerPhone ? await prisma.transaction.count({ where: { merchantId, customerPhone, createdAt: { gte: since1h } } }) : 0;
    const recentByEmail = customerEmail ? await prisma.transaction.count({ where: { merchantId, customerEmail, createdAt: { gte: since1h } } }) : 0;
    const recentByCountry = country ? await prisma.transaction.count({ where: { merchantId, country, createdAt: { gte: since24h } } }) : 0;
    let totalScore = 0; const signals: Record<string, any> = {}; const triggeredRules: string[] = []; let finalAction = 'ALLOW';
    for (const rule of rules) {
      const cond = rule.conditions as any; let triggered = false;
      switch (rule.type) {
        case 'VELOCITY': if (cond.field === 'phone' && recentByPhone >= (cond.maxCount || 3)) triggered = true; if (cond.field === 'email' && recentByEmail >= (cond.maxCount || 3)) triggered = true; break;
        case 'AMOUNT_LIMIT': if (Number(amount) > (cond.maxAmount || 10000)) triggered = true; if (cond.minAmount && Number(amount) < cond.minAmount) triggered = true; break;
        case 'COUNTRY_BLOCK': if (country && (cond.blockedCountries || []).includes(country)) triggered = true; break;
        case 'IP_BLOCK': if (ipAddress && (cond.blockedIPs || []).includes(ipAddress)) triggered = true; break;
        case 'DUPLICATE_CHECK': { const dupWindow = new Date(Date.now() - (cond.windowMinutes || 10) * 60000); const dup = await prisma.transaction.count({ where: { merchantId, amount: { equals: amount }, customerPhone: customerPhone || undefined, createdAt: { gte: dupWindow } } }); if (dup >= (cond.maxDuplicates || 1)) triggered = true; break; }
      }
      if (triggered) { totalScore += rule.riskScore; triggeredRules.push(rule.name); if (rule.action === 'BLOCK') finalAction = 'BLOCK'; else if (rule.action === 'REVIEW' && finalAction !== 'BLOCK') finalAction = 'REVIEW'; else if (rule.action === 'CHALLENGE' && finalAction === 'ALLOW') finalAction = 'CHALLENGE'; await prisma.fraudRule.update({ where: { id: rule.id }, data: { triggerCount: { increment: 1 } } }); }
    }
    if (recentByPhone > 2) { signals.velocityPhone = recentByPhone; totalScore += 15; }
    if (recentByEmail > 2) { signals.velocityEmail = recentByEmail; totalScore += 10; }
    if (Number(amount) > 5000) { signals.highAmount = Number(amount); totalScore += 10; }
    if (recentByCountry > 50) { signals.countryVelocity = recentByCountry; totalScore += 5; }
    const riskScore = Math.min(totalScore, 100); const riskLevel = calculateRiskLevel(riskScore);
    if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') finalAction = finalAction === 'ALLOW' ? 'REVIEW' : finalAction;
    const event = await prisma.fraudEvent.create({ data: { merchantId, transactionId: transactionId || null, riskScore, riskLevel: riskLevel as any, action: finalAction as any, triggeredRules, signals, customerPhone: customerPhone || null, customerEmail: customerEmail || null, country: country || null, amount: amount || null, currency: currency || null, ipAddress: ipAddress || null } });
    res.json({ success: true, data: { riskScore, riskLevel, action: finalAction, triggeredRules, signals, eventId: event.id, allowed: finalAction === 'ALLOW' } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Fraud analysis failed' }); return; }
};

export const listEvents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { riskLevel, reviewed, page = '1', limit = '20' } = req.query; const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  try {
    const where: any = { merchantId }; if (riskLevel) where.riskLevel = riskLevel; if (reviewed !== undefined) where.reviewed = reviewed === 'true';
    const [events, total] = await Promise.all([prisma.fraudEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit as string) }), prisma.fraudEvent.count({ where })]);
    res.json({ success: true, data: { events, pagination: { page: parseInt(page as string), limit: parseInt(limit as string), total, pages: Math.ceil(total / parseInt(limit as string)) } } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch events' }); return; }
};

export const reviewEvent = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params; const { reviewNote } = req.body;
  try { const existing = await prisma.fraudEvent.findFirst({ where: { id, merchantId } }); if (!existing) { res.status(404).json({ success: false, error: 'Event not found' }); return; } const event = await prisma.fraudEvent.update({ where: { id }, data: { reviewed: true, reviewNote: reviewNote || null } }); res.json({ success: true, data: { event } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to review event' }); return; }
};

export const listRules = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  try { const rules = await prisma.fraudRule.findMany({ where: { merchantId }, orderBy: { createdAt: 'desc' } }); res.json({ success: true, data: { rules } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch rules' }); return; }
};

export const createRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { name, description, type, action, riskScore, conditions } = req.body;
  if (!name || !type || !action) { res.status(400).json({ success: false, error: 'name, type, action are required' }); return; }
  try { const rule = await prisma.fraudRule.create({ data: { merchantId, name, description: description || null, type, action, riskScore: riskScore || 50, conditions: conditions || {} } }); res.status(201).json({ success: true, data: { rule } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to create rule' }); return; }
};

export const updateRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params; const { name, description, action, riskScore, conditions, isActive } = req.body;
  try { const existing = await prisma.fraudRule.findFirst({ where: { id, merchantId } }); if (!existing) { res.status(404).json({ success: false, error: 'Rule not found' }); return; } const rule = await prisma.fraudRule.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }), ...(action !== undefined && { action }), ...(riskScore !== undefined && { riskScore }), ...(conditions !== undefined && { conditions }), ...(isActive !== undefined && { isActive }) } }); res.json({ success: true, data: { rule } }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to update rule' }); return; }
};

export const deleteRule = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const { id } = req.params;
  try { const existing = await prisma.fraudRule.findFirst({ where: { id, merchantId } }); if (!existing) { res.status(404).json({ success: false, error: 'Rule not found' }); return; } await prisma.fraudRule.delete({ where: { id } }); res.json({ success: true, message: 'Rule deleted' }); return; }
  catch (err) { res.status(500).json({ success: false, error: 'Failed to delete rule' }); return; }
};

export const getStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id; const days = parseInt(req.query.days as string) || 30; const since = new Date(Date.now() - days * 86400000);
  try {
    const events = await prisma.fraudEvent.findMany({ where: { merchantId, createdAt: { gte: since } } });
    const total = events.length; const blocked = events.filter(e => e.action === 'BLOCK').length; const reviewed = events.filter(e => e.action === 'REVIEW').length; const allowed = events.filter(e => e.action === 'ALLOW').length;
    const critical = events.filter(e => e.riskLevel === 'CRITICAL').length; const high = events.filter(e => e.riskLevel === 'HIGH').length; const medium = events.filter(e => e.riskLevel === 'MEDIUM').length; const low = events.filter(e => e.riskLevel === 'LOW').length;
    const avgScore = total > 0 ? Math.round(events.reduce((s, e) => s + e.riskScore, 0) / total) : 0;
    const unreviewed = events.filter(e => (e.action === 'REVIEW' || e.riskLevel === 'HIGH' || e.riskLevel === 'CRITICAL') && !e.reviewed).length;
    const topRules: Record<string, number> = {}; events.forEach(e => { (e.triggeredRules as string[]).forEach((r: string) => { topRules[r] = (topRules[r] || 0) + 1; }); });
    const topRulesSorted = Object.entries(topRules).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
    res.json({ success: true, data: { period: `${days}d`, total, blocked, reviewed, allowed, critical, high, medium, low, avgScore, unreviewed, topRules: topRulesSorted } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch stats' }); return; }
};

export const mlScore = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  // customerEmail, ipAddress, userAgent, timezoneOffset: received for logging/future use — not used in current scoring logic
  const { amount, currency, country, customerPhone, customerEmail: _customerEmail, ipAddress: _ipAddress, deviceFingerprint, userAgent: _userAgent, sessionDurationSeconds, pageViews, billingCountry, shippingCountry, isVpn = false, isProxy = false, timezoneOffset: _timezoneOffset } = req.body;
  void _customerEmail; void _ipAddress; void _userAgent; void _timezoneOffset;
  if (!amount || !currency) { res.status(400).json({ success: false, error: 'amount and currency are required' }); return; }
  try {
    let score = 0; const mlSignals: Record<string, any> = {};
    if (sessionDurationSeconds !== undefined && sessionDurationSeconds < 30) { score += 20; mlSignals.fastSession = `${sessionDurationSeconds}s — unusually fast`; }
    if (pageViews !== undefined && pageViews <= 1) { score += 15; mlSignals.directCheckout = 'Went directly to checkout — no browsing'; }
    if (deviceFingerprint) {
      const recentByDevice: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM fraud_events WHERE "merchantId"=$1 AND signals::text LIKE $2 AND "createdAt">=NOW()-INTERVAL '24 hours'`, merchantId, `%${deviceFingerprint}%`);
      const deviceCount = Number(recentByDevice[0]?.cnt || 0);
      if (deviceCount > 3) { score += 25; mlSignals.deviceAbuse = `Device seen ${deviceCount} times in 24h`; }
    }
    if (isVpn) { score += 20; mlSignals.vpnDetected = 'VPN usage detected — elevated risk'; }
    if (isProxy) { score += 25; mlSignals.proxyDetected = 'Proxy detected — high risk'; }
    if (billingCountry && shippingCountry && billingCountry !== shippingCountry) { score += 15; mlSignals.geoMismatch = `Billing: ${billingCountry} vs Shipping: ${shippingCountry}`; }
    if (billingCountry && country && billingCountry !== country) { score += 10; mlSignals.ipCountryMismatch = `IP country: ${country} vs Billing: ${billingCountry}`; }
    if (customerPhone) {
      const velocity = await prisma.transaction.count({ where: { merchantId, customerPhone, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (velocity >= 3) { score += 20; mlSignals.velocityAlert = `${velocity} transactions in last hour`; }
      const history = await prisma.transaction.findMany({ where: { merchantId, customerPhone, status: 'SUCCESS' }, select: { amount: true }, take: 20 });
      if (history.length >= 5) {
        const amounts = history.map(t => Number(t.amount)); const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        if (Number(amount) > avgAmount * 3) { score += 15; mlSignals.amountAnomaly = `Amount ${amount} is ${Math.round(Number(amount)/avgAmount)}x above average ${Math.round(avgAmount)}`; }
      }
    }
    const finalScore = Math.min(score, 100); const riskLevel = calculateRiskLevel(finalScore); const action = finalScore >= 70 ? 'BLOCK' : finalScore >= 40 ? 'REVIEW' : 'ALLOW';
    res.json({ success: true, data: { mlScore: finalScore, riskLevel, action, mlSignals, breakdown: { behavioral: mlSignals.fastSession || mlSignals.directCheckout ? 'elevated' : 'normal', device: mlSignals.deviceAbuse ? 'high_risk' : 'normal', network: (mlSignals.vpnDetected || mlSignals.proxyDetected) ? 'elevated' : 'normal', geo: (mlSignals.geoMismatch || mlSignals.ipCountryMismatch) ? 'mismatch' : 'consistent', velocity: mlSignals.velocityAlert ? 'high' : 'normal', amount: mlSignals.amountAnomaly ? 'anomalous' : 'normal' }, recommendation: action === 'BLOCK' ? 'Block this transaction immediately' : action === 'REVIEW' ? 'Flag for manual review before processing' : 'Low risk — proceed with transaction' } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'ML scoring failed' }); return; }
};

export const checkDeviceFingerprint = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant.id;
  // customerPhone, userAgent, screenResolution, timezone: accepted for future enrichment — not used in current logic
  const { fingerprint, customerPhone: _customerPhone, userAgent: _userAgent, screenResolution: _screenResolution, timezone: _timezone } = req.body;
  void _customerPhone; void _userAgent; void _screenResolution; void _timezone;
  if (!fingerprint) { res.status(400).json({ success: false, error: 'fingerprint is required' }); return; }
  try {
    const history: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as total, SUM(CASE WHEN action='BLOCK' THEN 1 ELSE 0 END) as blocked FROM fraud_events WHERE "merchantId"=$1 AND signals::text LIKE $2`, merchantId, `%${fingerprint}%`);
    const totalSeen = Number(history[0]?.total || 0); const timesBlocked = Number(history[0]?.blocked || 0);
    const riskScore = timesBlocked > 0 ? Math.min(timesBlocked * 30, 90) : totalSeen > 5 ? 25 : 0;
    res.json({ success: true, data: { fingerprint, totalSeen, timesBlocked, riskScore, riskLevel: calculateRiskLevel(riskScore), isKnownDevice: totalSeen > 0, isSuspicious: timesBlocked > 0, recommendation: timesBlocked > 2 ? 'BLOCK — known fraudulent device' : riskScore > 0 ? 'REVIEW — seen multiple times' : 'ALLOW — new or clean device' } }); return;
  } catch (err) { res.status(500).json({ success: false, error: 'Device fingerprint check failed' }); return; }
};
