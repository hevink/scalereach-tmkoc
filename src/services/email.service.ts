import nodemailer from "nodemailer";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.fromEmail = process.env.SMTP_FROM_EMAIL || "noreply@scalereach.com";
    this.fromName = process.env.SMTP_FROM_NAME || "Scalereach";
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      console.warn("[EMAIL SERVICE] SMTP not configured. Email sending disabled.");
      return;
    }

    const config: EmailConfig = {
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    };

    this.transporter = nodemailer.createTransport(config);
    console.log("[EMAIL SERVICE] Transporter initialized");
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.transporter) {
      console.warn("[EMAIL SERVICE] Transporter not configured. Skipping email.");
      // In development, log the email content
      console.log("\n========================================");
      console.log("[EMAIL SERVICE] Would send email:");
      console.log("To:", options.to);
      console.log("Subject:", options.subject);
      console.log("========================================\n");
      return true; // Return true in dev mode to not block the flow
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      console.log(`[EMAIL SERVICE] Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error("[EMAIL SERVICE] Failed to send email:", error);
      return false;
    }
  }

  async sendWorkspaceInvitation(params: {
    to: string;
    inviterName: string;
    workspaceName: string;
    role: string;
    inviteToken: string;
  }): Promise<boolean> {
    const { to, inviterName, workspaceName, role, inviteToken } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const inviteLink = `${frontendUrl}/invite/${inviteToken}`;

    // Always log the invite link to terminal for easy access
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              🎉 WORKSPACE INVITATION CREATED 🎉              ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log(`║ Workspace: ${workspaceName}`);
    console.log(`║ Role: ${role}`);
    console.log(`║ Invited by: ${inviterName}`);
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║ 🔗 INVITATION LINK:");
    console.log(`║ ${inviteLink}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = `You've been invited to join ${workspaceName}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 40px 40px 20px;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #18181b;">
                You're invited to join ${workspaceName}
              </h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 24px; color: #52525b;">
                <strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> as a <strong>${role}</strong>.
              </p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 24px; color: #52525b;">
                Click the button below to accept the invitation and get started.
              </p>
              <table role="presentation" style="border-collapse: collapse;">
                <tr>
                  <td style="border-radius: 6px; background-color: #18181b;">
                    <a href="${inviteLink}" target="_blank" style="display: inline-block; padding: 14px 28px; font-size: 16px; font-weight: 500; color: #ffffff; text-decoration: none;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px 40px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #71717a;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 14px; color: #3b82f6; word-break: break-all;">
                ${inviteLink}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; font-size: 12px; color: #a1a1aa;">
                This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `
You've been invited to join ${workspaceName}

${inviterName} has invited you to join ${workspaceName} as a ${role}.

Click the link below to accept the invitation:
${inviteLink}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.
    `;

    return this.sendEmail({ to, subject, html, text });
  }
}

export const emailService = new EmailService();
