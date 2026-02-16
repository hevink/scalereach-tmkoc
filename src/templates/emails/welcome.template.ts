/**
 * Welcome Email Template
 *
 * Sent to users after successful signup to welcome them to ScaleReach.
 * Features hero background image matching scalereach.ai landing page.
 */

import { baseTemplate, primaryButton, divider, BRAND_COLORS, FONT_STACK, EMAIL_ICONS, emailIcon, LOGO_SVG } from './base.template';

export interface WelcomeEmailParams {
  userName: string;
  dashboardUrl: string;
}

const HERO_BG = 'https://framerusercontent.com/images/x1ioW6hoCO0EWJfApnLyqDWxrs.png?scale-down-to=4096&width=6740&height=3332';

/**
 * Font stack with Geist + Cooper for welcome email
 */
const HEADING_FONT = "Cooper, Georgia, 'Times New Roman', serif";

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
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Welcome to ScaleReach</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  </style>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .button { padding: 14px 28px !important; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: ${BRAND_COLORS.textPrimary};">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Welcome to ScaleReach! Start creating viral clips from your videos today.
    ${'&nbsp;'.repeat(100)}
  </div>

  <!-- Email wrapper -->
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" style="padding: 40px 20px 0;">
        <!-- Logo -->
        <table role="presentation" style="border-collapse: collapse; margin-bottom: 32px;">
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
    <tr>
      <td align="center" style="padding: 0 20px;">
        <!-- Main container -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: separate; border-spacing: 0; border-radius: 16px; border: 1px solid ${BRAND_COLORS.border}; overflow: hidden;">

          <!-- Hero section with background image -->
          <tr>
            <td style="background-image: url('${HERO_BG}'); background-size: cover; background-position: center; background-color: #1a1a2e;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
              <v:fill type="frame" src="${HERO_BG}" />
              <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
              <![endif]-->
              <div style="background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(10,10,11,0.7) 60%, rgba(10,10,11,0.95) 100%); padding: 48px 40px 40px;">
                <!-- Welcome icon -->
                <div style="text-align: center; margin-bottom: 24px;">
                  ${EMAIL_ICONS.welcome}
                </div>

                <!-- Hero heading -->
                <h1 style="margin: 0 0 8px; font-size: 32px; font-weight: 300; color: ${BRAND_COLORS.white}; font-family: ${HEADING_FONT}; text-align: center; letter-spacing: -0.5px; line-height: 1.2;">
                  Welcome to ScaleReach
                </h1>
                <p style="margin: 0 0 28px; font-size: 17px; line-height: 26px; color: rgba(255,255,255,0.7); text-align: center;">
                  Hi ${userName}, we're excited to have you on board.
                </p>

                <!-- CTA Button -->
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td align="center" style="padding-bottom: 8px;">
                      ${primaryButton('Get Started', dashboardUrl)}
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
            <td style="background-color: ${BRAND_COLORS.bgCard}; padding: 40px;">

              <!-- Main message -->
              <p style="margin: 0 0 28px; font-size: 16px; line-height: 26px; color: ${BRAND_COLORS.textSecondary};">
                ScaleReach helps you transform your long-form videos into viral short clips automatically.
                Our AI-powered platform detects the most engaging moments and creates ready-to-share content
                for TikTok, Instagram Reels, and YouTube Shorts.
              </p>

              ${divider()}

              <!-- Features section -->
              <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 300; color: ${BRAND_COLORS.textWhite}; font-family: ${HEADING_FONT}; letter-spacing: -0.3px;">
                What you can do:
              </h2>

              <!-- Feature 1 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                  <td style="width: 44px; vertical-align: top; padding-right: 14px;">
                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #6366f1, #2553CB); border-radius: 10px; text-align: center; line-height: 36px;">
                      <span style="font-size: 16px; color: white; font-weight: 700;">1</span>
                    </div>
                  </td>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                      Upload or Import Videos
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 21px; color: ${BRAND_COLORS.textMuted};">
                      Import from YouTube or upload your own video files up to 4 hours long.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                  <td style="width: 44px; vertical-align: top; padding-right: 14px;">
                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #22c55e, #059669); border-radius: 10px; text-align: center; line-height: 36px;">
                      <span style="font-size: 16px; color: white; font-weight: 700;">2</span>
                    </div>
                  </td>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                      AI Detects Viral Moments
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 21px; color: ${BRAND_COLORS.textMuted};">
                      Our AI analyzes your content and identifies the most engaging clips automatically.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="width: 44px; vertical-align: top; padding-right: 14px;">
                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 10px; text-align: center; line-height: 36px;">
                      <span style="font-size: 16px; color: white; font-weight: 700;">3</span>
                    </div>
                  </td>
                  <td style="vertical-align: top;">
                    <p style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                      Export with Captions
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 21px; color: ${BRAND_COLORS.textMuted};">
                      Customize captions with beautiful templates and export in any aspect ratio.
                    </p>
                  </td>
                </tr>
              </table>

              ${divider()}

              <!-- Help section -->
              <p style="margin: 0; font-size: 14px; line-height: 22px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
                Need help getting started? Check out our
                <a href="${dashboardUrl}/docs" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none;">documentation</a>
                or reply to this email — we're here to help!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td align="center" style="padding: 32px 20px 40px;">
        <p style="margin: 0 0 8px; font-size: 13px; line-height: 20px; color: ${BRAND_COLORS.textMuted};">
          You're receiving this email because you signed up for ScaleReach.
        </p>
        <p style="margin: 0 0 8px; font-size: 12px; color: ${BRAND_COLORS.textDim};">
          &copy; ${currentYear} ScaleReach. All rights reserved.
        </p>
        <p style="margin: 0; font-size: 12px; color: ${BRAND_COLORS.textDim};">
          Transform your long-form content into viral short clips.
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
