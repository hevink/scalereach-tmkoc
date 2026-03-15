/**
 * Affiliate Program Launch Email Template
 *
 * Sent to all existing users to announce the affiliate program.
 */

import { primaryButton, BRAND_COLORS, FONT_STACK } from './base.template';

export interface AffiliateLaunchEmailParams {
  userName: string;
  referralLink: string;
  referralCode: string;
}

export function affiliateLaunchEmailSubject(): string {
  return "Earn 25% lifetime commission — ScaleReach Affiliate Program is live";
}

export function affiliateLaunchEmailTemplate(params: AffiliateLaunchEmailParams): string {
  const { userName, referralLink, referralCode } = params;
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
  <title>ScaleReach Affiliate Program</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 0 4px !important; }
      .hero-section { padding: 28px 16px !important; }
      .content-section { padding: 24px 16px !important; }
      .feature-card { padding: 14px !important; }
      .footer-section { padding: 16px 12px 24px !important; }
      .hero-title { font-size: 24px !important; }
      .hero-subtitle { font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; color: ${BRAND_COLORS.textSecondary};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    You can now earn 25% lifetime commission on every referral. Your link is ready.
    ${'&nbsp;'.repeat(80)}
  </div>

  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" class="email-wrapper" style="padding: 20px 20px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: separate; border-spacing: 0; overflow: hidden;">

          <!-- Accent line -->
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #22c55e, #6366f1, #f59e0b); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="hero-section" style="background-color: ${BRAND_COLORS.bgCard}; padding: 48px 40px 36px; text-align: center;">
              <div style="display: inline-block; background: linear-gradient(135deg, #22c55e20, #22c55e10); border: 1px solid #22c55e30; border-radius: 20px; padding: 6px 16px; margin-bottom: 20px;">
                <span style="font-size: 13px; color: #22c55e; font-weight: 600;">New Feature</span>
              </div>

              <h1 class="hero-title" style="margin: 0 0 12px; font-size: 28px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; font-family: 'Inter', ${FONT_STACK}; letter-spacing: -0.5px; line-height: 1.2;">
                Earn 25% on every referral.<br>For life.
              </h1>
              <p class="hero-subtitle" style="margin: 0 0 28px; font-size: 15px; line-height: 22px; color: ${BRAND_COLORS.textSecondary};">
                Hi ${userName}, we just launched our affiliate program. Share ScaleReach with your audience and earn 25% lifetime commission on every payment they make.
              </p>

              ${primaryButton('View Your Affiliate Dashboard', referralLink.replace(/\/r\/.*/, '/affiliate'))}
            </td>
          </tr>

          <!-- Referral link section -->
          <tr>
            <td style="background-color: ${BRAND_COLORS.bgCard}; border-top: 1px solid ${BRAND_COLORS.border}; padding: 28px 40px; text-align: center;" class="content-section">
              <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">
                Your referral link
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 14px 18px; border-radius: 8px;">
                    <a href="${referralLink}" style="font-family: 'Courier New', monospace; font-size: 14px; color: ${BRAND_COLORS.primaryLight}; text-decoration: none; word-break: break-all;">
                      ${referralLink}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- How it works -->
          <tr>
            <td style="background-color: ${BRAND_COLORS.bgCard}; border-top: 1px solid ${BRAND_COLORS.border}; padding: 32px 40px;" class="content-section">
              <h2 style="margin: 0 0 20px; font-size: 18px; font-weight: 500; color: ${BRAND_COLORS.textWhite}; text-align: center;">
                How it works
              </h2>

              <!-- Step 1 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 16px 20px;" class="feature-card">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 48px; vertical-align: middle; padding-right: 16px;">
                          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #34d399, #22c55e); text-align: center; line-height: 40px; border-radius: 10px;">
                            <span style="font-size: 17px; color: white; font-weight: 700;">1</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">Share your link</p>
                          <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.textSecondary};">Post it on social media, your newsletter, or send it to friends.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Step 2 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 16px 20px;" class="feature-card">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 48px; vertical-align: middle; padding-right: 16px;">
                          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #818cf8, #6366f1); text-align: center; line-height: 40px; border-radius: 10px;">
                            <span style="font-size: 17px; color: white; font-weight: 700;">2</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">They sign up & subscribe</p>
                          <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.textSecondary};">When someone signs up through your link and subscribes to any plan.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Step 3 -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; padding: 16px 20px;" class="feature-card">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="width: 48px; vertical-align: middle; padding-right: 16px;">
                          <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #fbbf24, #f59e0b); text-align: center; line-height: 40px; border-radius: 10px;">
                            <span style="font-size: 17px; color: white; font-weight: 700;">3</span>
                          </div>
                        </td>
                        <td style="vertical-align: middle;">
                          <p style="margin: 0 0 2px; font-size: 15px; font-weight: 600; color: ${BRAND_COLORS.textWhite};">You earn 25% — forever</p>
                          <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.textSecondary};">Every payment they make, you get 25%. No cap, no expiry.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Bottom accent -->
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
          You're receiving this because you have a ScaleReach account.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
