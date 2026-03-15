import "dotenv/config";
import { Pool } from "@neondatabase/serverless";
import nodemailer from "nodemailer";
import {
  affiliateLaunchEmailTemplate,
  affiliateLaunchEmailSubject,
} from "../templates/emails/affiliate-launch.template";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.scalereach.ai";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmails() {
  console.log("🚀 Sending affiliate launch emails...\n");

  const { rows: users } = await pool.query(
    `SELECT id, name, email, referral_code FROM "user" WHERE email_verified = true AND referral_code IS NOT NULL`
  );

  console.log(`Found ${users.length} verified users to email\n`);

  const subject = affiliateLaunchEmailSubject();
  let sent = 0;
  let failed = 0;

  for (const u of users) {
    const referralLink = `${FRONTEND_URL}/r/${u.referral_code}`;
    const html = affiliateLaunchEmailTemplate({
      userName: u.name || u.email.split("@")[0],
      referralLink,
      referralCode: u.referral_code,
    });

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "ScaleReach <noreply@scalereach.ai>",
        to: u.email,
        subject,
        html,
      });
      sent++;
      console.log(`  ✅ ${u.email}`);
    } catch (err) {
      failed++;
      console.error(`  ❌ ${u.email}:`, (err as Error).message);
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n🎉 Done! Sent: ${sent}, Failed: ${failed}`);
  await pool.end();
}

sendEmails().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
