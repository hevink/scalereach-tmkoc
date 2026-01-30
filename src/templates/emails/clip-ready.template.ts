/**
 * Clip Ready Notification Email Template
 *
 * Sent to users when their clip has finished generating and is ready to view/download.
 */

import { baseTemplate, primaryButton, secondaryButton, divider, infoBox, BRAND_COLORS, FONT_STACK } from './base.template';

export interface ClipReadyEmailParams {
  userName: string;
  clipTitle: string;
  clipDuration: number; // in seconds
  aspectRatio: string;
  viralityScore?: number; // 0-100
  thumbnailUrl?: string;
  viewClipUrl: string;
  projectName?: string;
}

/**
 * Format duration from seconds to MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get virality score color based on value
 */
function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e'; // green
  if (score >= 60) return '#f59e0b'; // amber
  return '#6b7280'; // gray
}

/**
 * Generate the clip ready notification email HTML
 */
export function clipReadyEmailTemplate(params: ClipReadyEmailParams): string {
  const {
    userName,
    clipTitle,
    clipDuration,
    aspectRatio,
    viralityScore,
    thumbnailUrl,
    viewClipUrl,
    projectName,
  } = params;

  const content = `
    <!-- Success indicator -->
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #f0fdf4; border-radius: 50%; line-height: 64px;">
        <span style="font-size: 32px; color: #22c55e;">&#10003;</span>
      </div>
    </div>

    <!-- Heading -->
    <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK}; text-align: center;">
      Your Clip is Ready!
    </h1>
    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: ${BRAND_COLORS.textGray}; text-align: center;">
      Hi ${userName}, your clip has finished processing and is ready to view.
    </p>

    ${divider()}

    <!-- Clip preview card -->
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.background}; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
      ${thumbnailUrl ? `
      <tr>
        <td style="padding: 0;">
          <img src="${thumbnailUrl}" alt="Clip thumbnail" style="width: 100%; height: auto; display: block; border-radius: 12px 12px 0 0;">
        </td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 20px;">
          <!-- Clip title -->
          <h2 style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: ${BRAND_COLORS.textDark}; font-family: ${FONT_STACK};">
            ${clipTitle}
          </h2>

          ${projectName ? `
          <p style="margin: 0 0 16px; font-size: 13px; color: ${BRAND_COLORS.textLight};">
            From project: <strong>${projectName}</strong>
          </p>
          ` : ''}

          <!-- Clip details -->
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <!-- Duration -->
              <td style="width: 33%; padding: 8px 0;">
                <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted};">
                  Duration
                </p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
                  ${formatDuration(clipDuration)}
                </p>
              </td>
              <!-- Aspect Ratio -->
              <td style="width: 33%; padding: 8px 0;">
                <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted};">
                  Format
                </p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.textDark};">
                  ${aspectRatio}
                </p>
              </td>
              ${viralityScore !== undefined ? `
              <!-- Virality Score -->
              <td style="width: 33%; padding: 8px 0;">
                <p style="margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: ${BRAND_COLORS.textMuted};">
                  Viral Score
                </p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: ${getScoreColor(viralityScore)};">
                  ${viralityScore}/100
                </p>
              </td>
              ` : ''}
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA Buttons -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding-bottom: 12px;">
          ${primaryButton('View & Download Clip', viewClipUrl)}
        </td>
      </tr>
    </table>

    ${divider()}

    <!-- Tips section -->
    ${infoBox(
      `<strong>Pro tip:</strong> Share your clip within the first hour of posting for maximum engagement. The best times to post are typically 7-9 AM and 7-11 PM in your target audience's timezone.`,
      'info'
    )}

    <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight}; text-align: center;">
      Want to create more clips?
      <a href="${viewClipUrl.replace(/\/clips\/.*/, '')}" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none;">Go to your dashboard</a>
    </p>
  `;

  return baseTemplate({
    preheaderText: `Your clip "${clipTitle}" is ready to view and download!`,
    content,
    footerText: `You're receiving this because you generated a clip on ScaleReach.`,
  });
}

/**
 * Get the subject line for the clip ready email
 */
export function clipReadyEmailSubject(clipTitle: string): string {
  return `Your clip is ready: ${clipTitle}`;
}
