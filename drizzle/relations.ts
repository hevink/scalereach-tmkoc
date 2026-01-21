import { relations } from "drizzle-orm/relations";
import { workspace, workspaceInvitation, user, creditTransaction, workspaceCredits, account, passkey, session, workspaceMember, twoFactor, brandKit, viralClip, captionStyle, batchExport, project, videoExport, video } from "./schema";

export const workspaceInvitationRelations = relations(workspaceInvitation, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceInvitation.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceInvitation.invitedBy],
		references: [user.id]
	}),
}));

export const workspaceRelations = relations(workspace, ({one, many}) => ({
	workspaceInvitations: many(workspaceInvitation),
	creditTransactions: many(creditTransaction),
	workspaceCredits: many(workspaceCredits),
	workspaceMembers: many(workspaceMember),
	user: one(user, {
		fields: [workspace.ownerId],
		references: [user.id]
	}),
	brandKits: many(brandKit),
	projects: many(project),
}));

export const userRelations = relations(user, ({many}) => ({
	workspaceInvitations: many(workspaceInvitation),
	creditTransactions: many(creditTransaction),
	accounts: many(account),
	passkeys: many(passkey),
	sessions: many(session),
	workspaceMembers: many(workspaceMember),
	twoFactors: many(twoFactor),
	workspaces: many(workspace),
	batchExports: many(batchExport),
	projects: many(project),
	videoExports: many(videoExport),
	videos: many(video),
}));

export const creditTransactionRelations = relations(creditTransaction, ({one}) => ({
	workspace: one(workspace, {
		fields: [creditTransaction.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [creditTransaction.userId],
		references: [user.id]
	}),
}));

export const workspaceCreditsRelations = relations(workspaceCredits, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceCredits.workspaceId],
		references: [workspace.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const passkeyRelations = relations(passkey, ({one}) => ({
	user: one(user, {
		fields: [passkey.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const workspaceMemberRelations = relations(workspaceMember, ({one}) => ({
	workspace: one(workspace, {
		fields: [workspaceMember.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [workspaceMember.userId],
		references: [user.id]
	}),
}));

export const twoFactorRelations = relations(twoFactor, ({one}) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id]
	}),
}));

export const brandKitRelations = relations(brandKit, ({one}) => ({
	workspace: one(workspace, {
		fields: [brandKit.workspaceId],
		references: [workspace.id]
	}),
}));

export const captionStyleRelations = relations(captionStyle, ({one}) => ({
	viralClip: one(viralClip, {
		fields: [captionStyle.clipId],
		references: [viralClip.id]
	}),
}));

export const viralClipRelations = relations(viralClip, ({one, many}) => ({
	captionStyles: many(captionStyle),
	videoExports: many(videoExport),
	video: one(video, {
		fields: [viralClip.videoId],
		references: [video.id]
	}),
}));

export const batchExportRelations = relations(batchExport, ({one, many}) => ({
	user: one(user, {
		fields: [batchExport.userId],
		references: [user.id]
	}),
	videoExports: many(videoExport),
}));

export const projectRelations = relations(project, ({one, many}) => ({
	workspace: one(workspace, {
		fields: [project.workspaceId],
		references: [workspace.id]
	}),
	user: one(user, {
		fields: [project.createdBy],
		references: [user.id]
	}),
	videos: many(video),
}));

export const videoExportRelations = relations(videoExport, ({one}) => ({
	viralClip: one(viralClip, {
		fields: [videoExport.clipId],
		references: [viralClip.id]
	}),
	user: one(user, {
		fields: [videoExport.userId],
		references: [user.id]
	}),
	batchExport: one(batchExport, {
		fields: [videoExport.batchExportId],
		references: [batchExport.id]
	}),
}));

export const videoRelations = relations(video, ({one, many}) => ({
	viralClips: many(viralClip),
	project: one(project, {
		fields: [video.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [video.userId],
		references: [user.id]
	}),
}));