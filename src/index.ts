// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Express Server Entry Point
// ─────────────────────────────────────────────────────────────

import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { corsOptions } from "./config/cors";
import { prisma } from "./config/database";
import { globalRateLimiter } from "./middleware/rateLimiter";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import merchantRoutes from "./routes/merchant";
import dashboardRoutes from "./routes/dashboard";
import transactionsRoutes from "./routes/transactions";
import balanceRoutes from "./routes/balance";
import analyticsRoutes from "./routes/analytics";
import settlementsRoutes from "./routes/settlements";
import disputesRoutes from "./routes/disputes";
import refundsRoutes from "./routes/refunds";
import notificationsRoutes from "./routes/notifications";
import invoicesRoutes from "./routes/invoices";
import expensesRoutes from "./routes/expenses";
import revenueGoalsRoutes from "./routes/revenueGoals";
import subscriptionsRoutes from "./routes/subscriptions";
import paymentLinksRoutes from "./routes/paymentLinks";
import transfersRoutes from "./routes/transfers";
import adminRoutes from "./routes/admin";

const app = express();

// ─── Security Middleware ──────────────────────────────────────

app.use(helmet());
app.use(corsOptions);
app.use(globalRateLimiter);

// ─── Body Parsing ─────────────────────────────────────────────

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Health Check ─────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "zyrix-backend",
      version: "1.0.0",
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── API Routes ───────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/merchant", merchantRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/balance", balanceRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/settlements", settlementsRoutes);
app.use("/api/disputes", disputesRoutes);
app.use("/api/refunds", refundsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/revenue-goals", revenueGoalsRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/payment-links", paymentLinksRoutes);
app.use("/api/transfers", transfersRoutes);
app.use("/api/admin", adminRoutes);

// ─── 404 & Error Handlers ─────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  app.listen(env.port, () => {
    console.log(`\n🚀 Zyrix Backend running on port ${env.port}`);
  });

  try {
    await prisma.$connect();
    console.log("✅ Database connected");
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⚠️  Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

bootstrap();
