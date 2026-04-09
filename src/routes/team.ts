// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Team Management Routes
// ─────────────────────────────────────────────────────────────

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
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  role: z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"]),
});

const updateSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

const acceptSchema = z.object({
  token: z.string().min(1, "Invite token is required"),
  name: z.string().min(1, "Name is required").max(100),
});

// ─── Routes ───────────────────────────────────────────────────

// GET /api/team — list all team members
router.get("/", authenticateToken, listTeamMembers);

// POST /api/team/invite — invite a new team member
router.post("/invite", authenticateToken, validate(inviteSchema), inviteTeamMember);

// PATCH /api/team/:memberId — update role or status
router.patch("/:memberId", authenticateToken, validate(updateSchema), updateTeamMember);

// DELETE /api/team/:memberId — remove team member
router.delete("/:memberId", authenticateToken, removeTeamMember);

// POST /api/team/accept — accept invite (no auth needed)
router.post("/accept", validate(acceptSchema), acceptInvite);

export default router;
