/**
 * Base Email Template
 *
 * Provides a consistent wrapper layout for all ScaleReach emails.
 * Uses inline CSS for maximum email client compatibility.
 */

export interface BaseTemplateOptions {
  preheaderText?: string;
  content: string;
  footerText?: string;
}

/**
 * Brand colors used across all email templates
 */
export const BRAND_COLORS = {
  primary: '#18181b',
  primaryHover: '#27272a',
  textDark: '#18181b',
  textGray: '#52525b',
  textLight: '#71717a',
  textMuted: '#a1a1aa',
  linkBlue: '#3b82f6',
  border: '#e4e4e7',
  background: '#f4f4f5',
  white: '#ffffff',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

/**
 * Font stack for email templates
 */
export const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

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
  <title>ScaleReach</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .button { padding: 14px 28px !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: ${FONT_STACK}; background-color: ${BRAND_COLORS.background}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  ${preheaderText ? `
  <!-- Preheader text (hidden) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${preheaderText}
    ${'&nbsp;'.repeat(100)}
  </div>
  ` : ''}

  <!-- Email wrapper -->
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.background};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Email container -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding: 0 0 32px;">
              <table role="presentation" style="border-collapse: collapse;">
                <tr>
                  <td style="padding: 0;">
                    <!-- ScaleReach Logo/Brand -->
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: ${BRAND_COLORS.primary}; letter-spacing: -0.5px;">
                      Scale<span style="color: ${BRAND_COLORS.linkBlue};">Reach</span>
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main content card -->
          <tr>
            <td>
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.white}; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                <tr>
                  <td style="padding: 40px;">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 0;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 0;">
                    ${footerText ? `
                    <p style="margin: 0 0 16px; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textLight};">
                      ${footerText}
                    </p>
                    ` : ''}
                    <p style="margin: 0 0 8px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
                      &copy; ${currentYear} ScaleReach. All rights reserved.
                    </p>
                    <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
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
 * Generate a primary CTA button
 */
export function primaryButton(text: string, href: string): string {
  return `
<table role="presentation" style="border-collapse: collapse;">
  <tr>
    <td style="border-radius: 8px; background-color: ${BRAND_COLORS.primary};">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: ${BRAND_COLORS.white}; text-decoration: none; border-radius: 8px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

/**
 * Generate a secondary/outline button
 */
export function secondaryButton(text: string, href: string): string {
  return `
<table role="presentation" style="border-collapse: collapse;">
  <tr>
    <td style="border-radius: 8px; border: 2px solid ${BRAND_COLORS.border};">
      <a href="${href}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 500; color: ${BRAND_COLORS.textGray}; text-decoration: none; border-radius: 6px;">
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
 * Generate an info box/callout
 */
export function infoBox(content: string, type: 'info' | 'success' | 'warning' = 'info'): string {
  const bgColors = {
    info: '#eff6ff',
    success: '#f0fdf4',
    warning: '#fffbeb',
  };
  const borderColors = {
    info: '#bfdbfe',
    success: '#bbf7d0',
    warning: '#fde68a',
  };

  return `
<table role="presentation" style="width: 100%; border-collapse: collapse;">
  <tr>
    <td style="padding: 16px; background-color: ${bgColors[type]}; border: 1px solid ${borderColors[type]}; border-radius: 8px;">
      <p style="margin: 0; font-size: 14px; line-height: 20px; color: ${BRAND_COLORS.textGray};">
        ${content}
      </p>
    </td>
  </tr>
</table>`;
}
