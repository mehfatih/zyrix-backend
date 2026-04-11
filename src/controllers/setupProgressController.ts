import { Request, Response } from "express";
import { prisma } from "../config/database";
import { AuthenticatedRequest } from "../types";

export const getSetupProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM setup_progress WHERE merchant_id = $1 LIMIT 1`,
      merchantId
    ) as any[];
    if (rows.length === 0) {
      const newRows = await prisma.$queryRawUnsafe(
        `INSERT INTO setup_progress (merchant_id) VALUES ($1) RETURNING *`,
        merchantId
      ) as any[];
      res.json({ success: true, data: newRows[0] });
      return;
    }
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get setup progress" });
    return;
  }
};

export const completeTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { taskKey } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO setup_progress (merchant_id, completed_tasks)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (merchant_id) DO UPDATE
       SET completed_tasks = (
         SELECT jsonb_agg(DISTINCT val)
         FROM jsonb_array_elements_text(
           setup_progress.completed_tasks || $2::jsonb
         ) AS val
       ),
       updated_at = NOW()
       RETURNING *`,
      merchantId,
      JSON.stringify([taskKey])
    ) as any[];
    const progress = rows[0];
    const completedCount = Array.isArray(progress.completed_tasks)
      ? progress.completed_tasks.length
      : 0;
    if (completedCount >= progress.total_tasks) {
      await prisma.$queryRawUnsafe(
        `UPDATE setup_progress SET is_completed = true, updated_at = NOW() WHERE merchant_id = $1`,
        merchantId
      );
      progress.is_completed = true;
    }
    res.json({ success: true, data: progress });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to complete task" });
    return;
  }
};

export const updateWizardStep = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { step } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO setup_progress (merchant_id, wizard_step)
       VALUES ($1, $2)
       ON CONFLICT (merchant_id) DO UPDATE
       SET wizard_step = $2, updated_at = NOW()
       RETURNING *`,
      merchantId,
      Number(step)
    ) as any[];
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update wizard step" });
    return;
  }
};

export const dismissSetup = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    await prisma.$queryRawUnsafe(
      `UPDATE setup_progress SET dismissed_at = NOW(), updated_at = NOW() WHERE merchant_id = $1`,
      merchantId
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to dismiss setup" });
    return;
  }
};

export const getUiPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ui_preferences WHERE merchant_id = $1 LIMIT 1`,
      merchantId
    ) as any[];
    if (rows.length === 0) {
      const newRows = await prisma.$queryRawUnsafe(
        `INSERT INTO ui_preferences (merchant_id) VALUES ($1) RETURNING *`,
        merchantId
      ) as any[];
      res.json({ success: true, data: newRows[0] });
      return;
    }
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get UI preferences" });
    return;
  }
};

export const updateUiPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { haptics_enabled, gesture_nav, offline_cache, compact_mode, theme } = req.body;
    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO ui_preferences (merchant_id, haptics_enabled, gesture_nav, offline_cache, compact_mode, theme)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (merchant_id) DO UPDATE
       SET haptics_enabled = COALESCE($2, ui_preferences.haptics_enabled),
           gesture_nav     = COALESCE($3, ui_preferences.gesture_nav),
           offline_cache   = COALESCE($4, ui_preferences.offline_cache),
           compact_mode    = COALESCE($5, ui_preferences.compact_mode),
           theme           = COALESCE($6, ui_preferences.theme),
           updated_at      = NOW()
       RETURNING *`,
      merchantId,
      haptics_enabled ?? null,
      gesture_nav ?? null,
      offline_cache ?? null,
      compact_mode ?? null,
      theme ?? null
    ) as any[];
    res.json({ success: true, data: rows[0] });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to update UI preferences" });
    return;
  }
};

export const logPerformance = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { screen_key, load_time_ms, cached } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO performance_logs (merchant_id, screen_key, load_time_ms, cached)
       VALUES ($1, $2, $3, $4)`,
      merchantId,
      screen_key,
      Number(load_time_ms),
      cached ?? false
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to log performance" });
    return;
  }
};

export const getPerformanceStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT screen_key,
              ROUND(AVG(load_time_ms))::int AS avg_ms,
              MIN(load_time_ms) AS min_ms,
              MAX(load_time_ms) AS max_ms,
              COUNT(*)::int AS total_loads,
              SUM(CASE WHEN cached THEN 1 ELSE 0 END)::int AS cached_loads
       FROM performance_logs
       WHERE merchant_id = $1
       GROUP BY screen_key
       ORDER BY avg_ms DESC`,
      merchantId
    ) as any[];
    res.json({ success: true, data: rows });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to get performance stats" });
    return;
  }
};

export const logEmptyStateAction = async (req: Request, res: Response): Promise<void> => {
  try {
    const merchantId = (req as AuthenticatedRequest).merchant!.id;
    const { screen_key, action_taken } = req.body;
    await prisma.$queryRawUnsafe(
      `INSERT INTO empty_state_actions (merchant_id, screen_key, action_taken) VALUES ($1, $2, $3)`,
      merchantId,
      screen_key,
      action_taken
    );
    res.json({ success: true });
    return;
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to log action" });
    return;
  }
};
