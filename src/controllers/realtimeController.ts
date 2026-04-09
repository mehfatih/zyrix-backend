// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Realtime SSE Controller
// ─────────────────────────────────────────────────────────────
import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { prisma } from "../config/database";
import { EventType } from "@prisma/client";

// In-memory SSE client registry
const clients = new Map<string, Set<Response>>();

// ─── Helper: emit event to DB + push to live clients ─────────
export async function emitEvent(
  merchantId: string,
  eventType: EventType,
  payload: object
): Promise<void> {
  await prisma.eventLog.create({
    data: { merchantId, eventType, payload, delivered: false },
  });

  const merchantClients = clients.get(merchantId);
  if (merchantClients && merchantClients.size > 0) {
    const data = JSON.stringify({
      type: eventType,
      payload,
      ts: new Date().toISOString(),
    });
    for (const clientRes of merchantClients) {
      try {
        clientRes.write(`data: ${data}\n\n`);
      } catch {
        // client disconnected
      }
    }
    await prisma.eventLog.updateMany({
      where: { merchantId, eventType, delivered: false },
      data: { delivered: true },
    });
  }
}

export const realtimeController = {
  async streamEvents(req: AuthenticatedRequest, res: Response, _next: NextFunction) {
    const merchantId = req.merchant.id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    if (!clients.has(merchantId)) {
      clients.set(merchantId, new Set());
    }
    clients.get(merchantId)!.add(res);

    // Send any missed undelivered events
    const missed = await prisma.eventLog.findMany({
      where: { merchantId, delivered: false },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    for (const event of missed) {
      const data = JSON.stringify({
        type: event.eventType,
        payload: event.payload,
        ts: event.createdAt.toISOString(),
      });
      res.write(`data: ${data}\n\n`);
    }

    if (missed.length > 0) {
      await prisma.eventLog.updateMany({
        where: { merchantId, delivered: false },
        data: { delivered: true },
      });
    }

    // Heartbeat every 25s to keep alive through Railway's 30s timeout
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      clients.get(merchantId)?.delete(res);
      if (clients.get(merchantId)?.size === 0) {
        clients.delete(merchantId);
      }
    });
  },

  async getEventHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const merchantId = req.merchant.id;
      const limit = parseInt((req.query.limit as string) || "20");
      const eventType = req.query.eventType as string | undefined;

      const where: any = { merchantId };
      if (eventType) where.eventType = eventType;

      const events = await prisma.eventLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      res.json({ success: true, data: { events } });
    } catch (err) {
      next(err);
    }
  },
};
