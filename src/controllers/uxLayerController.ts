import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

// ─── Feature 46: Language Preferences ───────────────────────

export const getLangPrefs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM language_preferences WHERE merchant_id = $1 LIMIT 1`,
      merchantId
    ) as any[];
    if (rows.length === 0) {
      const newRows = await prisma.$queryRawUnsafe(
        `INSERT INTO language_preferences (merchant_id) VALUES ($1) RETURNING *`,
        merchantId
      ) as any[];
      res.json({ success: true, data: newRows[0] });
      return;
    }
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get language preferences" });
    return;
  }
};

export const updateLangPrefs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { language, rtl, date_format, currency_format } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO language_preferences (merchant_id, language, rtl, date_format, currency_format)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id) DO UPDATE
       SET language        = COALESCE($2, language_preferences.language),
           rtl             = COALESCE($3, language_preferences.rtl),
           date_format     = COALESCE($4, language_preferences.date_format),
           currency_format = COALESCE($5, language_preferences.currency_format),
           updated_at      = NOW()
       RETURNING *`,
      merchantId,
      language ?? null,
      rtl ?? null,
      date_format ?? null,
      currency_format ?? null
    ) as any[];
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update language preferences" });
    return;
  }
};

// ─── Feature 47: Micro-interactions ─────────────────────────

export const logInteraction = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { event_type, screen_key, metadata } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO interaction_events (merchant_id, event_type, screen_key, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      merchantId,
      event_type,
      screen_key ?? null,
      JSON.stringify(metadata || {})
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to log interaction" });
    return;
  }
};

export const getInteractionStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT event_type, screen_key, COUNT(*)::int AS count
       FROM interaction_events
       WHERE merchant_id = $1 AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY event_type, screen_key
       ORDER BY count DESC
       LIMIT 20`,
      merchantId
    ) as any[];
    res.json({ success: true, data: rows });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get interaction stats" });
    return;
  }
};

// ─── Feature 48: Embedded Help ───────────────────────────────

export const logHelpSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { query, results_count, clicked_article } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO help_searches (merchant_id, query, results_count, clicked_article)
       VALUES ($1, $2, $3, $4)`,
      merchantId,
      query,
      Number(results_count ?? 0),
      clicked_article ?? null
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to log help search" });
    return;
  }
};

export const getTopHelpSearches = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT query, COUNT(*)::int AS count, AVG(results_count)::int AS avg_results
       FROM help_searches
       WHERE merchant_id = $1
       GROUP BY query
       ORDER BY count DESC
       LIMIT 10`,
      merchantId
    ) as any[];
    res.json({ success: true, data: rows });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get help searches" });
    return;
  }
};

// ─── Feature 49: Design Preferences ─────────────────────────

export const getDesignPrefs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM design_preferences WHERE merchant_id = $1 LIMIT 1`,
      merchantId
    ) as any[];
    if (rows.length === 0) {
      const newRows = await prisma.$queryRawUnsafe(
        `INSERT INTO design_preferences (merchant_id) VALUES ($1) RETURNING *`,
        merchantId
      ) as any[];
      res.json({ success: true, data: newRows[0] });
      return;
    }
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get design preferences" });
    return;
  }
};

export const updateDesignPrefs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { accent_color, font_size, border_radius } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO design_preferences (merchant_id, accent_color, font_size, border_radius)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (merchant_id) DO UPDATE
       SET accent_color  = COALESCE($2, design_preferences.accent_color),
           font_size     = COALESCE($3, design_preferences.font_size),
           border_radius = COALESCE($4, design_preferences.border_radius),
           updated_at    = NOW()
       RETURNING *`,
      merchantId,
      accent_color ?? null,
      font_size ?? null,
      border_radius ?? null
    ) as any[];
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update design preferences" });
    return;
  }
};

// ─── Feature 50: Accessibility ───────────────────────────────

export const getA11yPrefs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM accessibility_preferences WHERE merchant_id = $1 LIMIT 1`,
      merchantId
    ) as any[];
    if (rows.length === 0) {
      const newRows = await prisma.$queryRawUnsafe(
        `INSERT INTO accessibility_preferences (merchant_id) VALUES ($1) RETURNING *`,
        merchantId
      ) as any[];
      res.json({ success: true, data: newRows[0] });
      return;
    }
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get accessibility preferences" });
    return;
  }
};

export const updateA11yPrefs = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { high_contrast, large_text, reduce_motion, screen_reader_hints } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO accessibility_preferences (merchant_id, high_contrast, large_text, reduce_motion, screen_reader_hints)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id) DO UPDATE
       SET high_contrast        = COALESCE($2, accessibility_preferences.high_contrast),
           large_text           = COALESCE($3, accessibility_preferences.large_text),
           reduce_motion        = COALESCE($4, accessibility_preferences.reduce_motion),
           screen_reader_hints  = COALESCE($5, accessibility_preferences.screen_reader_hints),
           updated_at           = NOW()
       RETURNING *`,
      merchantId,
      high_contrast ?? null,
      large_text ?? null,
      reduce_motion ?? null,
      screen_reader_hints ?? null
    ) as any[];
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update accessibility preferences" });
    return;
  }
};
