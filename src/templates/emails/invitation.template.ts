/**
 * Workspace Invitation Email Template
 *
 * Sent when a user is invited to join a workspace.
 */

import { baseTemplate, primaryButton, divider, infoBox, BRAND_COLORS, FONT_STACK } from './base.template';

export interface InvitationEmailParams {
  inviterName: string;
  inviterEmail?: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
  expiresInDays?: number;
}

/**
 * Get role description for display
 */
function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    owner: 'Full access to manage the workspace, billing, and team members',
    admin: 'Can manage projects, team members, and workspace settings',
    editor: 'Can create and edit projects and clips',
    viewer: 'Can view projects and clips',
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

  const content = `
    <!-- Invitation icon -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #eff6ff; border-radius: 50%; line-height: 64px;">
        <span style="font-size: 28px;">&#9993;</span>
      </div>
    </div>

    <!-- Heading -->
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK}; text-align: center;">
      You're Invited!
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray}; text-align: center;">
      <strong>${inviterName}</strong>${inviterEmail ? ` (${inviterEmail})` : ''} has invited you to join their workspace on ScaleReach.
    </p>

    ${divider()}

    <!-- Workspace details card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.background}; border-radius: 12px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 24px;">
          <!-- Workspace name -->
          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td>
                <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted};">
                  Workspace
                </p>
                <p style="margin: 0; font-size: 20px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
                  ${workspaceName}
                </p>
              </td>
            </tr>
          </table>

          <!-- Role -->
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td>
                <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted};">
                  Your Role
                </p>
                <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.textDark}; text-transform: capitalize;">
                  ${role}
                </p>
                <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.textLight};">
                  ${getRoleDescription(role)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-bottom: 16px;">
          ${primaryButton('Accept Invitation', inviteUrl)}
        </td>
      </tr>
    </table>

    <!-- Link fallback -->
    <p style="margin: 0 0 24px; font-size: 13px; color: ${BRAND_COLORS.textLight}; text-align: center;">
      Or copy and paste this link into your browser:<br>
      <a href="${inviteUrl}" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none; word-break: break-all; font-size: 12px;">
        ${inviteUrl}
      </a>
    </p>

    ${divider()}

    <!-- Expiration notice -->
    ${infoBox(
      `This invitation will expire in <strong>${expiresInDays} days</strong>. If you don't want to join this workspace, you can safely ignore this email.`,
      'warning'
    )}

    <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight}; text-align: center;">
      Don't know ${inviterName}? You can safely ignore this email.
    </p>
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
