/**
 * Welcome Email Template
 *
 * Sent to users after successful signup to welcome them to ScaleReach.
 */

import { baseTemplate, primaryButton, divider, BRAND_COLORS, FONT_STACK } from './base.template';

export interface WelcomeEmailParams {
  userName: string;
  dashboardUrl: string;
}

/**
 * Generate the welcome email HTML
 */
export function welcomeEmailTemplate(params: WelcomeEmailParams): string {
  const { userName, dashboardUrl } = params;

  const content = `
    <!-- Welcome heading -->
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK};">
      Welcome to ScaleReach!
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray};">
      Hi ${userName}, we're excited to have you on board.
    </p>

    <!-- Main message -->
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray};">
      ScaleReach helps you transform your long-form videos into viral short clips automatically.
      Our AI-powered platform detects the most engaging moments and creates ready-to-share content
      for TikTok, Instagram Reels, and YouTube Shorts.
    </p>

    <!-- CTA Button -->
    <div style="margin: 0 0 32px;">
      ${primaryButton('Get Started', dashboardUrl)}
    </div>

    ${divider()}

    <!-- Features section -->
    <h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK};">
      What you can do with ScaleReach:
    </h2>

    <!-- Feature 1 -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        <td style="width: 40px; vertical-align: top; padding-right: 12px;">
          <div style="width: 32px; height: 32px; background-color: #eff6ff; border-radius: 8px; text-align: center; line-height: 32px;">
            <span style="font-size: 16px;">1</span>
          </div>
        </td>
        <td style="vertical-align: top;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
            Upload or Import Videos
          </p>
          <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight};">
            Import from YouTube or upload your own video files up to 4 hours long.
          </p>
        </td>
      </tr>
    </table>

    <!-- Feature 2 -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <tr>
        <td style="width: 40px; vertical-align: top; padding-right: 12px;">
          <div style="width: 32px; height: 32px; background-color: #f0fdf4; border-radius: 8px; text-align: center; line-height: 32px;">
            <span style="font-size: 16px;">2</span>
          </div>
        </td>
        <td style="vertical-align: top;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
            AI Detects Viral Moments
          </p>
          <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight};">
            Our AI analyzes your content and identifies the most engaging clips automatically.
          </p>
        </td>
      </tr>
    </table>

    <!-- Feature 3 -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
      <tr>
        <td style="width: 40px; vertical-align: top; padding-right: 12px;">
          <div style="width: 32px; height: 32px; background-color: #fef3c7; border-radius: 8px; text-align: center; line-height: 32px;">
            <span style="font-size: 16px;">3</span>
          </div>
        </td>
        <td style="vertical-align: top;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
            Export with Captions
          </p>
          <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight};">
            Customize captions with beautiful templates and export in any aspect ratio.
          </p>
        </td>
      </tr>
    </table>

    ${divider()}

    <!-- Help section -->
    <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight};">
      Need help getting started? Check out our
      <a href="${dashboardUrl}/docs" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none;">documentation</a>
      or reply to this email - we're here to help!
    </p>
  `;

  return baseTemplate({
    preheaderText: `Welcome to ScaleReach! Start creating viral clips from your videos today.`,
    content,
    footerText: `You're receiving this email because you signed up for ScaleReach.`,
  });
}

/**
 * Get the subject line for the welcome email
 */
export function welcomeEmailSubject(): string {
  return "Welcome to ScaleReach - Let's create viral content!";
}
