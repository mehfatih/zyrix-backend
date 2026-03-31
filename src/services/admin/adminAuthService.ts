import { prisma } from "../../config/database";
import { env } from "../../config/env";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const adminAuthService = {
  async login(email: string, password: string) {
    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin || !admin.isActive) return null;
    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) return null;
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const secret: jwt.Secret = env.adminJwt.secret as string;
    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      secret,
      { expiresIn: env.adminJwt.expiresIn as string }
    );
    return {
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    };
  },
};
