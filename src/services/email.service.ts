import nodemailer from "nodemailer";
import {
  welcomeEmailTemplate,
  welcomeEmailSubject,
  clipReadyEmailTemplate,
  clipReadyEmailSubject,
  invitationEmailTemplate,
  invitationEmailSubject,
  passwordResetEmailTemplate,
  passwordResetEmailSubject,
  baseTemplate,
  primaryButton,
  divider,
  BRAND_COLORS,
  FONT_STACK,
} from "../templates/emails";

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
    this.fromName = process.env.SMTP_FROM_NAME || "ScaleReach";
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

  /**
   * Send welcome email to new users after signup
   */
  async sendWelcomeEmail(params: {
    to: string;
    userName: string;
  }): Promise<boolean> {
    const { to, userName } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const dashboardUrl = `${frontendUrl}/dashboard`;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              WELCOME EMAIL                                   ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log(`║ User: ${userName}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = welcomeEmailSubject();
    const html = welcomeEmailTemplate({
      userName,
      dashboardUrl,
    });

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send clip ready notification when a clip has finished generating
   */
  async sendClipReadyNotification(params: {
    to: string;
    userName: string;
    clipId: string;
    clipTitle: string;
    clipDuration: number;
    aspectRatio: string;
    viralityScore?: number;
    thumbnailUrl?: string;
    projectName?: string;
  }): Promise<boolean> {
    const {
      to,
      userName,
      clipId,
      clipTitle,
      clipDuration,
      aspectRatio,
      viralityScore,
      thumbnailUrl,
      projectName,
    } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const viewClipUrl = `${frontendUrl}/clips/${clipId}`;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              CLIP READY NOTIFICATION                         ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log(`║ Clip: ${clipTitle}`);
    console.log(`║ Duration: ${clipDuration}s`);
    console.log(`║ Aspect Ratio: ${aspectRatio}`);
    if (viralityScore !== undefined) {
      console.log(`║ Virality Score: ${viralityScore}/100`);
    }
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║ VIEW CLIP:");
    console.log(`║ ${viewClipUrl}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = clipReadyEmailSubject(clipTitle);
    const html = clipReadyEmailTemplate({
      userName,
      clipTitle,
      clipDuration,
      aspectRatio,
      viralityScore,
      thumbnailUrl,
      viewClipUrl,
      projectName,
    });

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send workspace invitation email
   */
  async sendWorkspaceInvitation(params: {
    to: string;
    inviterName: string;
    inviterEmail?: string;
    workspaceName: string;
    role: string;
    inviteToken: string;
  }): Promise<boolean> {
    const { to, inviterName, inviterEmail, workspaceName, role, inviteToken } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const inviteUrl = `${frontendUrl}/invite/${inviteToken}`;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              WORKSPACE INVITATION CREATED                    ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log(`║ Workspace: ${workspaceName}`);
    console.log(`║ Role: ${role}`);
    console.log(`║ Invited by: ${inviterName}`);
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║ INVITATION LINK:");
    console.log(`║ ${inviteUrl}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = invitationEmailSubject(workspaceName);
    const html = invitationEmailTemplate({
      inviterName,
      inviterEmail,
      workspaceName,
      role,
      inviteUrl,
      expiresInDays: 7,
    });

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send password reset email with token
   */
  async sendPasswordResetEmail(params: { to: string; resetToken: string }): Promise<boolean> {
    const { to, resetToken } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    return this.sendPasswordResetEmailWithUrl({ to, resetUrl });
  }

  /**
   * Send password reset email with full URL
   */
  async sendPasswordResetEmailWithUrl(params: {
    to: string;
    resetUrl: string;
    userName?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<boolean> {
    const { to, resetUrl, userName, ipAddress, userAgent } = params;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              PASSWORD RESET REQUESTED                        ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log("╠═════════════════════════════════════════════════════════════╣");
    console.log("║ RESET LINK:");
    console.log(`║ ${resetUrl}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = passwordResetEmailSubject();
    const html = passwordResetEmailTemplate({
      userName,
      resetUrl,
      expiresInMinutes: 60,
      ipAddress,
      userAgent,
    });

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(params: { to: string; verificationUrl: string }): Promise<boolean> {
    const { to, verificationUrl } = params;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              EMAIL VERIFICATION REQUESTED                    ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║ VERIFICATION LINK:");
    console.log(`║ ${verificationUrl}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = "Verify your ScaleReach email";

    // Use the base template for verification email
    const content = `
      <!-- Verification icon -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 64px; height: 64px; background-color: #eff6ff; border-radius: 50%; line-height: 64px;">
          <span style="font-size: 28px;">&#9993;</span>
        </div>
      </div>

      <!-- Heading -->
      <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK}; text-align: center;">
        Verify Your Email
      </h1>
      <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray}; text-align: center;">
        Thanks for signing up! Please verify your email address to get started.
      </p>

      <!-- CTA Button -->
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding-bottom: 16px;">
            ${primaryButton('Verify Email', verificationUrl)}
          </td>
        </tr>
      </table>

      <!-- Link fallback -->
      <p style="margin: 0 0 24px; font-size: 13px; color: ${BRAND_COLORS.textLight}; text-align: center;">
        Or copy and paste this link into your browser:<br>
        <a href="${verificationUrl}" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none; word-break: break-all; font-size: 12px;">
          ${verificationUrl}
        </a>
      </p>

      ${divider()}

      <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight}; text-align: center;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    `;

    const html = baseTemplate({
      preheaderText: 'Verify your email address to get started with ScaleReach.',
      content,
      footerText: `You're receiving this because you signed up for ScaleReach.`,
    });

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send notification when video processing is complete
   */
  async sendVideoProcessedNotification(params: {
    to: string;
    userName: string;
    videoTitle: string;
    clipCount: number;
    videoId: string;
  }): Promise<boolean> {
    const { to, userName, videoTitle, clipCount, videoId } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const viewUrl = `${frontendUrl}/videos/${videoId}/clips`;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              VIDEO PROCESSED NOTIFICATION                    ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log(`║ Video: ${videoTitle}`);
    console.log(`║ Clips found: ${clipCount}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = `Your video "${videoTitle}" is ready - ${clipCount} clips found!`;

    const content = `
      <!-- Success icon -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px;">
          <span style="font-size: 28px;">✓</span>
        </div>
      </div>

      <!-- Heading -->
      <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK}; text-align: center;">
        Your Video is Ready!
      </h1>
      <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray}; text-align: center;">
        Hey ${userName}, we've finished processing your video.
      </p>
      <p style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.textDark}; text-align: center;">
        "${videoTitle}"
      </p>

      <!-- Stats -->
      <div style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.primary};">
          ${clipCount}
        </p>
        <p style="margin: 4px 0 0; font-size: 14px; color: ${BRAND_COLORS.textGray};">
          viral clips detected
        </p>
      </div>

      <!-- CTA Button -->
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding-bottom: 16px;">
            ${primaryButton('View Your Clips', viewUrl)}
          </td>
        </tr>
      </table>

      ${divider()}

      <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight}; text-align: center;">
        Your clips are now being generated with captions. You'll be able to download them shortly.
      </p>
    `;

    const html = baseTemplate({
      preheaderText: `${clipCount} viral clips found in "${videoTitle}"`,
      content,
      footerText: `You're receiving this because you uploaded a video to ScaleReach.`,
    });

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Send notification when all clips for a video have finished generating
   */
  async sendAllClipsReadyNotification(params: {
    to: string;
    userName: string;
    videoTitle: string;
    clipCount: number;
    videoId: string;
    workspaceSlug?: string;
  }): Promise<boolean> {
    const { to, userName, videoTitle, clipCount, videoId, workspaceSlug } = params;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const viewUrl = workspaceSlug
      ? `${frontendUrl}/${workspaceSlug}/videos/${videoId}/clips`
      : `${frontendUrl}/videos/${videoId}/clips`;

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              ALL CLIPS READY NOTIFICATION                    ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log(`║ To: ${to}`);
    console.log(`║ Video: ${videoTitle}`);
    console.log(`║ Clips ready: ${clipCount}`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const subject = `🎬 All ${clipCount} clips are ready for "${videoTitle}"!`;

    const content = `
      <!-- Success icon -->
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px;">
          <span style="font-size: 28px;">🎬</span>
        </div>
      </div>

      <!-- Heading -->
      <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK}; text-align: center;">
        Your Clips Are Ready!
      </h1>
      <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray}; text-align: center;">
        Hey ${userName}, all your clips have finished generating and are ready to download!
      </p>
      <p style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.textDark}; text-align: center;">
        "${videoTitle}"
      </p>

      <!-- Stats -->
      <div style="background-color: #dcfce7; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
        <p style="margin: 0; font-size: 32px; font-weight: 700; color: #16a34a;">
          ${clipCount}
        </p>
        <p style="margin: 4px 0 0; font-size: 14px; color: #166534;">
          clips ready to download
        </p>
      </div>

      <!-- CTA Button -->
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding-bottom: 16px;">
            ${primaryButton('Download Your Clips', viewUrl)}
          </td>
        </tr>
      </table>

      ${divider()}

      <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight}; text-align: center;">
        Your clips include captions and are optimized for social media. Start sharing!
      </p>
    `;

    const html = baseTemplate({
      preheaderText: `All ${clipCount} clips are ready for "${videoTitle}"`,
      content,
      footerText: `You're receiving this because you uploaded a video to ScaleReach.`,
    });

    return this.sendEmail({ to, subject, html });
  }
}


export const emailService = new EmailService();
