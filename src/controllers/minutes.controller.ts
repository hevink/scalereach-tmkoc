import { Context } from "hono";
import { MinutesModel } from "../models/minutes.model";
import { WorkspaceModel } from "../models/workspace.model";
import { getPlanConfig } from "../config/plan-config";
import { canUploadVideo } from "../services/minutes-validation.service";

export class MinutesController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    console.log(`[MINUTES CONTROLLER] ${operation} - ${method} ${url}`, details ? JSON.stringify(details) : "");
  }

  // Get workspace minutes balance
  static async getBalance(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    MinutesController.logRequest(c, "GET_BALANCE", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const balance = await MinutesModel.getBalance(workspaceId);
      const ws = await WorkspaceModel.getById(workspaceId);
      const plan = ws?.plan || "free";
      const planConfig = getPlanConfig(plan);

      return c.json({
        ...balance,
        plan,
        planLimits: planConfig.limits,
        editingOperationsLimit: planConfig.limits.editing,
      });
    } catch (error) {
      console.error(`[MINUTES CONTROLLER] GET_BALANCE error:`, error);
      return c.json({ error: "Failed to get minutes balance" }, 500);
    }
  }

  // Get minute transaction history
  static async getTransactions(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    MinutesController.logRequest(c, "GET_TRANSACTIONS", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const limit = parseInt(c.req.query("limit") || "50");
      const offset = parseInt(c.req.query("offset") || "0");
      const type = c.req.query("type");

      const transactions = await MinutesModel.getTransactions({
        workspaceId,
        limit,
        offset,
        type: type || undefined,
      });

      return c.json(transactions);
    } catch (error) {
      console.error(`[MINUTES CONTROLLER] GET_TRANSACTIONS error:`, error);
      return c.json({ error: "Failed to get transactions" }, 500);
    }
  }

  // Validate upload before starting
  static async validateUpload(c: Context) {
    const workspaceId = c.req.param("workspaceId");
    MinutesController.logRequest(c, "VALIDATE_UPLOAD", { workspaceId });

    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const members = await WorkspaceModel.getMembers(workspaceId);
      const isMember = members.some((m) => m.userId === user.id);
      if (!isMember) {
        return c.json({ error: "Access denied" }, 403);
      }

      const body = await c.req.json();
      const { duration, size } = body;

      if (duration === undefined || duration === null) {
        return c.json({ error: "duration is required" }, 400);
      }

      const ws = await WorkspaceModel.getById(workspaceId);
      const plan = ws?.plan || "free";
      const planConfig = getPlanConfig(plan);
      const balance = await MinutesModel.getBalance(workspaceId);

      const validation = canUploadVideo(
        planConfig,
        duration,
        size || 0,
        balance.minutesRemaining
      );

      return c.json(validation);
    } catch (error) {
      console.error(`[MINUTES CONTROLLER] VALIDATE_UPLOAD error:`, error);
      return c.json({ error: "Failed to validate upload" }, 500);
    }
  }
}
