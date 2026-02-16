/**
 * Welcome Email Template
 *
 * Sent to users after successful signup to welcome them to ScaleReach.
 * Light/white theme with hero background image.
 */

import { primaryButton, BRAND_COLORS, FONT_STACK } from './base.template';

export interface WelcomeEmailParams {
  userName: string;
  dashboardUrl: string;
}

const HERO_BG = 'https://framerusercontent.com/images/x1ioW6hoCO0EWJfApnLyqDWxrs.png?scale-down-to=4096&width=6740&height=3332';

/**
 * Generate the welcome email HTML (custom layout with hero)
 */
export function welcomeEmailTemplate(params: WelcomeEmailParams): string {
  const { userName, dashboardUrl } = params;
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
  <title>Welcome to ScaleReach</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 0 4px !important; }
      .hero-section { padding: 28px 16px 28px !important; }
      .content-section { padding: 24px 16px !important; }
      .feature-card { padding: 14px !important; }
      .footer-section { padding: 16px 12px 24px !important; }
      .hero-title { font-size: 26px !important; }
      .hero-subtitle { font-size: 14px !important; margin-bottom: 20px !important; }
      .hero-logo { margin-bottom: 16px !important; }
      .hero-logo svg { width: 44px !important; height: 44px !important; }
      .section-title { font-size: 18px !important; margin-bottom: 16px !important; }
      .feature-title { font-size: 14px !important; }
      .feature-desc { font-size: 12px !important; }
      .feature-icon { width: 36px !important; height: 36px !important; line-height: 36px !important; }
      .feature-icon-cell { width: 42px !important; padding-right: 12px !important; }
    }
  </style>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .button { padding: 14px 28px !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: ${BRAND_COLORS.textSecondary};">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Welcome to ScaleReach! Start creating viral clips from your videos today.
    ${'&nbsp;'.repeat(100)}
  </div>

  <!-- Email wrapper -->
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" class="email-wrapper" style="padding: 20px 20px 0;">
        <!-- Main container -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: separate; border-spacing: 0; overflow: hidden;">

          <!-- Brand accent line -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #6366f1, ${BRAND_COLORS.primary}, #22c55e); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Hero section with background image -->
          <tr>
            <td style="background-image: url('${HERO_BG}'); background-size: cover; background-position: center; background-color: #1a1a2e;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
              <v:fill type="frame" src="${HERO_BG}" />
              <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
              <![endif]-->
              <div class="hero-section" style="background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(10,10,11,0.65) 50%, rgba(10,10,11,0.97) 100%); padding: 52px 40px 44px;">
                <!-- Logo -->
                <div class="hero-logo" style="text-align: center; margin-bottom: 20px;">
                  <svg width="52" height="52" viewBox="3 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#cw)"><rect x="3" width="48" height="48" rx="12" fill="#2553CB"/><rect width="48" height="48" transform="translate(3)" fill="url(#aw)"/><g><rect opacity="0.8" x="15.45" y="20.4" width="7.2" height="7.2" fill="url(#bw1)"/><rect opacity="0.8" x="38.55" y="27.6" width="7.2" height="7.2" transform="rotate(180 38.55 27.6)" fill="url(#bw2)"/><path opacity="0.2" d="M22.65 20.4L31.35 13.2V20.4L22.65 27.6V20.4Z" fill="url(#bw3)"/><path opacity="0.4" d="M31.35 27.6L22.65 34.8V27.6L31.35 20.4V27.6Z" fill="url(#bw4)"/><path opacity="0.6" d="M15.45 20.4L31.35 6V13.2L22.65 20.4H15.45Z" fill="url(#bw5)"/><path opacity="0.7" d="M38.55 27.6L22.65 42V34.8L31.35 27.6H38.55Z" fill="url(#bw6)"/></g></g><rect x="4" y="1" width="46" height="46" rx="11" stroke="url(#sw)" stroke-width="2"/><defs><linearGradient id="aw" x1="24" y1="0" x2="26" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="white" stop-opacity="0.12"/></linearGradient><linearGradient id="bw1" x1="19" y1="20.4" x2="19" y2="27.6" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.8"/><stop offset="1" stop-color="white" stop-opacity="0.5"/></linearGradient><linearGradient id="bw2" x1="42" y1="27.6" x2="42" y2="34.8" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.8"/><stop offset="1" stop-color="white" stop-opacity="0.5"/></linearGradient><linearGradient id="bw3" x1="27" y1="13.2" x2="27" y2="27.6" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.8"/><stop offset="1" stop-color="white" stop-opacity="0.5"/></linearGradient><linearGradient id="bw4" x1="27" y1="34.8" x2="27" y2="20.4" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.8"/><stop offset="1" stop-color="white" stop-opacity="0.5"/></linearGradient><linearGradient id="bw5" x1="23.4" y1="6" x2="23.4" y2="20.4" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.8"/><stop offset="1" stop-color="white" stop-opacity="0.5"/></linearGradient><linearGradient id="bw6" x1="30.6" y1="42" x2="30.6" y2="27.6" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.8"/><stop offset="1" stop-color="white" stop-opacity="0.5"/></linearGradient><linearGradient id="sw" x1="27" y1="0" x2="27" y2="48" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity="0.12"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><clipPath id="cw"><rect x="3" width="48" height="48" rx="12" fill="white"/></clipPath></defs></svg>
                </div>

                <!-- Hero heading -->
                <h1 class="hero-title" style="margin: 0 0 10px; font-size: 30px; font-weight: 400; color: #ffffff; font-family: 'Inter', ${FONT_STACK}; text-align: center; letter-spacing: -0.5px; line-height: 1.2;">
                  Welcome to Scale<span style="color: ${BRAND_COLORS.primaryLight};">Reach</span>
                </h1>
                <p class="hero-subtitle" style="margin: 0 0 32px; font-size: 16px; line-height: 24px; color: rgba(255,255,255,0.6); text-align: center;">
                  Hi ${userName}, you're all set to turn long videos into viral clips.
                </p>

                <!-- CTA Button -->
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td align="center" style="padding-bottom: 8px;">
                      ${primaryButton('Go to Dashboard', dashboardUrl)}
                    </td>
                  </tr>
                </table>
              </div>
              <!--[if gte mso 9]>
              </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Content section -->
          <tr>
            <td class="content-section" style="background-color: ${BRAND_COLORS.bgCard}; border-top: 1px solid ${BRAND_COLORS.border}; padding: 36px 40px;">

              <!-- Section heading -->
              <h2 class="section-title" style="margin: 0 0 20px; font-size: 20px; font-weight: 400; color: ${BRAND_COLORS.textWhite}; font-family: 'Inter', ${FONT_STACK}; letter-spacing: -0.3px; text-align: center;">
                Three steps to your first clip
              </h2>

              <!-- Feature 1 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 16px 20px;" class="feature-card">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td class="feature-icon-cell" style="width: 48px; vertical-align: middle; padding-right: 16px;">
                          <div class="feature-icon" style="width: 40px; height: 40px; background: linear-gradient(135deg, #818cf8, #6366f1); text-align: center; line-height: 40px;">
                            <span style="font-size: 17px; color: white; font-weight: 700;">1</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <p class="feature-title" style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                            Upload or Import
                          </p>
                          <p class="feature-desc" style="margin: 0; font-size: 13px; line-height: 18px; color: ${BRAND_COLORS.textSecondary};">
                            Paste a YouTube link or upload videos up to 4 hours.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 16px 20px;" class="feature-card">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td class="feature-icon-cell" style="width: 48px; vertical-align: middle; padding-right: 16px;">
                          <div class="feature-icon" style="width: 40px; height: 40px; background: linear-gradient(135deg, #34d399, #22c55e); text-align: center; line-height: 40px;">
                            <span style="font-size: 17px; color: white; font-weight: 700;">2</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <p class="feature-title" style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                            AI Finds Viral Moments
                          </p>
                          <p class="feature-desc" style="margin: 0; font-size: 13px; line-height: 18px; color: ${BRAND_COLORS.textSecondary};">
                            We analyze your content and pick the best clips automatically.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 16px 20px;" class="feature-card">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td class="feature-icon-cell" style="width: 48px; vertical-align: middle; padding-right: 16px;">
                          <div class="feature-icon" style="width: 40px; height: 40px; background: linear-gradient(135deg, #fbbf24, #f59e0b); text-align: center; line-height: 40px;">
                            <span style="font-size: 17px; color: white; font-weight: 700;">3</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <p class="feature-title" style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                            Export with Captions
                          </p>
                          <p class="feature-desc" style="margin: 0; font-size: 13px; line-height: 18px; color: ${BRAND_COLORS.textSecondary};">
                            Style your captions and export in any aspect ratio.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Bottom accent line -->
          <tr>
            <td style="height: 1px; background: ${BRAND_COLORS.border}; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td align="center" class="footer-section" style="padding: 24px 20px 32px;">
        <p style="margin: 0 0 6px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">
          &copy; ${currentYear} ScaleReach. All rights reserved.
        </p>
        <p style="margin: 0; font-size: 11px; color: ${BRAND_COLORS.textMuted};">
          You're receiving this because you signed up for ScaleReach.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Get the subject line for the welcome email
 */
export function welcomeEmailSubject(): string {
  return "Welcome to ScaleReach - Let's create viral content!";
}
