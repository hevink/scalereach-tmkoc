import { Context } from "hono";
import { UserModel } from "../models/user.model";

export class UserController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    const userAgent = c.req.header('user-agent') || 'unknown';
    console.log(`[USER CONTROLLER] ${operation} - ${method} ${url}`, details ? JSON.stringify(details) : '');
    console.log(`[USER CONTROLLER] User-Agent: ${userAgent}`);
  }

  static async getAllUsers(c: Context) {
    UserController.logRequest(c, 'GET_ALL_USERS');
    
    try {
      const users = await UserModel.getAll();
      console.log(`[USER CONTROLLER] GET_ALL_USERS success - returned ${users.length} users`);
      return c.json(users);
    } catch (error) {
      console.error(`[USER CONTROLLER] GET_ALL_USERS error:`, error);
      return c.json({ error: "Failed to fetch users" }, 500);
    }
  }

  static async getUserById(c: Context) {
    const id = c.req.param("id");
    UserController.logRequest(c, 'GET_USER_BY_ID', { id });
    
    try {
      const user = await UserModel.getById(id);

      if (!user) {
        console.log(`[USER CONTROLLER] GET_USER_BY_ID - user not found: ${id}`);
        return c.json({ error: "User not found" }, 404);
      }

      console.log(`[USER CONTROLLER] GET_USER_BY_ID success - found user: ${user.id}`);
      return c.json(user);
    } catch (error) {
      console.error(`[USER CONTROLLER] GET_USER_BY_ID error:`, error);
      return c.json({ error: "Failed to fetch user" }, 500);
    }
  }

  static async createUser(c: Context) {
    UserController.logRequest(c, 'CREATE_USER');
    
    try {
      const body = await c.req.json();
      const { id, name, email } = body;

      console.log(`[USER CONTROLLER] CREATE_USER request body:`, { id, name, email });

      if (!id || !name || !email) {
        console.log(`[USER CONTROLLER] CREATE_USER - missing required fields`);
        return c.json({ error: "ID, name and email are required" }, 400);
      }

      const user = await UserModel.create({ id, name, email });
      console.log(`[USER CONTROLLER] CREATE_USER success - created user: ${user.id}`);
      return c.json(user, 201);
    } catch (error) {
      console.error(`[USER CONTROLLER] CREATE_USER error:`, error);
      return c.json({ error: "Failed to create user" }, 500);
    }
  }

  static async updateUser(c: Context) {
    const id = c.req.param("id");
    UserController.logRequest(c, 'UPDATE_USER', { id });
    
    try {
      const body = await c.req.json();
      console.log(`[USER CONTROLLER] UPDATE_USER request body:`, body);

      const user = await UserModel.update(id, body);

      if (!user) {
        console.log(`[USER CONTROLLER] UPDATE_USER - user not found: ${id}`);
        return c.json({ error: "User not found" }, 404);
      }

      console.log(`[USER CONTROLLER] UPDATE_USER success - updated user: ${user.id}`);
      return c.json(user);
    } catch (error) {
      console.error(`[USER CONTROLLER] UPDATE_USER error:`, error);
      return c.json({ error: "Failed to update user" }, 500);
    }
  }

  static async deleteUser(c: Context) {
    const id = c.req.param("id");
    UserController.logRequest(c, 'DELETE_USER', { id });
    
    try {
      await UserModel.delete(id);
      console.log(`[USER CONTROLLER] DELETE_USER success - deleted user: ${id}`);
      return c.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error(`[USER CONTROLLER] DELETE_USER error:`, error);
      return c.json({ error: "Failed to delete user" }, 500);
    }
  }

  static async checkUsername(c: Context) {
    const username = c.req.query("username");
    UserController.logRequest(c, 'CHECK_USERNAME', { username });
    
    try {
      if (!username) {
        console.log(`[USER CONTROLLER] CHECK_USERNAME - missing username parameter`);
        return c.json({ error: "Username is required" }, 400);
      }
      
      const available = await UserModel.isUsernameAvailable(username);
      console.log(`[USER CONTROLLER] CHECK_USERNAME success - username ${username} available: ${available}`);
      return c.json({ available });
    } catch (error) {
      console.error(`[USER CONTROLLER] CHECK_USERNAME error:`, error);
      return c.json({ error: "Failed to check username" }, 500);
    }
  }

  static async checkEmail(c: Context) {
    const email = c.req.query("email");
    UserController.logRequest(c, 'CHECK_EMAIL', { email });
    
    try {
      if (!email) {
        console.log(`[USER CONTROLLER] CHECK_EMAIL - missing email parameter`);
        return c.json({ error: "Email is required" }, 400);
      }
      
      const existingUser = await UserModel.getByEmail(email);
      const available = !existingUser;
      console.log(`[USER CONTROLLER] CHECK_EMAIL success - email ${email} available: ${available}`);
      return c.json({ available });
    } catch (error) {
      console.error(`[USER CONTROLLER] CHECK_EMAIL error:`, error);
      return c.json({ error: "Failed to check email" }, 500);
    }
  }
}
