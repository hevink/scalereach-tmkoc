import { db } from "../db";
import { workspaceInvitation } from "../db/schema/invitation.schema";
import { workspace } from "../db/schema/workspace.schema";
import { user } from "../db/schema/user.schema";
import { eq, and, gt } from "drizzle-orm";
import { performance } from "perf_hooks";

export class InvitationModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[INVITATION MODEL] ${operation}`, details ? JSON.stringify(details) : "");
  }

  static async create(data: {
    id: string;
    workspaceId: string;
    email: string;
    role: string;
    token: string;
    invitedBy: string;
    expiresAt: Date;
  }) {
    this.logOperation("CREATE_INVITATION", { workspaceId: data.workspaceId, email: data.email });
    const startTime = performance.now();

    try {
      const result = await db.insert(workspaceInvitation).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] CREATE_INVITATION completed in ${duration.toFixed(2)}ms`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] CREATE_INVITATION failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getById(id: string) {
    this.logOperation("GET_INVITATION_BY_ID", { id });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(workspaceInvitation)
        .where(eq(workspaceInvitation.id, id));
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] GET_INVITATION_BY_ID completed in ${duration.toFixed(2)}ms`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] GET_INVITATION_BY_ID failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getByToken(token: string) {
    this.logOperation("GET_INVITATION_BY_TOKEN", { token: token.substring(0, 8) + "..." });
    const startTime = performance.now();

    try {
      const result = await db
        .select({
          invitation: workspaceInvitation,
          workspace: {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            logo: workspace.logo,
          },
          inviter: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        })
        .from(workspaceInvitation)
        .innerJoin(workspace, eq(workspaceInvitation.workspaceId, workspace.id))
        .innerJoin(user, eq(workspaceInvitation.invitedBy, user.id))
        .where(eq(workspaceInvitation.token, token));
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] GET_INVITATION_BY_TOKEN completed in ${duration.toFixed(2)}ms`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] GET_INVITATION_BY_TOKEN failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getByWorkspaceAndEmail(workspaceId: string, email: string) {
    this.logOperation("GET_INVITATION_BY_WORKSPACE_EMAIL", { workspaceId, email });
    const startTime = performance.now();

    try {
      const result = await db
        .select()
        .from(workspaceInvitation)
        .where(
          and(
            eq(workspaceInvitation.workspaceId, workspaceId),
            eq(workspaceInvitation.email, email.toLowerCase())
          )
        );
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] GET_INVITATION_BY_WORKSPACE_EMAIL completed in ${duration.toFixed(2)}ms`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] GET_INVITATION_BY_WORKSPACE_EMAIL failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getWorkspaceInvitations(workspaceId: string) {
    this.logOperation("GET_WORKSPACE_INVITATIONS", { workspaceId });
    const startTime = performance.now();

    try {
      const result = await db
        .select({
          id: workspaceInvitation.id,
          email: workspaceInvitation.email,
          role: workspaceInvitation.role,
          status: workspaceInvitation.status,
          expiresAt: workspaceInvitation.expiresAt,
          createdAt: workspaceInvitation.createdAt,
          inviter: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        })
        .from(workspaceInvitation)
        .innerJoin(user, eq(workspaceInvitation.invitedBy, user.id))
        .where(eq(workspaceInvitation.workspaceId, workspaceId));
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] GET_WORKSPACE_INVITATIONS completed in ${duration.toFixed(2)}ms, found ${result.length}`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] GET_WORKSPACE_INVITATIONS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getPendingInvitationsForEmail(email: string) {
    this.logOperation("GET_PENDING_INVITATIONS_FOR_EMAIL", { email });
    const startTime = performance.now();

    try {
      const result = await db
        .select({
          invitation: workspaceInvitation,
          workspace: {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            logo: workspace.logo,
          },
          inviter: {
            id: user.id,
            name: user.name,
          },
        })
        .from(workspaceInvitation)
        .innerJoin(workspace, eq(workspaceInvitation.workspaceId, workspace.id))
        .innerJoin(user, eq(workspaceInvitation.invitedBy, user.id))
        .where(
          and(
            eq(workspaceInvitation.email, email.toLowerCase()),
            eq(workspaceInvitation.status, "pending"),
            gt(workspaceInvitation.expiresAt, new Date())
          )
        );
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] GET_PENDING_INVITATIONS_FOR_EMAIL completed in ${duration.toFixed(2)}ms, found ${result.length}`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] GET_PENDING_INVITATIONS_FOR_EMAIL failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async updateStatus(id: string, status: "accepted" | "declined" | "expired") {
    this.logOperation("UPDATE_INVITATION_STATUS", { id, status });
    const startTime = performance.now();

    try {
      const updateData: any = { status };
      if (status === "accepted") {
        updateData.acceptedAt = new Date();
      }

      const result = await db
        .update(workspaceInvitation)
        .set(updateData)
        .where(eq(workspaceInvitation.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] UPDATE_INVITATION_STATUS completed in ${duration.toFixed(2)}ms`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] UPDATE_INVITATION_STATUS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async delete(id: string) {
    this.logOperation("DELETE_INVITATION", { id });
    const startTime = performance.now();

    try {
      await db.delete(workspaceInvitation).where(eq(workspaceInvitation.id, id));
      const duration = performance.now() - startTime;
      console.log(`[INVITATION MODEL] DELETE_INVITATION completed in ${duration.toFixed(2)}ms`);
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[INVITATION MODEL] DELETE_INVITATION failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }
}
