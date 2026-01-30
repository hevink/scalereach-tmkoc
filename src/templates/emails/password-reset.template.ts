/**
 * Password Reset Email Template
 *
 * Sent when a user requests to reset their password.
 */

import { baseTemplate, primaryButton, divider, infoBox, BRAND_COLORS, FONT_STACK } from './base.template';

export interface PasswordResetEmailParams {
  userName?: string;
  resetUrl: string;
  expiresInMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Generate the password reset email HTML
 */
export function passwordResetEmailTemplate(params: PasswordResetEmailParams): string {
  const {
    userName,
    resetUrl,
    expiresInMinutes = 60,
    ipAddress,
    userAgent,
  } = params;

  const greeting = userName ? `Hi ${userName},` : 'Hi,';
  const expiresText = expiresInMinutes >= 60
    ? `${Math.floor(expiresInMinutes / 60)} hour${expiresInMinutes >= 120 ? 's' : ''}`
    : `${expiresInMinutes} minutes`;

  const content = `
    <!-- Lock icon -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #fef3c7; border-radius: 50%; line-height: 64px;">
        <span style="font-size: 28px;">&#128274;</span>
      </div>
    </div>

    <!-- Heading -->
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK}; text-align: center;">
      Reset Your Password
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray}; text-align: center;">
      ${greeting} We received a request to reset your password.
    </p>

    <!-- Main message -->
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray};">
      Click the button below to create a new password. If you didn't request this, you can safely ignore this email - your password will remain unchanged.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-bottom: 16px;">
          ${primaryButton('Reset Password', resetUrl)}
        </td>
      </tr>
    </table>

    <!-- Link fallback -->
    <p style="margin: 0 0 24px; font-size: 13px; color: ${BRAND_COLORS.textLight}; text-align: center;">
      Or copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none; word-break: break-all; font-size: 12px;">
        ${resetUrl}
      </a>
    </p>

    ${divider()}

    <!-- Expiration notice -->
    ${infoBox(
      `This link will expire in <strong>${expiresText}</strong> for security reasons. After that, you'll need to request a new password reset.`,
      'warning'
    )}

    ${divider()}

    <!-- Security tips -->
    <h2 style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK};">
      Security Tips
    </h2>
    <ul style="margin: 0 0 16px; padding-left: 20px; color: ${BRAND_COLORS.textGray}; font-size: 14px; line-height: 22px;">
      <li style="margin-bottom: 8px;">Never share this link with anyone</li>
      <li style="margin-bottom: 8px;">ScaleReach will never ask for your password via email</li>
      <li style="margin-bottom: 8px;">Use a strong, unique password you don't use elsewhere</li>
      <li>Consider enabling two-factor authentication for extra security</li>
    </ul>

    ${(ipAddress || userAgent) ? `
    ${divider()}

    <!-- Request details -->
    <p style="margin: 0 0 8px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
      <strong>Request details:</strong>
    </p>
    ${ipAddress ? `
    <p style="margin: 0 0 4px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
      IP Address: ${ipAddress}
    </p>
    ` : ''}
    ${userAgent ? `
    <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
      Device: ${userAgent}
    </p>
    ` : ''}
    ` : ''}

    <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight}; text-align: center;">
      Didn't request this? <a href="mailto:support@scalereach.com" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none;">Contact support</a> if you're concerned about your account security.
    </p>
  `;

  return baseTemplate({
    preheaderText: `Reset your ScaleReach password. This link expires in ${expiresText}.`,
    content,
    footerText: `You're receiving this because a password reset was requested for your ScaleReach account.`,
  });
}

/**
 * Get the subject line for the password reset email
 */
export function passwordResetEmailSubject(): string {
  return 'Reset your ScaleReach password';
}
