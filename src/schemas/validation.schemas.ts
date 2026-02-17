/**
 * Zod Validation Schemas
 *
 * Centralized validation schemas for all API endpoints.
 * Ensures consistent validation across the application.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Common ID parameter schema (nanoid format)
 */
export const idParamSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

/**
 * Pagination query schema
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// ============================================================================
// User Schemas
// ============================================================================

export const createUserSchema = z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  email: z.string().email("Invalid email address"),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  image: z.string().url().optional().nullable().transform(val => val ?? undefined),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens").optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});

export const uploadAvatarSchema = z.object({
  image: z.string().min(1, "Image is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const checkUsernameQuerySchema = z.object({
  username: z.string().min(1, "Username is required"),
});

export const checkEmailQuerySchema = z.object({
  email: z.string().email("Invalid email address"),
});

// ============================================================================
// Workspace Schemas
// ============================================================================

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  slug: z.string()
    .min(1, "Slug is required")
    .max(50, "Slug is too long")
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  description: z.string().max(500).optional(),
  logo: z.string().url().optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).optional(),
  logo: z.string().url().optional().nullable().transform(val => val ?? undefined),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});

export const slugParamSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
});

export const addWorkspaceMemberSchema = z.object({
  id: z.string().min(1, "ID is required"),
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(["owner", "admin", "member"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const uploadLogoSchema = z.object({
  logo: z.string().min(1, "Logo is required"),
});

// ============================================================================
// Project Schemas
// ============================================================================

export const createProjectSchema = z.object({
  workspaceId: z.string().min(1, "Workspace ID is required"),
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  description: z.string().max(500).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable().transform(val => val ?? undefined),
}).refine(data => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});

// ============================================================================
// Video Schemas
// ============================================================================

export const submitYouTubeUrlSchema = z.object({
  youtubeUrl: z.string().url("Invalid URL").refine(
    (url) => {
      const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)/;
      return youtubeRegex.test(url);
    },
    { message: "Invalid YouTube URL" }
  ),
  projectId: z.string().optional(),
  workspaceSlug: z.string().optional(),
  config: z.object({
    skipClipping: z.boolean().optional(),
    clipModel: z.enum(["ClipBasic", "ClipPro"]).optional(),
    genre: z.string().optional(),
    clipDurationMin: z.number().int().min(0).max(180).optional(),
    clipDurationMax: z.number().int().min(0).max(180).optional(),
    timeframeStart: z.number().min(0).optional(),
    timeframeEnd: z.number().min(0).nullable().optional(),
    enableAutoHook: z.boolean().optional(),
    customPrompt: z.string().max(1000).optional(),
    topicKeywords: z.array(z.string()).optional(),
    captionTemplateId: z.string().optional(),
    aspectRatio: z.enum(["9:16", "1:1", "16:9"]).optional(),
    enableWatermark: z.boolean().optional(),
  }).optional(),
});

export const validateYouTubeUrlQuerySchema = z.object({
  url: z.string().url("URL is required"),
});

// ============================================================================
// Video Config Schemas
// ============================================================================

export const videoConfigSchema = z.object({
  skipClipping: z.boolean().default(false),
  clipModel: z.enum(["ClipBasic", "ClipPro"]).default("ClipBasic"),
  genre: z.string().default("Auto"),
  clipDurationMin: z.number().int().min(0).max(180).default(0),
  clipDurationMax: z.number().int().min(5).max(180).default(180),
  timeframeStart: z.number().min(0).default(0),
  timeframeEnd: z.number().min(0).nullable().default(null),
  enableAutoHook: z.boolean().default(true),
  customPrompt: z.string().max(1000).default(""),
  topicKeywords: z.array(z.string()).default([]),
  captionTemplateId: z.string().default("karaoke"),
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  enableWatermark: z.boolean().default(true),
});

export const updateVideoConfigSchema = videoConfigSchema.partial().refine(
  data => Object.keys(data).length > 0,
  { message: "At least one field must be provided for update" }
);

// ============================================================================
// Clip Schemas
// ============================================================================

export const updateClipBoundariesSchema = z.object({
  startTime: z.number().min(0, "Start time cannot be negative").optional(),
  endTime: z.number().min(0, "End time cannot be negative").optional(),
}).refine(
  data => data.startTime !== undefined || data.endTime !== undefined,
  { message: "At least one of startTime or endTime must be provided" }
);

export const generateClipSchema = z.object({
  aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
  quality: z.enum(["720p", "1080p", "4k"]).default("1080p"),
});

export const downloadClipQuerySchema = z.object({
  expiresIn: z.coerce.number().int().min(60).max(604800).default(3600), // 1 hour default, max 7 days
});

// ============================================================================
// Export Schemas
// ============================================================================

export const initiateExportSchema = z.object({
  options: z.object({
    format: z.enum(["mp4", "webm"]).default("mp4"),
    resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  }).optional(),
});

export const batchExportSchema = z.object({
  clipIds: z.array(z.string().min(1)).min(1, "At least one clip ID is required"),
  options: z.object({
    format: z.enum(["mp4", "webm"]).default("mp4"),
    resolution: z.enum(["720p", "1080p", "4k"]).default("1080p"),
  }).optional(),
});

// ============================================================================
// Invitation Schemas
// ============================================================================

export const createInvitationSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["admin", "member"]).default("member"),
});

export const tokenParamSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// ============================================================================
// Credit Schemas
// ============================================================================

export const addCreditsSchema = z.object({
  amount: z.number().int().positive("Amount must be a positive integer"),
  reason: z.string().min(1, "Reason is required").max(255),
});

// ============================================================================
// Caption Schemas
// ============================================================================

export const platformQuerySchema = z.object({
  platform: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type SubmitYouTubeUrlInput = z.infer<typeof submitYouTubeUrlSchema>;
export type VideoConfigInput = z.infer<typeof videoConfigSchema>;
export type UpdateClipBoundariesInput = z.infer<typeof updateClipBoundariesSchema>;
export type GenerateClipInput = z.infer<typeof generateClipSchema>;
export type InitiateExportInput = z.infer<typeof initiateExportSchema>;
export type BatchExportInput = z.infer<typeof batchExportSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
