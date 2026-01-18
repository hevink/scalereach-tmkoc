import { db } from "../db";
import { user } from "../db/schema";
import { eq } from "drizzle-orm";
import { performance } from 'perf_hooks';

export class UserModel {
  private static logOperation(operation: string, details?: any) {
    console.log(`[USER MODEL] ${operation}`, details ? JSON.stringify(details) : '');
  }

  static async getAll() {
    this.logOperation('GET_ALL_USERS');
    const startTime = performance.now();
    
    try {
      const result = await db.select().from(user);
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] GET_ALL_USERS completed in ${duration.toFixed(2)}ms, found ${result.length} users`);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] GET_ALL_USERS failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getById(id: string) {
    this.logOperation('GET_USER_BY_ID', { id });
    const startTime = performance.now();
    
    try {
      const result = await db.select().from(user).where(eq(user.id, id));
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] GET_USER_BY_ID completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] GET_USER_BY_ID failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getByEmail(email: string) {
    this.logOperation('GET_USER_BY_EMAIL', { email });
    const startTime = performance.now();
    
    try {
      const result = await db.select().from(user).where(eq(user.email, email));
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] GET_USER_BY_EMAIL completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] GET_USER_BY_EMAIL failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async create(data: { id: string; name: string; email: string }) {
    this.logOperation('CREATE_USER', { id: data.id, email: data.email });
    const startTime = performance.now();
    
    try {
      const result = await db.insert(user).values(data).returning();
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] CREATE_USER completed in ${duration.toFixed(2)}ms, created user: ${result[0]?.id}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] CREATE_USER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async update(
    id: string,
    data: Partial<{ 
      name: string; 
      email: string; 
      username: string; 
      isOnboarded: boolean;
      twoFactorEnabled: boolean;
      displayUsername: string;
      preferences: any;
      image: string | null;
    }>
  ) {
    this.logOperation('UPDATE_USER', { id, fields: Object.keys(data) });
    const startTime = performance.now();
    
    try {
      const result = await db
        .update(user)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(user.id, id))
        .returning();
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] UPDATE_USER completed in ${duration.toFixed(2)}ms, updated: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] UPDATE_USER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async delete(id: string) {
    this.logOperation('DELETE_USER', { id });
    const startTime = performance.now();
    
    try {
      await db.delete(user).where(eq(user.id, id));
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] DELETE_USER completed in ${duration.toFixed(2)}ms`);
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] DELETE_USER failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async getByUsername(username: string) {
    this.logOperation('GET_USER_BY_USERNAME', { username });
    const startTime = performance.now();
    
    try {
      const result = await db
        .select()
        .from(user)
        .where(eq(user.username, username));
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] GET_USER_BY_USERNAME completed in ${duration.toFixed(2)}ms, found: ${!!result[0]}`);
      return result[0];
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] GET_USER_BY_USERNAME failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  static async isUsernameAvailable(username: string) {
    this.logOperation('CHECK_USERNAME_AVAILABILITY', { username });
    const startTime = performance.now();
    
    try {
      const existingUser = await this.getByUsername(username);
      const available = !existingUser;
      const duration = performance.now() - startTime;
      console.log(`[USER MODEL] CHECK_USERNAME_AVAILABILITY completed in ${duration.toFixed(2)}ms, available: ${available}`);
      return available;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`[USER MODEL] CHECK_USERNAME_AVAILABILITY failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }
}
