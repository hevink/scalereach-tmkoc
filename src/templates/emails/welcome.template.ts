/**
 * Welcome Email Template
 *
 * Sent to users after successful signup to welcome them to ScaleReach.
 * Features hero background image matching scalereach.ai landing page.
 */

import { primaryButton, divider, BRAND_COLORS, FONT_STACK, LOGO_SVG } from './base.template';

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
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Welcome to ScaleReach</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: ${BRAND_COLORS.textPrimary};">
  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    Welcome to ScaleReach! Start creating viral clips from your videos today.
    ${'&nbsp;'.repeat(100)}
  </div>

  <!-- Email wrapper -->
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" style="padding: 32px 20px 0;">
        <!-- Logo -->
        <table role="presentation" style="border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="vertical-align: middle; padding-right: 10px;">
              ${LOGO_SVG}
            </td>
            <td style="vertical-align: middle;">
              <span style="font-size: 22px; font-weight: 700; color: ${BRAND_COLORS.textWhite}; letter-spacing: -0.5px;">
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
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: separate; border-spacing: 0; border-radius: 16px; border: 1px solid ${BRAND_COLORS.borderLight}; overflow: hidden;">

          <!-- Hero section with background image -->
          <tr>
            <td style="background-image: url('${HERO_BG}'); background-size: cover; background-position: center top; background-color: #0f1629;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
              <v:fill type="frame" src="${HERO_BG}" />
              <v:textbox style="mso-fit-shape-to-text:true" inset="0,0,0,0">
              <![endif]-->
              <div style="background: linear-gradient(180deg, rgba(10,10,11,0.3) 0%, rgba(10,10,11,0.6) 40%, rgba(10,10,11,0.95) 85%, rgba(20,20,22,1) 100%); padding: 56px 40px 48px;">

                <!-- Sparkle accent -->
                <div style="text-align: center; margin-bottom: 20px;">
                  <span style="font-size: 36px;">&#10024;</span>
                </div>

                <!-- Hero heading -->
                <h1 style="margin: 0 0 12px; font-size: 36px; font-weight: 700; color: ${BRAND_COLORS.white}; font-family: ${FONT_STACK}; text-align: center; letter-spacing: -1px; line-height: 1.15;">
                  Welcome to ScaleReach!
                </h1>
                <p style="margin: 0 0 32px; font-size: 17px; line-height: 26px; color: rgba(255,255,255,0.65); text-align: center;">
                  Hey ${userName}, you just unlocked the fastest way to turn<br>long-form videos into viral short clips.
                </p>

                <!-- CTA Button -->
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td align="center">
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
            <td style="background-color: ${BRAND_COLORS.bgCard}; padding: 36px 40px 40px;">

              <!-- How it works heading -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: ${BRAND_COLORS.primaryLight};">
                      How it works
                    </p>
                    <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: ${BRAND_COLORS.textWhite}; letter-spacing: -0.5px;">
                      Three steps to viral clips
                    </h2>
                  </td>
                </tr>
              </table>

              <!-- Feature 1 -->
              <table role="presentation" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 12px; background-color: ${BRAND_COLORS.bgMuted}; border: 1px solid ${BRAND_COLORS.border}; border-radius: 10px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 44px; vertical-align: top; padding-right: 14px;">
                          <div style="width: 38px; height: 38px; background: linear-gradient(135deg, #6366f1, #2553CB); border-radius: 10px; text-align: center; line-height: 38px;">
                            <span style="font-size: 16px; color: white; font-weight: 700;">1</span>
                          </div>
                        </td>
                        <td style="vertical-align: center;">
                          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                            Upload or Import Videos
                          </p>
                          <p style="margin: 0; font-size: 13px; line-height: 19px; color: ${BRAND_COLORS.textMuted};">
                            Import from YouTube or upload files up to 4 hours long.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 2 -->
              <table role="presentation" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 12px; background-color: ${BRAND_COLORS.bgMuted}; border: 1px solid ${BRAND_COLORS.border}; border-radius: 10px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 44px; vertical-align: top; padding-right: 14px;">
                          <div style="width: 38px; height: 38px; background: linear-gradient(135deg, #22c55e, #059669); border-radius: 10px; text-align: center; line-height: 38px;">
                            <span style="font-size: 16px; color: white; font-weight: 700;">2</span>
                          </div>
                        </td>
                        <td style="vertical-align: center;">
                          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                            AI Detects Viral Moments
                          </p>
                          <p style="margin: 0; font-size: 13px; line-height: 19px; color: ${BRAND_COLORS.textMuted};">
                            Our AI identifies the most engaging clips automatically.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Feature 3 -->
              <table role="presentation" style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 4px; background-color: ${BRAND_COLORS.bgMuted}; border: 1px solid ${BRAND_COLORS.border}; border-radius: 10px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 44px; vertical-align: top; padding-right: 14px;">
                          <div style="width: 38px; height: 38px; background: linear-gradient(135deg, #f59e0b, #ea580c); border-radius: 10px; text-align: center; line-height: 38px;">
                            <span style="font-size: 16px; color: white; font-weight: 700;">3</span>
                          </div>
                        </td>
                        <td style="vertical-align: center;">
                          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">
                            Export with Captions
                          </p>
                          <p style="margin: 0; font-size: 13px; line-height: 19px; color: ${BRAND_COLORS.textMuted};">
                            Beautiful caption templates, any aspect ratio, ready to share.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${divider()}

              <!-- Help section -->
              <p style="margin: 0; font-size: 14px; line-height: 22px; color: ${BRAND_COLORS.textMuted}; text-align: center;">
                Questions? Check our
                <a href="${dashboardUrl}/docs" style="color: ${BRAND_COLORS.linkBlue}; text-decoration: none;">docs</a>
                or just reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td align="center" style="padding: 28px 20px 40px;">
        <p style="margin: 0 0 6px; font-size: 12px; line-height: 18px; color: ${BRAND_COLORS.textDim};">
          You're receiving this because you signed up for ScaleReach.
        </p>
        <p style="margin: 0; font-size: 11px; color: ${BRAND_COLORS.textDim};">
          &copy; ${currentYear} ScaleReach. All rights reserved.
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
