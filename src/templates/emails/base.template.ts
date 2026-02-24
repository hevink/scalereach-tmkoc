/**
 * Base Email Template
 *
 * Light/white theme for all ScaleReach emails.
 * Uses inline CSS for maximum email client compatibility.
 */

export interface BaseTemplateOptions {
  preheaderText?: string;
  content: string;
  footerText?: string;
}

/**
 * Brand colors - light/white theme
 */
export const BRAND_COLORS = {
  // Primary brand
  primary: '#2553CB',
  primaryLight: '#3b6ef5',
  primaryDark: '#1a3d99',

  // Backgrounds
  bgBody: '#f4f4f5',
  bgCard: '#ffffff',
  bgCardAlt: '#f9fafb',
  bgMuted: '#f3f4f6',
  bgElevated: '#ffffff',

  // Text
  textWhite: '#111827',
  textPrimary: '#1f2937',
  textSecondary: '#4b5563',
  textMuted: '#6b7280',
  textDim: '#9ca3af',

  // Borders
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  borderAccent: 'rgba(37, 83, 203, 0.3)',

  // Accents
  linkBlue: '#2553CB',
  success: '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  warning: '#d97706',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  error: '#dc2626',
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',

  white: '#ffffff',
} as const;

/**
 * Font stack for email templates
 */
export const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Colorful SVG icons for email templates (64x64, with gradient fills)
 */
export const EMAIL_ICONS = {
  // Welcome - Rocket icon (blue-purple gradient)
  welcome: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#welcome_bg)"/>
    <path d="M32 16c-4 6-6 12-6 18h12c0-6-2-12-6-18z" fill="white" opacity="0.95"/>
    <path d="M26 34c-3 2-5 5-5 8h6v-8z" fill="white" opacity="0.7"/>
    <path d="M38 34c3 2 5 5 5 8h-6v-8z" fill="white" opacity="0.7"/>
    <circle cx="32" cy="28" r="3" fill="url(#welcome_bg2)"/>
    <path d="M29 42h6v6l-3 2-3-2v-6z" fill="white" opacity="0.9"/>
    <defs>
      <linearGradient id="welcome_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#2553CB"/></linearGradient>
      <linearGradient id="welcome_bg2" x1="29" y1="25" x2="35" y2="31"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#2553CB"/></linearGradient>
    </defs>
  </svg>`,

  // Password Reset - Shield lock icon (amber-orange gradient)
  passwordReset: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#lock_bg)"/>
    <path d="M22 28V25c0-5.523 4.477-10 10-10s10 4.477 10 10v3" stroke="white" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <rect x="20" y="28" width="24" height="18" rx="4" fill="white" opacity="0.95"/>
    <circle cx="32" cy="36" r="3" fill="url(#lock_dot)"/>
    <path d="M32 39v4" stroke="url(#lock_dot)" stroke-width="2.5" stroke-linecap="round"/>
    <defs>
      <linearGradient id="lock_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#f59e0b"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
      <linearGradient id="lock_dot" x1="29" y1="33" x2="35" y2="43"><stop stop-color="#f59e0b"/><stop offset="1" stop-color="#ea580c"/></linearGradient>
    </defs>
  </svg>`,

  // Invitation - Envelope with star (blue-cyan gradient)
  invitation: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#invite_bg)"/>
    <rect x="16" y="22" width="32" height="22" rx="3" fill="white" opacity="0.95"/>
    <path d="M16 25l16 11 16-11" stroke="url(#invite_line)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="44" cy="20" r="8" fill="#fbbf24"/>
    <path d="M44 15l1.5 3 3.5.5-2.5 2.5.5 3.5-3-1.5-3 1.5.5-3.5-2.5-2.5 3.5-.5z" fill="white"/>
    <defs>
      <linearGradient id="invite_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#06b6d4"/><stop offset="1" stop-color="#2553CB"/></linearGradient>
      <linearGradient id="invite_line" x1="16" y1="25" x2="48" y2="36"><stop stop-color="#06b6d4"/><stop offset="1" stop-color="#2553CB"/></linearGradient>
    </defs>
  </svg>`,

  // Clip Ready - Scissors cutting film strip (violet-pink gradient)
  clipReady: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#clip_bg)"/>
    <rect x="14" y="22" width="36" height="20" rx="3" fill="white" opacity="0.95"/>
    <rect x="14" y="22" width="8" height="20" rx="1" fill="white" opacity="0.5"/>
    <rect x="42" y="22" width="8" height="20" rx="1" fill="white" opacity="0.5"/>
    <rect x="17" y="25" width="2" height="4" rx="0.5" fill="url(#clip_hole)"/>
    <rect x="17" y="31" width="2" height="4" rx="0.5" fill="url(#clip_hole)"/>
    <rect x="17" y="37" width="2" height="4" rx="0.5" fill="url(#clip_hole)"/>
    <rect x="45" y="25" width="2" height="4" rx="0.5" fill="url(#clip_hole)"/>
    <rect x="45" y="31" width="2" height="4" rx="0.5" fill="url(#clip_hole)"/>
    <rect x="45" y="37" width="2" height="4" rx="0.5" fill="url(#clip_hole)"/>
    <path d="M28 28v8l8-4z" fill="url(#clip_play)"/>
    <circle cx="48" cy="18" r="8" fill="#fbbf24"/>
    <path d="M46 15.5l1.5 2 3-3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <defs>
      <linearGradient id="clip_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
      <linearGradient id="clip_hole" x1="17" y1="25" x2="19" y2="41"><stop stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
      <linearGradient id="clip_play" x1="28" y1="28" x2="36" y2="36"><stop stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient>
    </defs>
  </svg>`,

  // Verification - Mail with checkmark (blue gradient)
  verification: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#verify_bg)"/>
    <rect x="16" y="22" width="32" height="22" rx="3" fill="white" opacity="0.95"/>
    <path d="M16 25l16 11 16-11" stroke="url(#verify_line)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="44" cy="20" r="8" fill="#22c55e"/>
    <path d="M40.5 20l2.5 2.5 4.5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <defs>
      <linearGradient id="verify_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#2553CB"/></linearGradient>
      <linearGradient id="verify_line" x1="16" y1="25" x2="48" y2="36"><stop stop-color="#3b82f6"/><stop offset="1" stop-color="#2553CB"/></linearGradient>
    </defs>
  </svg>`,

  // Video Processed - Film reel with sparkle (teal-emerald gradient)
  videoProcessed: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#video_bg)"/>
    <rect x="18" y="20" width="28" height="24" rx="3" fill="white" opacity="0.95"/>
    <rect x="22" y="24" width="20" height="12" rx="1.5" fill="url(#video_screen)"/>
    <path d="M30 28v4l4-2z" fill="white"/>
    <circle cx="24" cy="40" r="2" fill="url(#video_screen)"/>
    <circle cx="32" cy="40" r="2" fill="url(#video_screen)"/>
    <circle cx="40" cy="40" r="2" fill="url(#video_screen)"/>
    <circle cx="46" cy="18" r="7" fill="#fbbf24"/>
    <path d="M46 13l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="white"/>
    <defs>
      <linearGradient id="video_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#14b8a6"/><stop offset="1" stop-color="#059669"/></linearGradient>
      <linearGradient id="video_screen" x1="22" y1="24" x2="42" y2="36"><stop stop-color="#14b8a6"/><stop offset="1" stop-color="#059669"/></linearGradient>
    </defs>
  </svg>`,

  // All Clips Ready - Clapperboard with download (emerald-green gradient)
  allClipsReady: `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="32" fill="url(#clips_bg)"/>
    <path d="M18 20h28l-4 8H18z" fill="white" opacity="0.7"/>
    <path d="M22 20l4 8M30 20l4 8M38 20l4 8" stroke="url(#clips_stripe)" stroke-width="1.5"/>
    <rect x="18" y="28" width="28" height="16" rx="2" fill="white" opacity="0.95"/>
    <circle cx="32" cy="36" r="6" fill="url(#clips_dl)"/>
    <path d="M32 33v5M30 36l2 2 2-2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <defs>
      <linearGradient id="clips_bg" x1="0" y1="0" x2="64" y2="64"><stop stop-color="#10b981"/><stop offset="1" stop-color="#047857"/></linearGradient>
      <linearGradient id="clips_stripe" x1="22" y1="20" x2="42" y2="28"><stop stop-color="#10b981"/><stop offset="1" stop-color="#047857"/></linearGradient>
      <linearGradient id="clips_dl" x1="26" y1="30" x2="38" y2="42"><stop stop-color="#10b981"/><stop offset="1" stop-color="#047857"/></linearGradient>
    </defs>
  </svg>`,
} as const;

/**
 * Helper to wrap an icon SVG in a centered container
 */
export function emailIcon(icon: string): string {
  return `<div style="text-align: center; margin-bottom: 24px;">${icon}</div>`;
}

/**
 * ScaleReach logo as a hosted <img> tag.
 * Inline SVGs are stripped by Gmail and most email clients — use a remote PNG/SVG URL instead.
 */
export const LOGO_SVG = `<img src="https://app.scalereach.ai/favicon.svg" alt="ScaleReach" width="36" height="36" style="display:block;border:0;outline:none;text-decoration:none;" />`;

/**
 * Generate the base email wrapper with header and footer
 */
export function baseTemplate(options: BaseTemplateOptions): string {
  const { preheaderText = '', content, footerText } = options;
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>ScaleReach</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media only screen and (max-width: 480px) {
      .base-wrapper { padding: 16px 8px !important; }
      .base-header { padding: 0 0 16px !important; }
      .base-content { padding: 20px 16px !important; }
      .base-footer { padding: 16px 0 0 !important; }
      .base-heading { font-size: 20px !important; }
      .base-subheading { font-size: 14px !important; }
      .base-body-text { font-size: 14px !important; line-height: 22px !important; }
      .base-info-box { padding: 12px !important; }
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .button { padding: 14px 28px !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: ${BRAND_COLORS.textPrimary};">
  ${preheaderText ? `
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${preheaderText}
    ${'&nbsp;'.repeat(100)}
  </div>
  ` : ''}

  <!-- Email wrapper -->
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" class="base-wrapper" style="padding: 40px 20px;">
        <!-- Email container -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td align="center" class="base-header" style="padding: 0 0 32px;">
              <table role="presentation" style="border-collapse: collapse;">
                <tr>
                  <td style="padding: 0;" align="center">
                    <!-- Logo + Brand -->
                    <table role="presentation" style="border-collapse: collapse;">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 10px;">
                          ${LOGO_SVG}
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 24px; font-weight: 700; color: ${BRAND_COLORS.textWhite}; letter-spacing: -0.5px;">
                            Scale<span style="color: ${BRAND_COLORS.primaryLight};">Reach</span>
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main content card -->
          <tr>
            <td>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgCard}; border: 1px solid ${BRAND_COLORS.border};">
                <tr>
                  <td class="base-content" style="padding: 40px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="base-footer" style="padding: 32px 0 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0;">
                    ${footerText ? `
                    <p style="margin: 0 0 16px; font-size: 13px; line-height: 20px; color: ${BRAND_COLORS.textMuted};">
                      ${footerText}
                    </p>
                    ` : ''}
                    <p style="margin: 0 0 8px; font-size: 12px; color: ${BRAND_COLORS.textDim};">
                      &copy; ${currentYear} ScaleReach. All rights reserved.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.textDim};">
                      Transform your long-form content into viral short clips.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generate a primary CTA button (brand blue on white)
 */
export function primaryButton(text: string, href: string): string {
  return `
<table role="presentation" style="border-collapse: collapse;">
  <tr>
    <td style="border-radius: 50px; background-color: ${BRAND_COLORS.primary};">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 50px; letter-spacing: -0.2px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Generate a secondary button (outline style)
 */
export function secondaryButton(text: string, href: string): string {
  return `
<table role="presentation" style="border-collapse: collapse;">
  <tr>
    <td style="border-radius: 50px; border: 1px solid ${BRAND_COLORS.border};">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 500; color: ${BRAND_COLORS.textSecondary}; text-decoration: none; border-radius: 50px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Generate a brand-colored CTA button (blue primary)
 */
export function brandButton(text: string, href: string): string {
  return `
<table role="presentation" style="border-collapse: collapse;">
  <tr>
    <td style="border-radius: 50px; background-color: ${BRAND_COLORS.primary};">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 50px; letter-spacing: -0.2px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Generate a divider line
 */
export function divider(): string {
  return `
<table role="presentation" style="width: 100%; border-collapse: collapse;">
  <tr>
    <td style="padding: 24px 0;">
      <div style="height: 1px; background-color: ${BRAND_COLORS.border};"></div>
    </td>
  </tr>
</table>`;
}

/**
 * Generate an info box/callout (light theme)
 */
export function infoBox(content: string, type: 'info' | 'success' | 'warning' = 'info'): string {
  const bgColors = {
    info: BRAND_COLORS.infoBg,
    success: BRAND_COLORS.successBg,
    warning: BRAND_COLORS.warningBg,
  };
  const borderColors = {
    info: BRAND_COLORS.infoBorder,
    success: BRAND_COLORS.successBorder,
    warning: BRAND_COLORS.warningBorder,
  };

  return `
<table role="presentation" style="width: 100%; border-collapse: collapse;">
  <tr>
    <td class="base-info-box" style="padding: 16px; background-color: ${bgColors[type]}; border: 1px solid ${borderColors[type]}; border-radius: 8px;">
      <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textSecondary};">
        ${content}
      </p>
    </td>
  </tr>
</table>`;
}
