// src/controllers/realtimeController.ts
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { EventType } from "@prisma/client";

// In-memory SSE client registry: merchantId → Set of Response streams
const clients = new Map<string, Set<Response>>();

// ─── Helper: emit event to DB + push to live SSE clients ─────
export const emitEvent = async (
  merchantId: string,
  eventType: EventType,
  payload: object
) => {
  // Persist to DB
  await prisma.eventLog.create({
    data: { merchantId, eventType, payload, delivered: false },
  });

  // Push to any connected SSE clients for this merchant
  const merchantClients = clients.get(merchantId);
  if (merchantClients && merchantClients.size > 0) {
    const data = JSON.stringify({ type: eventType, payload, ts: new Date().toISOString() });
    for (const clientRes of merchantClients) {
      try {
        clientRes.write(`data: ${data}\n\n`);
      } catch {
        // client disconnected mid-write
      }
    }
    // Mark as delivered
    await prisma.eventLog.updateMany({
      where: { merchantId, eventType, delivered: false },
      data: { delivered: true },
    });
  }
};

// ─── GET /api/realtime/events — SSE stream ────────────────────
export const streamEvents = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Register client
  if (!clients.has(merchantId)) {
    clients.set(merchantId, new Set());
  }
  clients.get(merchantId)!.add(res);

  // Send any undelivered past events immediately
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

  // Heartbeat every 25s to keep connection alive through Railway's 30s timeout
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.get(merchantId)?.delete(res);
    if (clients.get(merchantId)?.size === 0) {
      clients.delete(merchantId);
    }
  });
};

// ─── GET /api/realtime/history — last N events ────────────────
export const getEventHistory = async (req: Request, res: Response) => {
  const merchantId = (req as any).merchant?.id;
  const { limit = "20", eventType } = req.query;

  const where: any = { merchantId };
  if (eventType) where.eventType = eventType;

  const events = await prisma.eventLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: parseInt(limit as string),
  });

  return res.json({ events });
};
