/**
 * Email Templates Index
 *
 * Exports all email templates for use in the email service.
 */

// Base template and utilities
export {
  baseTemplate,
  primaryButton,
  secondaryButton,
  divider,
  infoBox,
  BRAND_COLORS,
  FONT_STACK,
  type BaseTemplateOptions,
} from './base.template';

// Welcome email
export {
  welcomeEmailTemplate,
  welcomeEmailSubject,
  type WelcomeEmailParams,
} from './welcome.template';

// Clip ready notification
export {
  clipReadyEmailTemplate,
  clipReadyEmailSubject,
  type ClipReadyEmailParams,
} from './clip-ready.template';

// Workspace invitation
export {
  invitationEmailTemplate,
  invitationEmailSubject,
  type InvitationEmailParams,
} from './invitation.template';

// Password reset
export {
  passwordResetEmailTemplate,
  passwordResetEmailSubject,
  type PasswordResetEmailParams,
} from './password-reset.template';
