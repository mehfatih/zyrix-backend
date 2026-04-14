// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Cash Flow Forecast Controller
// Color: #0891B2
// ─────────────────────────────────────────────────────────────
import { Response, NextFunction } from "express"
import { AuthenticatedRequest } from "../types"
import { prisma } from "../config/database"
import { GoogleGenerativeAI } from "@google/generative-ai"

// ─── Types ────────────────────────────────────────────────────

interface EntryRow {
  id: string
  merchant_id: string
  entry_date: string
  category: string
  label: string
  amount: number
  type: string
  currency: string
  is_recurring: boolean
  recur_interval: string | null
  notes: string | null
  created_at: string
}

interface ForecastRow {
  id: string
  merchant_id: string
  forecast_month: number
  forecast_year: number
  projected_in: number
  projected_out: number
  projected_net: number
  actual_in: number | null
  actual_out: number | null
  actual_net: number | null
  ai_summary: string | null
  currency: string
  generated_at: string
}

interface SummaryRow {
  period_month: number
  period_year: number
  total_in: number
  total_out: number
  net: number
  entry_count: number
}

// ─── Controller ──────────────────────────────────────────────

export const cashFlowController = {

  // ── List Entries ──────────────────────────────────────────
  async listEntries(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { month, year, type } = req.query as Record<string, string>
      const merchantId = req.merchant.id

      let whereClause = `WHERE merchant_id = $1`
      const params: unknown[] = [merchantId]
      let idx = 2

      if (month && year) {
        whereClause += ` AND EXTRACT(MONTH FROM entry_date) = $${idx++} AND EXTRACT(YEAR FROM entry_date) = $${idx++}`
        params.push(parseInt(month), parseInt(year))
      } else if (year) {
        whereClause += ` AND EXTRACT(YEAR FROM entry_date) = $${idx++}`
        params.push(parseInt(year))
      }

      if (type) {
        whereClause += ` AND type = $${idx++}`
        params.push(type.toUpperCase())
      }

      const rows = await prisma.$queryRawUnsafe<EntryRow[]>(
        `SELECT * FROM cash_flow_entries ${whereClause} ORDER BY entry_date DESC`,
        ...params
      )

      res.json({
        success: true,
        data: rows.map(r => ({
          id: r.id,
          entryDate: r.entry_date,
          category: r.category,
          label: r.label,
          amount: Number(r.amount),
          type: r.type,
          currency: r.currency,
          isRecurring: r.is_recurring,
          recurInterval: r.recur_interval,
          notes: r.notes,
          createdAt: r.created_at,
        })),
      })
    } catch (err) { next(err) }
  },

  // ── Create Entry ──────────────────────────────────────────
  async createEntry(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { entryDate, category, label, amount, type, currency = "SAR", isRecurring = false, recurInterval, notes } = req.body as {
        entryDate: string; category: string; label: string; amount: number
        type: string; currency?: string; isRecurring?: boolean; recurInterval?: string; notes?: string
      }

      if (!entryDate || !category || !label || amount === undefined || !type) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "entryDate, category, label, amount, type required" } })
        return
      }

      if (!["INFLOW", "OUTFLOW"].includes(type.toUpperCase())) {
        res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "type must be INFLOW or OUTFLOW" } })
        return
      }

      const rows = await prisma.$queryRawUnsafe<EntryRow[]>(
        `INSERT INTO cash_flow_entries (merchant_id, entry_date, category, label, amount, type, currency, is_recurring, recur_interval, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        req.merchant.id, entryDate, category, label, Number(amount),
        type.toUpperCase(), currency.toUpperCase(), isRecurring, recurInterval ?? null, notes ?? null
      )

      res.json({ success: true, data: rows[0] })
    } catch (err) { next(err) }
  },

  // ── Delete Entry ──────────────────────────────────────────
  async deleteEntry(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      await prisma.$executeRawUnsafe(
        `DELETE FROM cash_flow_entries WHERE id = $1 AND merchant_id = $2`,
        id, req.merchant.id
      )
      res.json({ success: true, data: { deleted: true } })
    } catch (err) { next(err) }
  },

  // ── Monthly Summary ───────────────────────────────────────
  async getMonthlySummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear()

      const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(
        `SELECT
           EXTRACT(MONTH FROM entry_date)::int AS period_month,
           EXTRACT(YEAR  FROM entry_date)::int AS period_year,
           COALESCE(SUM(CASE WHEN type = 'INFLOW'  THEN amount ELSE 0 END)::float, 0) AS total_in,
           COALESCE(SUM(CASE WHEN type = 'OUTFLOW' THEN amount ELSE 0 END)::float, 0) AS total_out,
           COALESCE(SUM(CASE WHEN type = 'INFLOW'  THEN amount ELSE -amount END)::float, 0) AS net,
           COUNT(*)::int AS entry_count
         FROM cash_flow_entries
         WHERE merchant_id = $1 AND EXTRACT(YEAR FROM entry_date) = $2
         GROUP BY period_month, period_year
         ORDER BY period_month`,
        req.merchant.id, year
      )

      const totalIn  = rows.reduce((s, r) => s + Number(r.total_in), 0)
      const totalOut = rows.reduce((s, r) => s + Number(r.total_out), 0)

      res.json({
        success: true,
        data: {
          year,
          totalIn:   Math.round(totalIn  * 100) / 100,
          totalOut:  Math.round(totalOut * 100) / 100,
          netFlow:   Math.round((totalIn - totalOut) * 100) / 100,
          burnRate:  rows.length > 0 ? Math.round((totalOut / rows.length) * 100) / 100 : 0,
          byMonth:   rows.map(r => ({
            month:      Number(r.period_month),
            year:       Number(r.period_year),
            totalIn:    Math.round(Number(r.total_in)  * 100) / 100,
            totalOut:   Math.round(Number(r.total_out) * 100) / 100,
            net:        Math.round(Number(r.net)       * 100) / 100,
            entryCount: Number(r.entry_count),
          })),
        },
      })
    } catch (err) { next(err) }
  },

  // ── Generate AI Forecast ──────────────────────────────────
  async generateForecast(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { months = 3, currency = "SAR" } = req.body as { months?: number; currency?: string }
      const merchantId = req.merchant.id

      // جلب آخر 6 أشهر من البيانات الفعلية
      const historical = await prisma.$queryRawUnsafe<SummaryRow[]>(
        `SELECT
           EXTRACT(MONTH FROM entry_date)::int AS period_month,
           EXTRACT(YEAR  FROM entry_date)::int AS period_year,
           COALESCE(SUM(CASE WHEN type = 'INFLOW'  THEN amount ELSE 0 END)::float, 0) AS total_in,
           COALESCE(SUM(CASE WHEN type = 'OUTFLOW' THEN amount ELSE 0 END)::float, 0) AS total_out,
           COALESCE(SUM(CASE WHEN type = 'INFLOW'  THEN amount ELSE -amount END)::float, 0) AS net,
           COUNT(*)::int AS entry_count
         FROM cash_flow_entries
         WHERE merchant_id = $1
         GROUP BY period_month, period_year
         ORDER BY period_year DESC, period_month DESC
         LIMIT 6`,
        merchantId
      )

      // حساب المتوسطات
      const avgIn  = historical.length > 0 ? historical.reduce((s, r) => s + Number(r.total_in),  0) / historical.length : 0
      const avgOut = historical.length > 0 ? historical.reduce((s, r) => s + Number(r.total_out), 0) / historical.length : 0

      // توليد التوقعات
      const forecasts = []
      const now = new Date()

      for (let i = 1; i <= Math.min(months, 6); i++) {
        const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const fm = forecastDate.getMonth() + 1
        const fy = forecastDate.getFullYear()

        // تطبيق نمو بسيط 2% شهرياً
        const growth    = Math.pow(1.02, i)
        const projIn    = Math.round(avgIn  * growth * 100) / 100
        const projOut   = Math.round(avgOut * 100) / 100
        const projNet   = Math.round((projIn - projOut) * 100) / 100

        await prisma.$executeRawUnsafe(
          `INSERT INTO cash_flow_forecasts (merchant_id, forecast_month, forecast_year, projected_in, projected_out, projected_net, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (merchant_id, forecast_month, forecast_year)
           DO UPDATE SET projected_in = $4, projected_out = $5, projected_net = $6, generated_at = NOW()`,
          merchantId, fm, fy, projIn, projOut, projNet, currency.toUpperCase()
        )

        forecasts.push({ month: fm, year: fy, projectedIn: projIn, projectedOut: projOut, projectedNet: projNet })
      }

      // AI Summary via Gemini
      let aiSummary = ""
      try {
        const apiKey = process.env.GEMINI_API_KEY
        if (apiKey) {
          const genAI  = new GoogleGenerativeAI(apiKey)
          const model  = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })
          const prompt = `أنت مستشار مالي خبير. بناءً على البيانات التالية لمتجر إلكتروني:
- متوسط الإيرادات الشهرية: ${avgIn.toFixed(0)} ${currency}
- متوسط المصروفات الشهرية: ${avgOut.toFixed(0)} ${currency}
- صافي التدفق الشهري: ${(avgIn - avgOut).toFixed(0)} ${currency}
- التوقعات للأشهر القادمة: ${forecasts.map(f => `${f.month}/${f.year}: صافي ${f.projectedNet}`).join(', ')}

اكتب تحليلاً مالياً موجزاً (3-4 جمل) باللغة العربية يتضمن: تقييم الوضع الحالي، توقعات التدفق النقدي، ونصيحة عملية واحدة.`
          const result  = await model.generateContent(prompt)
          aiSummary = result.response.text()
        }
      } catch (_aiErr) {
        aiSummary = `متوسط الإيرادات الشهرية ${avgIn.toFixed(0)} ${currency} مقابل مصروفات ${avgOut.toFixed(0)} ${currency}. التدفق النقدي الصافي ${(avgIn - avgOut).toFixed(0)} ${currency} شهرياً.`
      }

      res.json({
        success: true,
        data: {
          historical: historical.map(r => ({
            month: Number(r.period_month), year: Number(r.period_year),
            totalIn: Number(r.total_in), totalOut: Number(r.total_out), net: Number(r.net),
          })),
          forecasts,
          summary: {
            avgMonthlyIn:  Math.round(avgIn  * 100) / 100,
            avgMonthlyOut: Math.round(avgOut * 100) / 100,
            avgMonthlyNet: Math.round((avgIn - avgOut) * 100) / 100,
            burnRate:      Math.round(avgOut * 100) / 100,
            runway:        avgOut > 0 ? Math.round((avgIn / avgOut) * 10) / 10 : null,
          },
          aiSummary,
          currency: currency.toUpperCase(),
        },
      })
    } catch (err) { next(err) }
  },

  // ── Get Forecasts ─────────────────────────────────────────
  async getForecasts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear()

      const rows = await prisma.$queryRawUnsafe<ForecastRow[]>(
        `SELECT * FROM cash_flow_forecasts WHERE merchant_id = $1 AND forecast_year = $2 ORDER BY forecast_month`,
        req.merchant.id, year
      )

      res.json({
        success: true,
        data: rows.map(r => ({
          id: r.id,
          month: Number(r.forecast_month),
          year:  Number(r.forecast_year),
          projectedIn:  Number(r.projected_in),
          projectedOut: Number(r.projected_out),
          projectedNet: Number(r.projected_net),
          actualIn:  r.actual_in  !== null ? Number(r.actual_in)  : null,
          actualOut: r.actual_out !== null ? Number(r.actual_out) : null,
          actualNet: r.actual_net !== null ? Number(r.actual_net) : null,
          aiSummary: r.ai_summary,
          currency:  r.currency,
          generatedAt: r.generated_at,
        })),
      })
    } catch (err) { next(err) }
  },

  // ── Runway Calculator ─────────────────────────────────────
  async getRunway(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { currentBalance } = req.query as Record<string, string>
      const balance = parseFloat(currentBalance || "0")

      const rows = await prisma.$queryRawUnsafe<{ avg_out: number }[]>(
        `SELECT COALESCE(AVG(monthly_out)::float, 0) AS avg_out FROM (
           SELECT
             EXTRACT(MONTH FROM entry_date) AS m,
             EXTRACT(YEAR  FROM entry_date) AS y,
             SUM(amount)::float AS monthly_out
           FROM cash_flow_entries
           WHERE merchant_id = $1 AND type = 'OUTFLOW'
             AND entry_date >= NOW() - INTERVAL '3 months'
           GROUP BY m, y
         ) sub`,
        req.merchant.id
      )

      const avgMonthlyBurn = Number(rows[0]?.avg_out || 0)
      const runwayMonths   = avgMonthlyBurn > 0 ? Math.floor(balance / avgMonthlyBurn) : null

      res.json({
        success: true,
        data: {
          currentBalance:  balance,
          avgMonthlyBurn:  Math.round(avgMonthlyBurn * 100) / 100,
          runwayMonths,
          runwayDays:      runwayMonths !== null ? runwayMonths * 30 : null,
          status:          runwayMonths === null ? "no_data"
                         : runwayMonths >= 6   ? "healthy"
                         : runwayMonths >= 3   ? "warning"
                         : "critical",
        },
      })
    } catch (err) { next(err) }
  },
}
