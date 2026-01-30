import { Context } from "hono";
import { db } from "../db";
import { verification, account, user } from "../db/schema/user.schema";
import { eq, and, gt } from "drizzle-orm";
import { emailService } from "../services/email.service";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";

export class PasswordResetController {
  // Request password reset - sends email with reset link
  static async requestReset(c: Context) {
    try {
      const { email } = await c.req.json();

      if (!email) {
        return c.json({ error: "Email is required" }, 400);
      }

      // Find user by email
      const [existingUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);

      // Always return success to prevent email enumeration
      if (!existingUser) {
        return c.json({ success: true, message: "If an account exists, a reset link has been sent" });
      }

      // Generate reset token
      const resetToken = nanoid(32);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store in verification table
      await db.insert(verification).values({
        id: nanoid(),
        identifier: email,
        value: resetToken,
        expiresAt,
      });

      // Send email
      await emailService.sendPasswordResetEmail({ to: email, resetToken });

      return c.json({ success: true, message: "If an account exists, a reset link has been sent" });
    } catch (error) {
      console.error("[PASSWORD RESET] Request error:", error);
      return c.json({ error: "Failed to process request" }, 500);
    }
  }

  // Verify reset token is valid
  static async verifyToken(c: Context) {
    try {
      const token = c.req.param("token");

      if (!token) {
        return c.json({ valid: false }, 400);
      }

      const [record] = await db
        .select()
        .from(verification)
        .where(and(eq(verification.value, token), gt(verification.expiresAt, new Date())))
        .limit(1);

      return c.json({ valid: !!record });
    } catch (error) {
      console.error("[PASSWORD RESET] Verify error:", error);
      return c.json({ valid: false }, 500);
    }
  }

  // Reset password with token
  static async resetPassword(c: Context) {
    try {
      const token = c.req.param("token");
      const { password } = await c.req.json();

      if (!token || !password) {
        return c.json({ error: "Token and password are required" }, 400);
      }

      if (password.length < 8) {
        return c.json({ error: "Password must be at least 8 characters" }, 400);
      }

      // Find valid token
      const [record] = await db
        .select()
        .from(verification)
        .where(and(eq(verification.value, token), gt(verification.expiresAt, new Date())))
        .limit(1);

      if (!record) {
        return c.json({ error: "Invalid or expired reset link" }, 400);
      }

      // Find user
      const [existingUser] = await db.select().from(user).where(eq(user.email, record.identifier)).limit(1);

      if (!existingUser) {
        return c.json({ error: "User not found" }, 404);
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update password in account table (credential provider)
      await db
        .update(account)
        .set({ password: hashedPassword })
        .where(and(eq(account.userId, existingUser.id), eq(account.providerId, "credential")));

      // Delete used token
      await db.delete(verification).where(eq(verification.id, record.id));

      return c.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      console.error("[PASSWORD RESET] Reset error:", error);
      return c.json({ error: "Failed to reset password" }, 500);
    }
  }
}
