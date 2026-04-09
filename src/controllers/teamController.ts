// ─────────────────────────────────────────────────────────────
// Zyrix Backend — Team Management Controller
// ─────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import crypto from "crypto";

// ── GET /api/team ─────────────────────────────────────────────
export async function listTeamMembers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const merchantId = req.merchant!.id;

    const members = await prisma.teamMember.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        joinedAt: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: { members } });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/team/invite ─────────────────────────────────────
export async function inviteTeamMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const merchantId = req.merchant!.id;
    const { name, email, role } = req.body;

    // Check if member already exists
    const existing = await prisma.teamMember.findUnique({
      where: { merchantId_email: { merchantId, email } },
    });

    if (existing) {
      res.status(400).json({
        success: false,
        error: { code: "MEMBER_EXISTS", message: "This email is already a team member" },
      });
      return;
    }

    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString("hex");

    const member = await prisma.teamMember.create({
      data: {
        merchantId,
        name,
        email,
        role,
        status: "INVITED",
        inviteToken,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        inviteToken: true,
        createdAt: true,
      },
    });

    // TODO: Send invitation email with inviteToken
    // await emailService.sendInvite({ email, name, token: inviteToken, merchantId })

    res.status(201).json({
      success: true,
      data: {
        member,
        inviteLink: `https://app.zyrix.co/join?token=${inviteToken}`,
        message: "Invitation sent successfully",
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── PATCH /api/team/:memberId ─────────────────────────────────
export async function updateTeamMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const merchantId = req.merchant!.id;
    const { memberId } = req.params;
    const { role, status } = req.body;

    const existing = await prisma.teamMember.findFirst({
      where: { id: memberId, merchantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Team member not found" },
      });
      return;
    }

    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: {
        ...(role && { role }),
        ...(status && { status }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        joinedAt: true,
        updatedAt: true,
      },
    });

    res.json({ success: true, data: { member: updated } });
  } catch (err) {
    next(err);
  }
}

// ── DELETE /api/team/:memberId ────────────────────────────────
export async function removeTeamMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const merchantId = req.merchant!.id;
    const { memberId } = req.params;

    const existing = await prisma.teamMember.findFirst({
      where: { id: memberId, merchantId },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Team member not found" },
      });
      return;
    }

    await prisma.teamMember.delete({ where: { id: memberId } });

    res.json({ success: true, data: { message: "Team member removed successfully" } });
  } catch (err) {
    next(err);
  }
}

// ── POST /api/team/accept ─────────────────────────────────────
export async function acceptInvite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { token, name } = req.body;

    const member = await prisma.teamMember.findUnique({
      where: { inviteToken: token },
    });

    if (!member) {
      res.status(400).json({
        success: false,
        error: { code: "INVALID_TOKEN", message: "Invalid or expired invite token" },
      });
      return;
    }

    if (member.status !== "INVITED") {
      res.status(400).json({
        success: false,
        error: { code: "INVITE_USED", message: "This invite has already been used" },
      });
      return;
    }

    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data: {
        name,
        status: "ACTIVE",
        inviteToken: null,
        joinedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        merchantId: true,
        joinedAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        member: updated,
        message: "Invite accepted successfully",
      },
    });
  } catch (err) {
    next(err);
  }
}
