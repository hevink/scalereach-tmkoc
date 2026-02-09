import { db } from "../db";
import { workspace, workspaceMember, user, type WorkspaceCaptionStyle } from "../db/schema";
import { eq } from "drizzle-orm";
import { performance } from 'perf_hooks';

export class WorkspaceModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[WORKSPACE MODEL] ${operation}`, details ? JSON.stringify(details) : '');
  }

  static async getAll() {
    this.logOperation('GET_ALL_WORKSPACES');
    const startTime = performance.now();
    
    try {
      const result = await db.select().from(workspace);
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_ALL_WORKSPACES completed in ${duration.toFixed(2)}ms, found ${result.length} workspaces`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_ALL_WORKSPACES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getUserWorkspaces(userId: string) {
    this.logOperation('GET_USER_WORKSPACES', { userId });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          description: workspace.description,
          logo: workspace.logo,
          plan: workspace.plan,
          billingCycle: workspace.billingCycle,
          ownerId: workspace.ownerId,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          role: workspaceMember.role,
        })
        .from(workspaceMember)
        .innerJoin(workspace, eq(workspaceMember.workspaceId, workspace.id))
        .where(eq(workspaceMember.userId, userId));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_USER_WORKSPACES completed in ${duration.toFixed(2)}ms, found ${result.length} workspaces for user`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_USER_WORKSPACES failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getById(id: string) {
    this.logOperation('GET_WORKSPACE_BY_ID', { id });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select()
        .from(workspace)
        .where(eq(workspace.id, id));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_WORKSPACE_BY_ID completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_WORKSPACE_BY_ID failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getBySlug(slug: string) {
    this.logOperation('GET_WORKSPACE_BY_SLUG', { slug });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select()
        .from(workspace)
        .where(eq(workspace.slug, slug));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_WORKSPACE_BY_SLUG completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_WORKSPACE_BY_SLUG failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getByOwnerId(ownerId: string) {
    this.logOperation('GET_WORKSPACES_BY_OWNER', { ownerId });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select()
        .from(workspace)
        .where(eq(workspace.ownerId, ownerId));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_WORKSPACES_BY_OWNER completed in ${duration.toFixed(2)}ms, found ${result.length} workspaces`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_WORKSPACES_BY_OWNER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async create(data: {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    description?: string;
    logo?: string;
  }) {
    this.logOperation('CREATE_WORKSPACE', { id: data.id, slug: data.slug, ownerId: data.ownerId });
    const startTime = performance.now();
    
    try {
      const result = await db.insert(workspace).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] CREATE_WORKSPACE completed in ${duration.toFixed(2)}ms, created workspace: ${result[0]?.id}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] CREATE_WORKSPACE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async update(
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string;
      logo: string;
      plan: string;
      billingCycle: string;
      defaultCaptionStyle: WorkspaceCaptionStyle;
      subscriptionId: string;
      subscriptionStatus: string;
      subscriptionRenewalDate: Date;
      subscriptionCancelledAt: Date;
    }>
  ) {
    this.logOperation('UPDATE_WORKSPACE', { id, fields: Object.keys(data) });
    const startTime = performance.now();
    
    try {
      const result = await db
        .update(workspace)
        .set(data)
        .where(eq(workspace.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] UPDATE_WORKSPACE completed in ${duration.toFixed(2)}ms, updated: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] UPDATE_WORKSPACE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async delete(id: string) {
    this.logOperation('DELETE_WORKSPACE', { id });
    const startTime = performance.now();
    
    try {
      await db.delete(workspace).where(eq(workspace.id, id));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] DELETE_WORKSPACE completed in ${duration.toFixed(2)}ms`);
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] DELETE_WORKSPACE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  // Workspace Members
  static async getMembers(workspaceId: string) {
    this.logOperation('GET_WORKSPACE_MEMBERS', { workspaceId });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select({
          id: workspaceMember.id,
          workspaceId: workspaceMember.workspaceId,
          userId: workspaceMember.userId,
          role: workspaceMember.role,
          createdAt: workspaceMember.createdAt,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        })
        .from(workspaceMember)
        .innerJoin(user, eq(workspaceMember.userId, user.id))
        .where(eq(workspaceMember.workspaceId, workspaceId));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_WORKSPACE_MEMBERS completed in ${duration.toFixed(2)}ms, found ${result.length} members`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_WORKSPACE_MEMBERS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async addMember(data: {
    id: string;
    workspaceId: string;
    userId: string;
    role: "owner" | "admin" | "member";
  }) {
    this.logOperation('ADD_WORKSPACE_MEMBER', { workspaceId: data.workspaceId, userId: data.userId, role: data.role });
    const startTime = performance.now();
    
    try {
      const result = await db.insert(workspaceMember).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] ADD_WORKSPACE_MEMBER completed in ${duration.toFixed(2)}ms, added member: ${result[0]?.id}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] ADD_WORKSPACE_MEMBER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async removeMember(id: string) {
    this.logOperation('REMOVE_WORKSPACE_MEMBER', { id });
    const startTime = performance.now();
    
    try {
      await db.delete(workspaceMember).where(eq(workspaceMember.id, id));
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] REMOVE_WORKSPACE_MEMBER completed in ${duration.toFixed(2)}ms`);
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] REMOVE_WORKSPACE_MEMBER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async updateMemberRole(id: string, role: "admin" | "member") {
    this.logOperation('UPDATE_MEMBER_ROLE', { id, role });
    const startTime = performance.now();
    
    try {
      const result = await db
        .update(workspaceMember)
        .set({ role })
        .where(eq(workspaceMember.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] UPDATE_MEMBER_ROLE completed in ${duration.toFixed(2)}ms`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] UPDATE_MEMBER_ROLE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getMemberByUserAndWorkspace(userId: string, workspaceId: string) {
    this.logOperation('GET_MEMBER_BY_USER_AND_WORKSPACE', { userId, workspaceId });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select()
        .from(workspaceMember)
        .where(eq(workspaceMember.workspaceId, workspaceId));
      const member = result.find(m => m.userId === userId);
      const duration = performance.now() - startTime;
      console.log(`[WORKSPACE MODEL] GET_MEMBER_BY_USER_AND_WORKSPACE completed in ${duration.toFixed(2)}ms, found: ${!!member}`);
      return member;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[WORKSPACE MODEL] GET_MEMBER_BY_USER_AND_WORKSPACE failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }
}
