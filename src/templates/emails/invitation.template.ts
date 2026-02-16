/**
 * Workspace Invitation Email Template
 *
 * Sent when a user is invited to join a workspace.
 */

import { baseTemplate, primaryButton, divider, BRAND_COLORS, FONT_STACK, EMAIL_ICONS, emailIcon } from './base.template';

export interface InvitationEmailParams {
  inviterName: string;
  inviterEmail?: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
  expiresInDays?: number;
}

/**
 * Get role badge color
 */
function getRoleBadge(role: string): { bg: string; text: string } {
  const badges: Record<string, { bg: string; text: string }> = {
    owner: { bg: '#fef2f2', text: '#dc2626' },
    admin: { bg: '#fffbeb', text: '#d97706' },
    editor: { bg: '#eff6ff', text: '#2553CB' },
    viewer: { bg: '#f0fdf4', text: '#16a34a' },
  };
  return badges[role.toLowerCase()] || { bg: '#eff6ff', text: '#2553CB' };
}

/**
 * Get role description for display
 */
function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    owner: 'Full access to manage workspace, billing, and team',
    admin: 'Manage projects, team members, and settings',
    editor: 'Create and edit projects and clips',
    viewer: 'View projects and clips',
  };
  return descriptions[role.toLowerCase()] || 'Access to workspace projects and clips';
}

/**
 * Generate the workspace invitation email HTML
 */
export function invitationEmailTemplate(params: InvitationEmailParams): string {
  const {
    inviterName,
    inviterEmail,
    workspaceName,
    role,
    inviteUrl,
    expiresInDays = 7,
  } = params;

  const badge = getRoleBadge(role);

  const content = `
    ${emailIcon(EMAIL_ICONS.invitation)}

    <!-- Heading -->
    <h1 class="base-heading" style="margin: 0 0 8px; font-size: 24px; font-weight: 400; color: ${BRAND_COLORS.textWhite}; font-family: 'Inter', ${FONT_STACK}; text-align: center;">
      You're Invited
    </h1>
    <p class="base-subheading" style="margin: 0 0 28px; font-size: 15px; line-height: 24px; color: ${BRAND_COLORS.textSecondary}; text-align: center;">
      <strong style="color: ${BRAND_COLORS.textWhite};">${inviterName}</strong>${inviterEmail ? ` (${inviterEmail})` : ''} invited you to collaborate on ScaleReach.
    </p>

    <!-- Workspace details card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgMuted}; border: 1px solid ${BRAND_COLORS.border}; margin-bottom: 24px;">
      <tr>
        <td style="padding: 20px 24px;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <!-- Workspace icon -->
              <td style="width: 48px; vertical-align: middle; padding-right: 16px;">
                <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #6366f1, ${BRAND_COLORS.primary}); text-align: center; line-height: 44px;">
                  <span style="font-size: 20px; color: white; font-weight: 700;">${workspaceName.charAt(0).toUpperCase()}</span>
                </div>
              </td>
              <td style="vertical-align: middle;">
                <p style="margin: 0 0 2px; font-size: 17px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; font-family: 'Inter', ${FONT_STACK};">
                  ${workspaceName}
                </p>
                <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.textMuted};">
                  ${getRoleDescription(role)}
                </p>
              </td>
              <!-- Role badge -->
              <td style="width: 80px; vertical-align: middle; text-align: right;">
                <span style="display: inline-block; padding: 4px 12px; font-size: 12px; font-weight: 600; color: ${badge.text}; background-color: ${badge.bg}; text-transform: capitalize; letter-spacing: 0.3px;">
                  ${role}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-top: 8px; padding-bottom: 24px;">
          ${primaryButton('Accept Invitation', inviteUrl)}
        </td>
      </tr>
    </table>

    ${divider()}

    <!-- Expiration + safety note -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 0;">
          <p style="margin: 0 0 8px; font-size: 13px; line-height: 20px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
            This invitation expires in <strong style="color: ${BRAND_COLORS.textSecondary};">${expiresInDays} days</strong>.
          </p>
          <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${BRAND_COLORS.textDim}; text-align: center;">
            Don't recognize ${inviterName}? You can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  `;

  return baseTemplate({
    preheaderText: `${inviterName} invited you to join ${workspaceName} on ScaleReach`,
    content,
    footerText: `You're receiving this because someone invited you to a ScaleReach workspace.`,
  });
}

/**
 * Get the subject line for the invitation email
 */
export function invitationEmailSubject(workspaceName: string): string {
  return `You've been invited to join ${workspaceName}`;
}
