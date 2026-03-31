// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Notifications Service
// ─────────────────────────────────────────────────────────────

import { prisma } from "../config/database";

const notifSelect = {
  id: true,
  title: true,
  body: true,
  type: true,
  isRead: true,
  data: true,
  createdAt: true,
};

export const notificationsService = {
  async list(merchantId: string, pagination: { skip: number; limit: number }) {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { merchantId },
        select: notifSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.notification.count({ where: { merchantId } }),
    ]);
    return { data: notifications, total };
  },

  async markRead(merchantId: string, id: string) {
    const n = await prisma.notification.findFirst({ where: { id, merchantId } });
    if (!n) return null;
    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
      select: notifSelect,
    });
  },

  async markAllRead(merchantId: string) {
    const result = await prisma.notification.updateMany({
      where: { merchantId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  },

  async unreadCount(merchantId: string) {
    const count = await prisma.notification.count({
      where: { merchantId, isRead: false },
    });
    return { count };
  },
};
