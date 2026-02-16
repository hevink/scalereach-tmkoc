import { Hono } from "hono";
import { UserController } from "../controllers/user.controller";
import {
  welcomeEmailTemplate,
  clipReadyEmailTemplate,
  invitationEmailTemplate,
  passwordResetEmailTemplate,
  baseTemplate,
  primaryButton,
  divider,
  BRAND_COLORS,
  FONT_STACK,
  EMAIL_ICONS,
  emailIcon,
} from "../templates/emails";
import { emailService } from "../services/email.service";

const emailRouter = new Hono();

// Public route for email availability check
emailRouter.get("/check", UserController.checkEmail);

// ============================================================================
// Email Preview Routes (dev only - renders HTML in browser)
// ============================================================================

const SAMPLE_DATA = {
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
};

// Preview index - list all available templates
emailRouter.get("/preview", (c) => {
  const templates = [
    { name: "welcome", label: "Welcome Email" },
    { name: "password-reset", label: "Password Reset" },
    { name: "invitation", label: "Workspace Invitation" },
    { name: "clip-ready", label: "Clip Ready Notification" },
    { name: "verification", label: "Email Verification" },
    { name: "video-processed", label: "Video Processed" },
    { name: "all-clips-ready", label: "All Clips Ready" },
  ];

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>ScaleReach Email Previews</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; color: #f5f5f7; background: #0a0a0b; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    p { color: #71717a; margin-bottom: 24px; }
    a { display: block; padding: 12px 16px; margin-bottom: 8px; background: #141416; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #e4e4e7; text-decoration: none; font-weight: 500; }
    a:hover { background: #1e1e22; border-color: rgba(255,255,255,0.12); }
    .send-all { margin-top: 24px; padding: 14px 16px; background: #ffffff; color: #0a0a0b; text-align: center; border-radius: 50px; font-weight: 600; border: none; }
    .send-all:hover { background: #e4e4e7; }
  </style>
</head>
<body>
  <h1>Email Previews</h1>
  <p>Click a template to preview it in the browser.</p>
  ${templates.map((t) => `<a href="/api/email/preview/${t.name}">${t.label}</a>`).join("\n  ")}
  <a class="send-all" href="/api/email/send-test-all?to=hevinkalathiya123@gmail.com">Send All Emails to Test Inbox</a>
</body>
</html>`;

  return c.html(html);
});

// Preview: Welcome
emailRouter.get("/preview/welcome", (c) => {
  const html = welcomeEmailTemplate({
    userName: "Hevin",
    dashboardUrl: `${SAMPLE_DATA.frontendUrl}/dashboard`,
  });
  return c.html(html);
});

// Preview: Password Reset
emailRouter.get("/preview/password-reset", (c) => {
  const html = passwordResetEmailTemplate({
    userName: "Hevin",
    resetUrl: `${SAMPLE_DATA.frontendUrl}/reset-password/sample-token-abc123`,
    expiresInMinutes: 60,
    ipAddress: "192.168.1.1",
    userAgent: "Chrome 120 on macOS",
  });
  return c.html(html);
});

// Preview: Invitation
emailRouter.get("/preview/invitation", (c) => {
  const html = invitationEmailTemplate({
    inviterName: "Hevin Kalathiya",
    inviterEmail: "hevin@scalereach.ai",
    workspaceName: "ScaleReach Team",
    role: "editor",
    inviteUrl: `${SAMPLE_DATA.frontendUrl}/invite/sample-invite-token`,
    expiresInDays: 7,
  });
  return c.html(html);
});

// Preview: Clip Ready
emailRouter.get("/preview/clip-ready", (c) => {
  const html = clipReadyEmailTemplate({
    userName: "Hevin",
    clipTitle: "The Secret to Going Viral on TikTok",
    clipDuration: 47,
    aspectRatio: "9:16",
    viralityScore: 85,
    viewClipUrl: `${SAMPLE_DATA.frontendUrl}/clips/sample-clip-id`,
    projectName: "Marketing Podcast Ep. 42",
  });
  return c.html(html);
});

// Preview: Email Verification
emailRouter.get("/preview/verification", (c) => {
  const verificationUrl = `${SAMPLE_DATA.frontendUrl}/verify-email?token=sample-verification-token`;

  const content = `
    ${emailIcon(EMAIL_ICONS.verification)}
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; font-family: ${FONT_STACK}; text-align: center;">
      Verify Your Email
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textSecondary}; text-align: center;">
      Thanks for signing up! Please verify your email address to get started.
    </p>
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-bottom: 16px;">
          ${primaryButton("Verify Email", verificationUrl)}
        </td>
      </tr>
    </table>
    <p style="margin: 0 0 24px; font-size: 13px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
      Or copy and paste this link into your browser:<br>
      <a href="${verificationUrl}" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none; word-break: break-all; font-size: 12px;">
        ${verificationUrl}
      </a>
    </p>
    ${divider()}
    <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  `;

  const html = baseTemplate({
    preheaderText: "Verify your email address to get started with ScaleReach.",
    content,
    footerText: "You're receiving this because you signed up for ScaleReach.",
  });
  return c.html(html);
});

// Preview: Video Processed
emailRouter.get("/preview/video-processed", (c) => {
  const viewUrl = `${SAMPLE_DATA.frontendUrl}/videos/sample-video-id/clips`;

  const content = `
    ${emailIcon(EMAIL_ICONS.videoProcessed)}
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; font-family: ${FONT_STACK}; text-align: center;">
      Your Video is Ready!
    </h1>
    <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textSecondary}; text-align: center;">
      Hey Hevin, we've finished processing your video.
    </p>
    <p style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; text-align: center;">
      "How to Build a SaaS in 2026"
    </p>
    <div style="background-color: ${BRAND_COLORS.bgMuted}; border: 1px solid ${BRAND_COLORS.border}; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
      <p style="margin: 0; font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.primaryLight};">12</p>
      <p style="margin: 4px 0 0; font-size: 14px; color: ${BRAND_COLORS.textSecondary};">viral clips detected</p>
    </div>
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-bottom: 16px;">
          ${primaryButton("View Your Clips", viewUrl)}
        </td>
      </tr>
    </table>
    ${divider()}
    <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
      Your clips are now being generated with captions. You'll be able to download them shortly.
    </p>
  `;

  const html = baseTemplate({
    preheaderText: '12 viral clips found in "How to Build a SaaS in 2026"',
    content,
    footerText: "You're receiving this because you uploaded a video to ScaleReach.",
  });
  return c.html(html);
});

// Preview: All Clips Ready
emailRouter.get("/preview/all-clips-ready", (c) => {
  const viewUrl = `${SAMPLE_DATA.frontendUrl}/my-workspace/videos/sample-video-id/clips`;

  const content = `
    ${emailIcon(EMAIL_ICONS.allClipsReady)}
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; font-family: ${FONT_STACK}; text-align: center;">
      Your Clips Are Ready!
    </h1>
    <p style="margin: 0 0 8px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textSecondary}; text-align: center;">
      Hey Hevin, all your clips have finished generating and are ready to download!
    </p>
    <p style="margin: 0 0 24px; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; text-align: center;">
      "How to Build a SaaS in 2026"
    </p>
    <div style="background-color: ${BRAND_COLORS.successBg}; border: 1px solid ${BRAND_COLORS.successBorder}; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center;">
      <p style="margin: 0; font-size: 32px; font-weight: 700; color: ${BRAND_COLORS.success};">12</p>
      <p style="margin: 4px 0 0; font-size: 14px; color: ${BRAND_COLORS.success};">clips ready to download</p>
    </div>
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-bottom: 16px;">
          ${primaryButton("Download Your Clips", viewUrl)}
        </td>
      </tr>
    </table>
    ${divider()}
    <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
      Your clips include captions and are optimized for social media. Start sharing!
    </p>
  `;

  const html = baseTemplate({
    preheaderText: 'All 12 clips are ready for "How to Build a SaaS in 2026"',
    content,
    footerText: "You're receiving this because you uploaded a video to ScaleReach.",
  });
  return c.html(html);
});

// ============================================================================
// Send Test Emails
// ============================================================================

// Send all test emails to a given address
emailRouter.get("/send-test-all", async (c) => {
  const to = c.req.query("to") || "hevinkalathiya123@gmail.com";
  const results: { template: string; success: boolean; error?: string }[] = [];

  // 1. Welcome
  try {
    const ok = await emailService.sendWelcomeEmail({ to, userName: "Hevin" });
    results.push({ template: "welcome", success: ok });
  } catch (e: any) {
    results.push({ template: "welcome", success: false, error: e.message });
  }

  // 2. Password Reset
  try {
    const ok = await emailService.sendPasswordResetEmailWithUrl({
      to,
      resetUrl: `${SAMPLE_DATA.frontendUrl}/reset-password/test-token`,
      userName: "Hevin",
      ipAddress: "192.168.1.1",
      userAgent: "Chrome 120 on macOS",
    });
    results.push({ template: "password-reset", success: ok });
  } catch (e: any) {
    results.push({ template: "password-reset", success: false, error: e.message });
  }

  // 3. Invitation
  try {
    const ok = await emailService.sendWorkspaceInvitation({
      to,
      inviterName: "Hevin Kalathiya",
      inviterEmail: "hevin@scalereach.ai",
      workspaceName: "ScaleReach Team",
      role: "editor",
      inviteToken: "test-invite-token",
    });
    results.push({ template: "invitation", success: ok });
  } catch (e: any) {
    results.push({ template: "invitation", success: false, error: e.message });
  }

  // 4. Clip Ready
  try {
    const ok = await emailService.sendClipReadyNotification({
      to,
      userName: "Hevin",
      clipId: "test-clip-id",
      clipTitle: "The Secret to Going Viral on TikTok",
      clipDuration: 47,
      aspectRatio: "9:16",
      viralityScore: 85,
      projectName: "Marketing Podcast Ep. 42",
    });
    results.push({ template: "clip-ready", success: ok });
  } catch (e: any) {
    results.push({ template: "clip-ready", success: false, error: e.message });
  }

  // 5. Verification
  try {
    const ok = await emailService.sendVerificationEmail({
      to,
      verificationUrl: `${SAMPLE_DATA.frontendUrl}/verify-email?token=test-token`,
    });
    results.push({ template: "verification", success: ok });
  } catch (e: any) {
    results.push({ template: "verification", success: false, error: e.message });
  }

  // 6. Video Processed
  try {
    const ok = await emailService.sendVideoProcessedNotification({
      to,
      userName: "Hevin",
      videoTitle: "How to Build a SaaS in 2026",
      clipCount: 12,
      videoId: "test-video-id",
    });
    results.push({ template: "video-processed", success: ok });
  } catch (e: any) {
    results.push({ template: "video-processed", success: false, error: e.message });
  }

  // 7. All Clips Ready
  try {
    const ok = await emailService.sendAllClipsReadyNotification({
      to,
      userName: "Hevin",
      videoTitle: "How to Build a SaaS in 2026",
      clipCount: 12,
      videoId: "test-video-id",
      workspaceSlug: "my-workspace",
    });
    results.push({ template: "all-clips-ready", success: ok });
  } catch (e: any) {
    results.push({ template: "all-clips-ready", success: false, error: e.message });
  }

  const allSuccess = results.every((r) => r.success);
  return c.json({
    success: allSuccess,
    to,
    results,
    message: allSuccess
      ? `All ${results.length} test emails sent to ${to}`
      : `Some emails failed. Check results for details.`,
  });
});

// Send a single test email by template name
emailRouter.get("/send-test/:template", async (c) => {
  const template = c.req.param("template");
  const to = c.req.query("to") || "hevinkalathiya123@gmail.com";

  let success = false;
  let error: string | undefined;

  try {
    switch (template) {
      case "welcome":
        success = await emailService.sendWelcomeEmail({ to, userName: "Hevin" });
        break;
      case "password-reset":
        success = await emailService.sendPasswordResetEmailWithUrl({
          to,
          resetUrl: `${SAMPLE_DATA.frontendUrl}/reset-password/test-token`,
          userName: "Hevin",
        });
        break;
      case "invitation":
        success = await emailService.sendWorkspaceInvitation({
          to,
          inviterName: "Hevin Kalathiya",
          inviterEmail: "hevin@scalereach.ai",
          workspaceName: "ScaleReach Team",
          role: "editor",
          inviteToken: "test-invite-token",
        });
        break;
      case "clip-ready":
        success = await emailService.sendClipReadyNotification({
          to,
          userName: "Hevin",
          clipId: "test-clip-id",
          clipTitle: "The Secret to Going Viral on TikTok",
          clipDuration: 47,
          aspectRatio: "9:16",
          viralityScore: 85,
          projectName: "Marketing Podcast Ep. 42",
        });
        break;
      case "verification":
        success = await emailService.sendVerificationEmail({
          to,
          verificationUrl: `${SAMPLE_DATA.frontendUrl}/verify-email?token=test-token`,
        });
        break;
      case "video-processed":
        success = await emailService.sendVideoProcessedNotification({
          to,
          userName: "Hevin",
          videoTitle: "How to Build a SaaS in 2026",
          clipCount: 12,
          videoId: "test-video-id",
        });
        break;
      case "all-clips-ready":
        success = await emailService.sendAllClipsReadyNotification({
          to,
          userName: "Hevin",
          videoTitle: "How to Build a SaaS in 2026",
          clipCount: 12,
          videoId: "test-video-id",
          workspaceSlug: "my-workspace",
        });
        break;
      default:
        return c.json({ success: false, error: `Unknown template: ${template}` }, 404);
    }
  } catch (e: any) {
    error = e.message;
  }

  return c.json({ success, to, template, ...(error && { error }) });
});

export default emailRouter;
