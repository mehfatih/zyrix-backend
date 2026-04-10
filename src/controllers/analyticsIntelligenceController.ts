import { Response } from 'express';
import { prisma } from '../config/database';
import { AuthenticatedRequest } from '../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function dateFrom(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. DASHBOARD — real-time KPIs
// GET /api/analytics/dashboard?range=7d|30d|90d
// ─────────────────────────────────────────────────────────────────────────────
export async function getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const range = (req.query.range as string) || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = dateFrom(days);
    const prevSince = dateFrom(days * 2);

    const [txCurr, txPrev, pendingSettlements, openDisputes] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END),0)::int AS success_count,
                COALESCE(SUM(CASE WHEN status='FAILED'  THEN 1 ELSE 0 END),0)::int AS fail_count,
                COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS volume
         FROM transactions
         WHERE "merchantId"=$1 AND "createdAt">=$2`,
        merchantId, since
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS total,
                COALESCE(SUM(CASE WHEN status='SUCCESS' THEN 1 ELSE 0 END),0)::int AS success_count,
                COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS volume
         FROM transactions
         WHERE "merchantId"=$1 AND "createdAt">=$2 AND "createdAt"<$3`,
        merchantId, prevSince, since
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS cnt FROM settlements WHERE "merchantId"=$1 AND status='SCHEDULED'`,
        merchantId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS cnt FROM disputes WHERE "merchantId"=$1 AND status IN ('OPEN','UNDER_REVIEW')`,
        merchantId
      ),
    ]);

    const curr = txCurr[0];
    const prev = txPrev[0];
    const successRate = curr.total > 0 ? Math.round((curr.success_count / curr.total) * 100) : 0;
    const prevRate    = prev.total > 0 ? Math.round((prev.success_count / prev.total) * 100) : 0;

    const volChange  = prev.volume > 0 ? Math.round(((curr.volume - prev.volume) / prev.volume) * 100) : 0;
    const txChange   = prev.total  > 0 ? Math.round(((curr.total  - prev.total)  / prev.total)  * 100) : 0;
    const rateChange = prevRate    > 0 ? successRate - prevRate : 0;

    // last 7 daily points for sparkline
    const sparkRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT DATE("createdAt") AS day,
              COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS vol,
              COUNT(*)::int AS cnt
       FROM transactions
       WHERE "merchantId"=$1 AND "createdAt">=NOW()-INTERVAL '7 days'
       GROUP BY day ORDER BY day ASC`,
      merchantId
    );

    res.json({
      success: true,
      data: {
        range,
        kpis: {
          totalVolume:    { value: safeNum(curr.volume),        change: volChange,  trend: volChange  >= 0 ? 'up' : 'down' },
          successRate:    { value: successRate,                 change: rateChange, trend: rateChange >= 0 ? 'up' : 'down' },
          totalTx:        { value: safeNum(curr.total),         change: txChange,   trend: txChange   >= 0 ? 'up' : 'down' },
          failedTx:       { value: safeNum(curr.fail_count),    change: 0,          trend: 'neutral' },
          pendingSettlements: safeNum(pendingSettlements[0]?.cnt),
          openDisputes:       safeNum(openDisputes[0]?.cnt),
        },
        sparkline: sparkRows.map(r => ({ day: r.day, volume: safeNum(r.vol), txCount: safeNum(r.cnt) })),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 17. CONVERSION FUNNEL — click → payment
// GET /api/analytics/funnel?range=7d|30d|90d
// ─────────────────────────────────────────────────────────────────────────────
export async function getConversionFunnel(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const range = (req.query.range as string) || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = dateFrom(days);

    // Payment Links funnel: link views → initiated → success
    const linkRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COALESCE(SUM("usageCount"),0)::int AS initiated,
         COALESCE(SUM("paidCount"),0)::int  AS paid
       FROM payment_links
       WHERE "merchantId"=$1 AND "createdAt"<=$2`,
      merchantId, new Date()
    );

    // Checkout sessions funnel
    const sessionRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(*)::int AS sessions,
         COUNT(CASE WHEN status='PAID' THEN 1 END)::int AS paid
       FROM checkout_sessions cs
       JOIN hosted_checkouts hc ON cs."checkoutId"=hc.id
       WHERE hc."merchantId"=$1 AND cs."createdAt">=$2`,
      merchantId, since
    );

    // Transactions total in period
    const txRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status='SUCCESS' THEN 1 END)::int AS success,
         COUNT(CASE WHEN status='FAILED'  THEN 1 END)::int AS failed,
         COUNT(CASE WHEN status='PENDING' THEN 1 END)::int AS pending
       FROM transactions WHERE "merchantId"=$1 AND "createdAt">=$2`,
      merchantId, since
    );

    const tx = txRows[0];
    const lk = linkRows[0];
    const ss = sessionRows[0];

    const initiated  = safeNum(lk.initiated) + safeNum(ss.sessions);
    const processing = safeNum(tx.total);
    const succeeded  = safeNum(tx.success);
    const dropped    = initiated > processing ? initiated - processing : 0;

    const steps = [
      { label: 'زيارة / Click',      value: Math.max(initiated, processing), pct: 100 },
      { label: 'بدء الدفع',          value: processing,  pct: initiated > 0 ? Math.round((processing / Math.max(initiated, processing)) * 100) : 100 },
      { label: 'معالجة',             value: processing - safeNum(tx.pending), pct: processing > 0 ? Math.round(((processing - safeNum(tx.pending)) / processing) * 100) : 0 },
      { label: 'نجاح',               value: succeeded,   pct: processing > 0 ? Math.round((succeeded  / processing) * 100) : 0 },
    ];

    res.json({
      success: true,
      data: {
        range,
        steps,
        summary: {
          totalInitiated: initiated,
          totalSucceeded: succeeded,
          totalFailed:    safeNum(tx.failed),
          totalPending:   safeNum(tx.pending),
          dropped,
          conversionRate: Math.max(initiated, processing) > 0
            ? Math.round((succeeded / Math.max(initiated, processing)) * 100)
            : 0,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 18. PAYMENT SUCCESS RATE — by country
// GET /api/analytics/success-rate?range=7d|30d|90d
// ─────────────────────────────────────────────────────────────────────────────
export async function getSuccessRate(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const range = (req.query.range as string) || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = dateFrom(days);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         country,
         flag,
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status='SUCCESS' THEN 1 END)::int AS success,
         COUNT(CASE WHEN status='FAILED'  THEN 1 END)::int AS failed,
         COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS volume
       FROM transactions
       WHERE "merchantId"=$1 AND "createdAt">=$2
       GROUP BY country, flag
       ORDER BY total DESC`,
      merchantId, since
    );

    const byCountry = rows.map(r => ({
      country:     r.country,
      flag:        r.flag || '🌍',
      total:       safeNum(r.total),
      success:     safeNum(r.success),
      failed:      safeNum(r.failed),
      volume:      safeNum(r.volume),
      successRate: safeNum(r.total) > 0 ? Math.round((safeNum(r.success) / safeNum(r.total)) * 100) : 0,
    }));

    // overall
    const overall = byCountry.reduce(
      (acc, c) => { acc.total += c.total; acc.success += c.success; acc.volume += c.volume; return acc; },
      { total: 0, success: 0, volume: 0 }
    );

    // by method
    const methodRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         method,
         COUNT(*)::int AS total,
         COUNT(CASE WHEN status='SUCCESS' THEN 1 END)::int AS success
       FROM transactions
       WHERE "merchantId"=$1 AND "createdAt">=$2
       GROUP BY method ORDER BY total DESC`,
      merchantId, since
    );

    const byMethod = methodRows.map(r => ({
      method:      r.method,
      total:       safeNum(r.total),
      success:     safeNum(r.success),
      successRate: safeNum(r.total) > 0 ? Math.round((safeNum(r.success) / safeNum(r.total)) * 100) : 0,
    }));

    res.json({
      success: true,
      data: {
        range,
        overall: {
          total:       overall.total,
          success:     overall.success,
          volume:      overall.volume,
          successRate: overall.total > 0 ? Math.round((overall.success / overall.total) * 100) : 0,
        },
        byCountry,
        byMethod,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 19. CUSTOMER ANALYTICS — CLV + segmentation
// GET /api/analytics/customers?range=30d|90d|365d
// ─────────────────────────────────────────────────────────────────────────────
export async function getCustomerAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const range = (req.query.range as string) || '90d';
    const days = range === '365d' ? 365 : range === '90d' ? 90 : 30;
    const since = dateFrom(days);

    const [segments, clvRows, cohortRows, topRows] = await Promise.all([
      // Segment counts
      prisma.$queryRawUnsafe<any[]>(
        `SELECT
           CASE
             WHEN "totalSpent" >= 5000 AND "totalOrders" >= 10 THEN 'VIP'
             WHEN "lastSeenAt" >= $2 AND "totalOrders" >= 3    THEN 'loyal'
             WHEN "totalOrders" = 1                            THEN 'new'
             WHEN "lastSeenAt" < $3 AND "totalOrders" >= 2    THEN 'at_risk'
             WHEN "lastSeenAt" < $4                           THEN 'lost'
             ELSE 'active'
           END AS segment,
           COUNT(*)::int AS cnt,
           COALESCE(AVG("totalSpent"),0)::float AS avg_spent
         FROM customers
         WHERE "merchantId"=$1
         GROUP BY segment`,
        merchantId,
        dateFrom(30),
        dateFrom(45),
        dateFrom(90)
      ),
      // CLV calculation
      prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COALESCE(AVG("totalSpent"),0)::float          AS avg_ltv,
           COALESCE(MAX("totalSpent"),0)::float          AS max_ltv,
           COALESCE(AVG("avgOrderValue"),0)::float       AS avg_order_value,
           COALESCE(AVG("totalOrders"),0)::float         AS avg_orders,
           COUNT(*)::int                                 AS total_customers,
           COUNT(CASE WHEN "createdAt">=$2 THEN 1 END)::int AS new_this_period
         FROM customers WHERE "merchantId"=$1`,
        merchantId, since
      ),
      // Monthly cohort (new customers per month)
      prisma.$queryRawUnsafe<any[]>(
        `SELECT TO_CHAR("createdAt",'YYYY-MM') AS month, COUNT(*)::int AS cnt
         FROM customers
         WHERE "merchantId"=$1 AND "createdAt">=NOW()-INTERVAL '12 months'
         GROUP BY month ORDER BY month ASC`,
        merchantId
      ),
      // Top 5 by spend
      prisma.$queryRawUnsafe<any[]>(
        `SELECT name, "totalSpent"::float, "totalOrders", "avgOrderValue"::float, "lastSeenAt"
         FROM customers WHERE "merchantId"=$1
         ORDER BY "totalSpent" DESC LIMIT 5`,
        merchantId
      ),
    ]);

    const clv = clvRows[0];
    const segMap: Record<string, any> = {};
    for (const s of segments) segMap[s.segment] = { count: s.cnt, avgSpent: Math.round(s.avg_spent) };

    res.json({
      success: true,
      data: {
        range,
        clv: {
          avgLTV:        Math.round(safeNum(clv.avg_ltv)),
          maxLTV:        Math.round(safeNum(clv.max_ltv)),
          avgOrderValue: Math.round(safeNum(clv.avg_order_value)),
          avgOrders:     Math.round(safeNum(clv.avg_orders) * 10) / 10,
          totalCustomers: safeNum(clv.total_customers),
          newThisPeriod:  safeNum(clv.new_this_period),
        },
        segments: segMap,
        cohort: cohortRows.map(r => ({ month: r.month, count: r.cnt })),
        topCustomers: topRows.map(r => ({
          name:          r.name,
          totalSpent:    safeNum(r.totalSpent),
          totalOrders:   r.totalOrders,
          avgOrderValue: Math.round(safeNum(r.avgOrderValue)),
          lastSeenAt:    r.lastSeenAt,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 20. SMART INSIGHTS (AI-style rule-based)
// GET /api/analytics/insights
// ─────────────────────────────────────────────────────────────────────────────
export async function getSmartInsights(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;

    const [txRows, custRows, fraudRows, settlementRows] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(CASE WHEN status='SUCCESS' THEN 1 END)::int AS success,
           COUNT(CASE WHEN status='FAILED'  THEN 1 END)::int AS failed,
           COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS volume,
           COUNT(CASE WHEN "createdAt">=NOW()-INTERVAL '24h' THEN 1 END)::int AS today
         FROM transactions WHERE "merchantId"=$1 AND "createdAt">=NOW()-INTERVAL '30 days'`,
        merchantId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(CASE WHEN "lastSeenAt"<NOW()-INTERVAL '45 days' THEN 1 END)::int AS at_risk
         FROM customers WHERE "merchantId"=$1`,
        merchantId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS high_risk
         FROM fraud_events
         WHERE "merchantId"=$1 AND "riskLevel" IN ('HIGH','CRITICAL') AND "createdAt">=NOW()-INTERVAL '7 days'`,
        merchantId
      ),
      prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS pending FROM settlements WHERE "merchantId"=$1 AND status='SCHEDULED'`,
        merchantId
      ),
    ]);

    const tx   = txRows[0];
    const cust = custRows[0];
    const fr   = fraudRows[0];
    const st   = settlementRows[0];

    const successRate = tx.total > 0 ? Math.round((tx.success / tx.total) * 100) : 0;
    const insights: any[] = [];

    if (successRate < 70) {
      insights.push({
        id: 'low_success_rate',
        priority: 'critical',
        icon: '🚨',
        titleAr: 'معدل نجاح منخفض',
        descAr: `معدل النجاح ${successRate}% أقل من المعدل المقبول 70%. راجع إعدادات البوابة.`,
        action: 'gateway-routing',
        metric: successRate,
      });
    } else if (successRate < 85) {
      insights.push({
        id: 'medium_success_rate',
        priority: 'high',
        icon: '⚠️',
        titleAr: 'معدل النجاح يحتاج تحسين',
        descAr: `معدل النجاح ${successRate}%. تفعيل Smart Retry يمكن أن يرفعه.`,
        action: 'cross-retry',
        metric: successRate,
      });
    }

    if (safeNum(cust.at_risk) > 0) {
      insights.push({
        id: 'at_risk_customers',
        priority: 'high',
        icon: '👥',
        titleAr: `${cust.at_risk} عميل في خطر الانقطاع`,
        descAr: 'لم يتسوقوا منذ أكثر من 45 يوم. ابعث لهم عرضاً خاصاً.',
        action: 'customers',
        metric: cust.at_risk,
      });
    }

    if (safeNum(fr.high_risk) > 0) {
      insights.push({
        id: 'fraud_alerts',
        priority: safeNum(fr.high_risk) > 5 ? 'critical' : 'high',
        icon: '🛡️',
        titleAr: `${fr.high_risk} تنبيه احتيال هذا الأسبوع`,
        descAr: 'مخاطر عالية تم رصدها. راجع قواعد الكشف عن الاحتيال.',
        action: 'fraud-detection',
        metric: fr.high_risk,
      });
    }

    if (safeNum(st.pending) >= 3) {
      insights.push({
        id: 'pending_settlements',
        priority: 'medium',
        icon: '💳',
        titleAr: `${st.pending} تسوية معلقة`,
        descAr: 'تسويات مجدولة تنتظر المعالجة.',
        action: 'settlements',
        metric: st.pending,
      });
    }

    if (tx.today === 0) {
      insights.push({
        id: 'no_transactions_today',
        priority: 'medium',
        icon: '📉',
        titleAr: 'لا معاملات اليوم',
        descAr: 'لم تسجَّل أي معاملة اليوم. تأكد من عمل الـ Integration.',
        action: 'transactions',
        metric: 0,
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: 'all_good',
        priority: 'low',
        icon: '✅',
        titleAr: 'كل شيء يعمل بشكل ممتاز',
        descAr: `معدل نجاح ${successRate}% — لا توصيات فورية.`,
        action: null,
        metric: successRate,
      });
    }

    res.json({
      success: true,
      data: {
        insights: insights.sort((a, b) => {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
          return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
        }),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 21. PREDICTIVE ANALYTICS — revenue forecast
// GET /api/analytics/forecast?months=3
// ─────────────────────────────────────────────────────────────────────────────
export async function getForecast(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const months = Math.min(6, Math.max(1, parseInt((req.query.months as string) || '3', 10)));

    // historical monthly data — last 6 months
    const histRows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         TO_CHAR("createdAt",'YYYY-MM') AS month,
         COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS volume,
         COUNT(*)::int AS tx_count,
         COUNT(CASE WHEN status='SUCCESS' THEN 1 END)::int AS success_count
       FROM transactions
       WHERE "merchantId"=$1 AND "createdAt">=NOW()-INTERVAL '6 months'
       GROUP BY month ORDER BY month ASC`,
      merchantId
    );

    if (histRows.length === 0) {
      res.json({ success: true, data: { historical: [], forecast: [], message: 'بيانات غير كافية للتنبؤ' } });
      return;
    }

    const volumes = histRows.map(r => safeNum(r.volume));
    const avgGrowth = volumes.length >= 2
      ? volumes.slice(1).reduce((sum, v, i) => {
          const prev = volumes[i];
          return sum + (prev > 0 ? (v - prev) / prev : 0);
        }, 0) / (volumes.length - 1)
      : 0.05;

    const lastVol  = volumes[volumes.length - 1] || 0;
    const lastDate = new Date(histRows[histRows.length - 1].month + '-01');

    const forecast = Array.from({ length: months }, (_, i) => {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + i + 1);
      const month = d.toISOString().slice(0, 7);
      const predicted = Math.round(lastVol * Math.pow(1 + avgGrowth, i + 1));
      const lower  = Math.round(predicted * 0.85);
      const upper  = Math.round(predicted * 1.15);
      return { month, predicted, lower, upper, growthRate: Math.round(avgGrowth * 100) };
    });

    res.json({
      success: true,
      data: {
        historical: histRows.map(r => ({
          month:   r.month,
          volume:  safeNum(r.volume),
          txCount: r.tx_count,
          successCount: r.success_count,
        })),
        forecast,
        avgMonthlyGrowth: Math.round(avgGrowth * 100),
        confidence: histRows.length >= 4 ? 'high' : histRows.length >= 2 ? 'medium' : 'low',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 22. ALERTS SYSTEM — drop alerts
// GET  /api/analytics/alerts
// POST /api/analytics/alerts        — create alert rule
// PUT  /api/analytics/alerts/:id    — update
// DELETE /api/analytics/alerts/:id  — delete
// POST /api/analytics/alerts/check  — trigger check now
// ─────────────────────────────────────────────────────────────────────────────

export async function getAlerts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM analytics_alerts WHERE "merchantId"=$1 ORDER BY "createdAt" DESC`,
      merchantId
    );

    // also get recent triggered history
    const history = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM analytics_alert_events
       WHERE "merchantId"=$1
       ORDER BY "triggeredAt" DESC LIMIT 20`,
      merchantId
    );

    res.json({ success: true, data: { alerts: rows, history } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function createAlert(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { name, metric, operator, threshold, windowMinutes, isActive } = req.body;

    if (!name || !metric || !operator || threshold === undefined) {
      res.status(400).json({ success: false, error: 'name, metric, operator, threshold مطلوبة' });
      return;
    }

    const validMetrics  = ['success_rate', 'transaction_count', 'volume', 'failed_count', 'fraud_score'];
    const validOperators = ['lt', 'gt', 'lte', 'gte'];
    if (!validMetrics.includes(metric))   { res.status(400).json({ success: false, error: 'metric غير صالح' }); return; }
    if (!validOperators.includes(operator)) { res.status(400).json({ success: false, error: 'operator غير صالح' }); return; }

    await prisma.$executeRawUnsafe(
      `INSERT INTO analytics_alerts
         ("id","merchantId","name","metric","operator","threshold","windowMinutes","isActive","createdAt","updatedAt")
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      merchantId, name, metric, operator, Number(threshold), Number(windowMinutes || 60), Boolean(isActive ?? true)
    );

    const created = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM analytics_alerts WHERE "merchantId"=$1 ORDER BY "createdAt" DESC LIMIT 1`,
      merchantId
    );

    res.status(201).json({ success: true, data: { alert: created[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateAlert(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;
    const { name, threshold, isActive, windowMinutes } = req.body;

    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM analytics_alerts WHERE id=$1 AND "merchantId"=$2`,
      id, merchantId
    );
    if (existing.length === 0) { res.status(404).json({ success: false, error: 'تنبيه غير موجود' }); return; }

    const fields: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (name            !== undefined) { fields.push(`"name"=$${idx++}`);          vals.push(name); }
    if (threshold       !== undefined) { fields.push(`"threshold"=$${idx++}`);     vals.push(Number(threshold)); }
    if (isActive        !== undefined) { fields.push(`"isActive"=$${idx++}`);      vals.push(Boolean(isActive)); }
    if (windowMinutes   !== undefined) { fields.push(`"windowMinutes"=$${idx++}`); vals.push(Number(windowMinutes)); }

    if (fields.length === 0) { res.status(400).json({ success: false, error: 'لا حقول للتحديث' }); return; }

    fields.push(`"updatedAt"=NOW()`);
    vals.push(id, merchantId);

    await prisma.$executeRawUnsafe(
      `UPDATE analytics_alerts SET ${fields.join(',')} WHERE id=$${idx} AND "merchantId"=$${idx + 1}`,
      ...vals
    );

    const updated = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM analytics_alerts WHERE id=$1`,
      id
    );

    res.json({ success: true, data: { alert: updated[0] } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function deleteAlert(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;
    const { id } = req.params;

    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM analytics_alerts WHERE id=$1 AND "merchantId"=$2`,
      id, merchantId
    );
    if (existing.length === 0) { res.status(404).json({ success: false, error: 'تنبيه غير موجود' }); return; }

    await prisma.$executeRawUnsafe(
      `DELETE FROM analytics_alerts WHERE id=$1 AND "merchantId"=$2`,
      id, merchantId
    );

    res.json({ success: true, message: 'تم حذف التنبيه' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function checkAlerts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const merchantId = req.merchant.id;

    const alertRules = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM analytics_alerts WHERE "merchantId"=$1 AND "isActive"=true`,
      merchantId
    );

    if (alertRules.length === 0) {
      res.json({ success: true, data: { triggered: [], checked: 0 } });
      return;
    }

    const triggered: any[] = [];

    for (const rule of alertRules) {
      const windowMins = rule.windowMinutes || 60;
      const since = new Date(Date.now() - windowMins * 60 * 1000);

      let currentValue = 0;

      if (rule.metric === 'success_rate') {
        const r = await prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS total, COUNT(CASE WHEN status='SUCCESS' THEN 1 END)::int AS s
           FROM transactions WHERE "merchantId"=$1 AND "createdAt">=$2`,
          merchantId, since
        );
        currentValue = r[0].total > 0 ? Math.round((r[0].s / r[0].total) * 100) : 100;

      } else if (rule.metric === 'transaction_count') {
        const r = await prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS cnt FROM transactions WHERE "merchantId"=$1 AND "createdAt">=$2`,
          merchantId, since
        );
        currentValue = r[0].cnt;

      } else if (rule.metric === 'volume') {
        const r = await prisma.$queryRawUnsafe<any[]>(
          `SELECT COALESCE(SUM(CASE WHEN status='SUCCESS' THEN amount ELSE 0 END),0)::float AS vol
           FROM transactions WHERE "merchantId"=$1 AND "createdAt">=$2`,
          merchantId, since
        );
        currentValue = safeNum(r[0].vol);

      } else if (rule.metric === 'failed_count') {
        const r = await prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS cnt FROM transactions WHERE "merchantId"=$1 AND status='FAILED' AND "createdAt">=$2`,
          merchantId, since
        );
        currentValue = r[0].cnt;

      } else if (rule.metric === 'fraud_score') {
        const r = await prisma.$queryRawUnsafe<any[]>(
          `SELECT COUNT(*)::int AS cnt FROM fraud_events
           WHERE "merchantId"=$1 AND "riskLevel" IN ('HIGH','CRITICAL') AND "createdAt">=$2`,
          merchantId, since
        );
        currentValue = r[0].cnt;
      }

      const th = Number(rule.threshold);
      let isTriggered = false;
      if (rule.operator === 'lt'  && currentValue <  th) isTriggered = true;
      if (rule.operator === 'lte' && currentValue <= th) isTriggered = true;
      if (rule.operator === 'gt'  && currentValue >  th) isTriggered = true;
      if (rule.operator === 'gte' && currentValue >= th) isTriggered = true;

      if (isTriggered) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO analytics_alert_events
             ("id","merchantId","alertId","alertName","metric","operator","threshold","currentValue","triggeredAt")
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,NOW())`,
          merchantId, rule.id, rule.name, rule.metric, rule.operator, th, currentValue
        );
        triggered.push({ alertId: rule.id, name: rule.name, metric: rule.metric, threshold: th, currentValue });
      }
    }

    res.json({ success: true, data: { triggered, checked: alertRules.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
