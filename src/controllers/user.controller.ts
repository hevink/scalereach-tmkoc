import { Context } from "hono";
import { UserModel } from "../models/user.model";
import { auth } from "../lib/auth";

export class UserController {
  private static logRequest(c: Context, operation: string, details?: any) {
    const method = c.req.method;
    const url = c.req.url;
    const userAgent = c.req.header('user-agent') || 'unknown';
    console.log(`[USER CONTROLLER] ${operation} - ${method} ${url}`, details ? JSON.stringify(details) : '');
    console.log(`[USER CONTROLLER] User-Agent: ${userAgent}`);
  }

  // Get current authenticated user
  static async getCurrentUser(c: Context) {
    UserController.logRequest(c, 'GET_CURRENT_USER');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const fullUser = await UserModel.getById(user.id);
      if (!fullUser) {
        return c.json({ error: "User not found" }, 404);
      }
      
      console.log(`[USER CONTROLLER] GET_CURRENT_USER success - user: ${fullUser.id}`);
      return c.json(fullUser);
    } catch (error) {
      console.error(`[USER CONTROLLER] GET_CURRENT_USER error:`, error);
      return c.json({ error: "Failed to fetch user" }, 500);
    }
  }

  // Update current authenticated user
  static async updateCurrentUser(c: Context) {
    UserController.logRequest(c, 'UPDATE_CURRENT_USER');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const body = await c.req.json();
      console.log(`[USER CONTROLLER] UPDATE_CURRENT_USER request body:`, body);
      
      const updatedUser = await UserModel.update(user.id, body);
      if (!updatedUser) {
        return c.json({ error: "User not found" }, 404);
      }
      
      console.log(`[USER CONTROLLER] UPDATE_CURRENT_USER success - user: ${updatedUser.id}`);
      return c.json(updatedUser);
    } catch (error) {
      console.error(`[USER CONTROLLER] UPDATE_CURRENT_USER error:`, error);
      return c.json({ error: "Failed to update user" }, 500);
    }
  }

  // Upload avatar
  static async uploadAvatar(c: Context) {
    UserController.logRequest(c, 'UPLOAD_AVATAR');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const body = await c.req.json();
      const { image } = body;
      
      if (!image) {
        return c.json({ error: "Image is required" }, 400);
      }
      
      // Update user with new avatar (image is base64 or URL)
      const updatedUser = await UserModel.update(user.id, { image });
      
      console.log(`[USER CONTROLLER] UPLOAD_AVATAR success - user: ${user.id}`);
      return c.json({ success: true, image: updatedUser?.image });
    } catch (error) {
      console.error(`[USER CONTROLLER] UPLOAD_AVATAR error:`, error);
      return c.json({ error: "Failed to upload avatar" }, 500);
    }
  }

  // Delete avatar
  static async deleteAvatar(c: Context) {
    UserController.logRequest(c, 'DELETE_AVATAR');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      await UserModel.update(user.id, { image: null } as any);
      
      console.log(`[USER CONTROLLER] DELETE_AVATAR success - user: ${user.id}`);
      return c.json({ success: true });
    } catch (error) {
      console.error(`[USER CONTROLLER] DELETE_AVATAR error:`, error);
      return c.json({ error: "Failed to delete avatar" }, 500);
    }
  }

  // Change password
  static async changePassword(c: Context) {
    UserController.logRequest(c, 'CHANGE_PASSWORD');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const body = await c.req.json();
      const { currentPassword, newPassword } = body;
      
      if (!currentPassword || !newPassword) {
        return c.json({ error: "Current password and new password are required" }, 400);
      }
      
      // Use better-auth to change password
      const result = await auth.api.changePassword({
        body: {
          currentPassword,
          newPassword,
        },
        headers: c.req.raw.headers,
      });
      
      console.log(`[USER CONTROLLER] CHANGE_PASSWORD success - user: ${user.id}`);
      return c.json({ success: true });
    } catch (error: any) {
      console.error(`[USER CONTROLLER] CHANGE_PASSWORD error:`, error);
      return c.json({ error: error.message || "Failed to change password" }, 400);
    }
  }

  // Get user preferences
  static async getPreferences(c: Context) {
    UserController.logRequest(c, 'GET_PREFERENCES');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const fullUser = await UserModel.getById(user.id);
      if (!fullUser) {
        return c.json({ error: "User not found" }, 404);
      }
      
      const preferences = fullUser.preferences ? JSON.parse(fullUser.preferences as string) : {};
      
      console.log(`[USER CONTROLLER] GET_PREFERENCES success - user: ${user.id}`);
      return c.json(preferences);
    } catch (error) {
      console.error(`[USER CONTROLLER] GET_PREFERENCES error:`, error);
      return c.json({ error: "Failed to fetch preferences" }, 500);
    }
  }

  // Update user preferences
  static async updatePreferences(c: Context) {
    UserController.logRequest(c, 'UPDATE_PREFERENCES');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const body = await c.req.json();
      
      // Get current preferences and merge
      const fullUser = await UserModel.getById(user.id);
      const currentPrefs = fullUser?.preferences ? JSON.parse(fullUser.preferences as string) : {};
      const newPrefs = { ...currentPrefs, ...body };
      
      await UserModel.update(user.id, { preferences: JSON.stringify(newPrefs) });
      
      console.log(`[USER CONTROLLER] UPDATE_PREFERENCES success - user: ${user.id}`);
      return c.json(newPrefs);
    } catch (error) {
      console.error(`[USER CONTROLLER] UPDATE_PREFERENCES error:`, error);
      return c.json({ error: "Failed to update preferences" }, 500);
    }
  }

  // Get user sessions
  static async getSessions(c: Context) {
    UserController.logRequest(c, 'GET_SESSIONS');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      // Use better-auth to list sessions
      const result = await auth.api.listSessions({
        headers: c.req.raw.headers,
      });
      
      console.log(`[USER CONTROLLER] GET_SESSIONS success - user: ${user.id}`);
      return c.json(result);
    } catch (error) {
      console.error(`[USER CONTROLLER] GET_SESSIONS error:`, error);
      return c.json({ error: "Failed to fetch sessions" }, 500);
    }
  }

  // Revoke sessions
  static async revokeSessions(c: Context) {
    UserController.logRequest(c, 'REVOKE_SESSIONS');
    
    try {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      
      const body = await c.req.json();
      const { sessionToken } = body;
      
      if (sessionToken) {
        // Revoke specific session
        await auth.api.revokeSession({
          body: { token: sessionToken },
          headers: c.req.raw.headers,
        });
      } else {
        // Revoke all other sessions
        await auth.api.revokeOtherSessions({
          headers: c.req.raw.headers,
        });
      }
      
      console.log(`[USER CONTROLLER] REVOKE_SESSIONS success - user: ${user.id}`);
      return c.json({ success: true });
    } catch (error) {
      console.error(`[USER CONTROLLER] REVOKE_SESSIONS error:`, error);
      return c.json({ error: "Failed to revoke sessions" }, 500);
    }
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
