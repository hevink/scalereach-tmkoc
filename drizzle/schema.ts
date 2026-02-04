import { pgTable, index, uniqueIndex, foreignKey, unique, text, timestamp, integer, boolean, jsonb, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const workspaceInvitation = pgTable("workspace_invitation", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	email: text().notNull(),
	role: text().default('member').notNull(),
	token: text().notNull(),
	invitedBy: text("invited_by").notNull(),
	status: text().default('pending').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	acceptedAt: timestamp("accepted_at", { mode: 'string' }),
}, (table) => [
	index("idx_invitation_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_invitation_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_invitation_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_invitation_workspaceId").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_invitation_workspace_email").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.email.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_invitation_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invitedBy],
			foreignColumns: [user.id],
			name: "workspace_invitation_invited_by_user_id_fk"
		}).onDelete("cascade"),
	unique("workspace_invitation_token_unique").on(table.token),
]);

export const creditPackage = pgTable("credit_package", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	credits: integer().notNull(),
	priceInCents: integer("price_in_cents").notNull(),
	polarProductId: text("polar_product_id").notNull(),
	isActive: integer("is_active").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("credit_package_polar_product_id_unique").on(table.polarProductId),
]);

export const creditTransaction = pgTable("credit_transaction", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	userId: text("user_id"),
	type: text().notNull(),
	amount: integer().notNull(),
	balanceAfter: integer("balance_after").notNull(),
	description: text(),
	metadata: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_credit_transaction_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_credit_transaction_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("idx_credit_transaction_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_credit_transaction_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "credit_transaction_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "credit_transaction_user_id_user_id_fk"
		}).onDelete("set null"),
]);

export const workspaceCredits = pgTable("workspace_credits", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	balance: integer().default(0).notNull(),
	lifetimeCredits: integer("lifetime_credits").default(0).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workspace_credits_workspace_id").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_credits_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	unique("workspace_credits_workspace_id_unique").on(table.workspaceId),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("idx_account_providerId").using("btree", table.providerId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_account_providerId_accountId").using("btree", table.providerId.asc().nullsLast().op("text_ops"), table.accountId.asc().nullsLast().op("text_ops")),
	index("idx_account_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const passkey = pgTable("passkey", {
	id: text().primaryKey().notNull(),
	name: text(),
	publicKey: text("public_key").notNull(),
	userId: text("user_id").notNull(),
	credentialId: text("credential_id").notNull(),
	counter: integer().default(0).notNull(),
	deviceType: text("device_type").notNull(),
	backedUp: boolean("backed_up").default(false).notNull(),
	transports: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	aaguid: text(),
}, (table) => [
	uniqueIndex("idx_passkey_credentialID").using("btree", table.credentialId.asc().nullsLast().op("text_ops")),
	index("idx_passkey_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_passkey_userId_createdAt").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_passkey_userId_credentialID").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.credentialId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "passkey_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("passkey_credential_id_unique").on(table.credentialId),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
}, (table) => [
	index("idx_session_expiresAt").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_session_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_session_token_expiresAt").using("btree", table.token.asc().nullsLast().op("timestamp_ops"), table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_session_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_session_userId_expiresAt").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.expiresAt.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const workspaceMember = pgTable("workspace_member", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	userId: text("user_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workspaceMember_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_workspaceMember_workspaceId").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_workspaceMember_workspaceId_userId").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "workspace_member_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "workspace_member_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_verification_expiresAt").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_verification_identifier").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
	index("idx_verification_identifier_value").using("btree", table.identifier.asc().nullsLast().op("text_ops"), table.value.asc().nullsLast().op("text_ops")),
	index("idx_verification_value").using("btree", table.value.asc().nullsLast().op("text_ops")),
]);

export const twoFactor = pgTable("twoFactor", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	secret: text(),
	backupCodes: text("backup_codes"),
}, (table) => [
	index("idx_twoFactor_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "twoFactor_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const workspace = pgTable("workspace", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	logo: text(),
	ownerId: text("owner_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workspace_ownerId").using("btree", table.ownerId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_workspace_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [user.id],
			name: "workspace_owner_id_user_id_fk"
		}).onDelete("cascade"),
	unique("workspace_slug_unique").on(table.slug),
]);

export const brandKit = pgTable("brand_kit", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	logoStorageKey: text("logo_storage_key"),
	logoUrl: text("logo_url"),
	colors: jsonb().notNull(),
	fontFamily: text("font_family").default('Inter').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_brandKit_workspaceId").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "brand_kit_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	unique("brand_kit_workspace_id_unique").on(table.workspaceId),
]);

export const captionStyle = pgTable("caption_style", {
	id: text().primaryKey().notNull(),
	clipId: text("clip_id").notNull(),
	templateId: text("template_id"),
	config: jsonb().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_captionStyle_clipId").using("btree", table.clipId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clipId],
			foreignColumns: [viralClip.id],
			name: "caption_style_clip_id_viral_clip_id_fk"
		}).onDelete("cascade"),
]);

export const batchExport = pgTable("batch_export", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	totalClips: integer("total_clips").notNull(),
	completedClips: integer("completed_clips").default(0).notNull(),
	failedClips: integer("failed_clips").default(0).notNull(),
	status: text().default('processing').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_batchExport_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_batchExport_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "batch_export_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const project = pgTable("project", {
	id: text().primaryKey().notNull(),
	workspaceId: text("workspace_id").notNull(),
	name: text().notNull(),
	description: text(),
	status: text().default('draft').notNull(),
	createdBy: text("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_project_createdBy").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	index("idx_project_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_project_workspaceId").using("btree", table.workspaceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspace.id],
			name: "project_workspace_id_workspace_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [user.id],
			name: "project_created_by_user_id_fk"
		}).onDelete("cascade"),
]);

export const videoExport = pgTable("video_export", {
	id: text().primaryKey().notNull(),
	clipId: text("clip_id").notNull(),
	userId: text("user_id").notNull(),
	batchExportId: text("batch_export_id"),
	format: text().notNull(),
	resolution: text().notNull(),
	storageKey: text("storage_key"),
	storageUrl: text("storage_url"),
	downloadUrl: text("download_url"),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
	fileSize: integer("file_size"),
	status: text().default('queued').notNull(),
	progress: integer().default(0).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_videoExport_batchExportId").using("btree", table.batchExportId.asc().nullsLast().op("text_ops")),
	index("idx_videoExport_clipId").using("btree", table.clipId.asc().nullsLast().op("text_ops")),
	index("idx_videoExport_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_videoExport_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clipId],
			foreignColumns: [viralClip.id],
			name: "video_export_clip_id_viral_clip_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "video_export_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.batchExportId],
			foreignColumns: [batchExport.id],
			name: "video_export_batch_export_id_batch_export_id_fk"
		}).onDelete("set null"),
]);

export const viralClip = pgTable("viral_clip", {
	id: text().primaryKey().notNull(),
	videoId: text("video_id").notNull(),
	startTime: integer("start_time").notNull(),
	endTime: integer("end_time").notNull(),
	score: integer().default(0).notNull(),
	reason: text(),
	transcript: text(),
	storageKey: text("storage_key"),
	storageUrl: text("storage_url"),
	thumbnailKey: text("thumbnail_key"),
	thumbnailUrl: text("thumbnail_url"),
	status: text().default('detected').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	duration: integer(),
	title: text(),
	viralityReason: text("virality_reason"),
	hooks: jsonb(),
	emotions: jsonb(),
	aspectRatio: text("aspect_ratio"),
	favorited: boolean().default(false).notNull(),
	errorMessage: text("error_message"),
}, (table) => [
	index("idx_viralClip_favorited").using("btree", table.favorited.asc().nullsLast().op("bool_ops")),
	index("idx_viralClip_score").using("btree", table.score.asc().nullsLast().op("int4_ops")),
	index("idx_viralClip_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_viralClip_videoId").using("btree", table.videoId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [video.id],
			name: "viral_clip_video_id_video_id_fk"
		}).onDelete("cascade"),
]);

export const video = pgTable("video", {
	id: text().primaryKey().notNull(),
	projectId: text("project_id"),
	sourceType: text("source_type").notNull(),
	sourceUrl: text("source_url"),
	storageKey: text("storage_key"),
	storageUrl: text("storage_url"),
	title: text(),
	duration: integer(),
	fileSize: integer("file_size"),
	mimeType: text("mime_type"),
	metadata: jsonb(),
	status: text().default('pending').notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	userId: text("user_id").notNull(),
	transcript: text(),
	transcriptWords: jsonb("transcript_words"),
	audioStorageKey: text("audio_storage_key"),
	audioStorageUrl: text("audio_storage_url"),
	transcriptLanguage: text("transcript_language"),
	transcriptConfidence: real("transcript_confidence"),
	creditsUsed: integer("credits_used").default(0).notNull(),
}, (table) => [
	index("idx_video_projectId").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("idx_video_sourceType").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	index("idx_video_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_video_userId").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [project.id],
			name: "video_project_id_project_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "video_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	username: text(),
	displayUsername: text("display_username"),
	twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
	isOnboarded: boolean("is_onboarded").default(false).notNull(),
	preferences: jsonb().default({}).notNull(),
	role: text(),
	primaryPlatforms: jsonb("primary_platforms").default([]),
}, (table) => [
	index("idx_user_id").using("btree", table.id.asc().nullsLast().op("text_ops")),
	index("idx_user_isOnboarded").using("btree", table.isOnboarded.asc().nullsLast().op("bool_ops")),
	unique("user_email_unique").on(table.email),
	unique("user_username_unique").on(table.username),
]);
