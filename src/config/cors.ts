// ─────────────────────────────────────────────────────────────
// Zyrix Backend — CORS Configuration
// ─────────────────────────────────────────────────────────────

import cors from "cors";
import { env } from "./env";

export const corsOptions = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept-Language"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400, // 24 hours preflight cache
});
