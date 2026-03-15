/**
 * Affiliate Notification Email Templates
 *
 * 1. New referral signup — sent to referrer when someone signs up via their link
 * 2. Commission earned — sent to referrer when their referral makes a payment
 */

import { primaryButton, BRAND_COLORS, FONT_STACK } from './base.template';

// ============================================================================
// New Referral Signup
// ============================================================================

export interface AffiliateNewReferralParams {
  referrerName: string;
  referredName: string;
  dashboardUrl: string;
}

export function affiliateNewReferralSubject(referredName: string): string {
  return `🎉 ${referredName} just signed up through your referral link`;
}

export function affiliateNewReferralTemplate(params: AffiliateNewReferralParams): string {
  const { referrerName, referredName, dashboardUrl } = params;
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Referral Signup</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 0 4px !important; }
      .content-section { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; color: ${BRAND_COLORS.textSecondary};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${referredName} signed up through your referral link. You'll earn 25% when they subscribe.
    ${'&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" class="email-wrapper" style="padding: 20px 20px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: separate; border-spacing: 0; overflow: hidden;">
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #22c55e, #6366f1); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="content-section" style="background-color: ${BRAND_COLORS.bgCard}; padding: 40px 40px 36px; text-align: center;">
              <div style="display: inline-block; width: 56px; height: 56px; background: linear-gradient(135deg, #22c55e20, #22c55e10); border-radius: 16px; line-height: 56px; margin-bottom: 20px;">
                <span style="font-size: 28px;">🎉</span>
              </div>

              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; letter-spacing: -0.3px;">
                New referral signup!
              </h1>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 22px; color: ${BRAND_COLORS.textSecondary};">
                Hey ${referrerName}, <strong style="color: ${BRAND_COLORS.textWhite};">${referredName}</strong> just signed up through your referral link. You'll earn 25% commission when they subscribe to any plan.
              </p>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    ${primaryButton('View Affiliate Dashboard', dashboardUrl)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height: 1px; background: ${BRAND_COLORS.border}; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 24px 20px 32px;">
        <p style="margin: 0 0 6px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">&copy; ${currentYear} ScaleReach. All rights reserved.</p>
        <p style="margin: 0; font-size: 11px; color: ${BRAND_COLORS.textMuted};">You're receiving this because someone used your referral link.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// Commission Earned
// ============================================================================

export interface AffiliateCommissionEarnedParams {
  referrerName: string;
  commissionAmount: string; // e.g. "$4.75"
  paymentAmount: string;    // e.g. "$19.00"
  planName: string;
  dashboardUrl: string;
}

export function affiliateCommissionEarnedSubject(commissionAmount: string): string {
  return `💰 You just earned ${commissionAmount} in affiliate commission`;
}

export function affiliateCommissionEarnedTemplate(params: AffiliateCommissionEarnedParams): string {
  const { referrerName, commissionAmount, paymentAmount, planName, dashboardUrl } = params;
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Commission Earned</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 0 4px !important; }
      .content-section { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', ${FONT_STACK}; background-color: ${BRAND_COLORS.bgBody}; -webkit-font-smoothing: antialiased; color: ${BRAND_COLORS.textSecondary};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    You earned ${commissionAmount} from a ${paymentAmount} payment on the ${planName} plan.
    ${'&nbsp;'.repeat(60)}
  </div>

  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: ${BRAND_COLORS.bgBody};">
    <tr>
      <td align="center" class="email-wrapper" style="padding: 20px 20px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: separate; border-spacing: 0; overflow: hidden;">
          <tr>
            <td style="height: 3px; background: linear-gradient(90deg, #f59e0b, #22c55e); font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <tr>
            <td class="content-section" style="background-color: ${BRAND_COLORS.bgCard}; padding: 40px 40px 36px; text-align: center;">
              <div style="display: inline-block; width: 56px; height: 56px; background: linear-gradient(135deg, #22c55e20, #22c55e10); border-radius: 16px; line-height: 56px; margin-bottom: 20px;">
                <span style="font-size: 28px;">💰</span>
              </div>

              <h1 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: ${BRAND_COLORS.textWhite}; letter-spacing: -0.3px;">
                Commission earned!
              </h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 22px; color: ${BRAND_COLORS.textSecondary};">
                Hey ${referrerName}, one of your referrals just made a payment.
              </p>

              <!-- Commission amount -->
              <div style="background-color: ${BRAND_COLORS.bgCardAlt}; border: 1px solid ${BRAND_COLORS.border}; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 4px; font-size: 13px; color: ${BRAND_COLORS.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">You earned</p>
                <p style="margin: 0 0 12px; font-size: 36px; font-weight: 700; color: #22c55e; letter-spacing: -1px;">${commissionAmount}</p>
                <p style="margin: 0; font-size: 13px; color: ${BRAND_COLORS.textSecondary};">
                  From a ${paymentAmount} payment on the <strong style="color: ${BRAND_COLORS.textWhite};">${planName}</strong> plan
                </p>
              </div>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center">
                    ${primaryButton('View Earnings', dashboardUrl)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="height: 1px; background: ${BRAND_COLORS.border}; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 24px 20px 32px;">
        <p style="margin: 0 0 6px; font-size: 12px; color: ${BRAND_COLORS.textMuted};">&copy; ${currentYear} ScaleReach. All rights reserved.</p>
        <p style="margin: 0; font-size: 11px; color: ${BRAND_COLORS.textMuted};">You're receiving this because you earned an affiliate commission.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
