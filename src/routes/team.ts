// src/routes/team.ts
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validator";
import { authenticateToken } from "../middleware/auth";
import {
  listTeamMembers,
  inviteTeamMember,
  updateTeamMember,
  removeTeamMember,
  acceptInvite,
} from "../controllers/teamController";

const router = Router();

// ─── Zod Schemas ──────────────────────────────────────────────

const inviteSchema = z.object({
  name:  z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  role:  z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"]),
});

const updateSchema = z.object({
  role:   z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

const acceptSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  name:  z.string().min(1, "Name is required").max(100),
});

// ─── Routes ───────────────────────────────────────────────────

router.get("/",          authenticateToken as any, listTeamMembers                              as any);
router.post("/invite",   authenticateToken as any, validate(inviteSchema), inviteTeamMember     as any);
router.patch("/:memberId", authenticateToken as any, validate(updateSchema), updateTeamMember   as any);
router.delete("/:memberId", authenticateToken as any, removeTeamMember                         as any);
router.post("/accept",   validate(acceptSchema), acceptInvite                                   as any);

export default router;
