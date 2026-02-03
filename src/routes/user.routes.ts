import { Hono } from "hono";
import { UserController } from "../controllers/user.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";

const userRouter = new Hono();

// Public routes
userRouter.get("/check-username", UserController.checkUsername);
userRouter.get("/check-email", UserController.checkEmail);

// Protected routes - /me endpoints (must be before /:id to avoid conflicts)
userRouter.get("/me", authMiddleware, UserController.getCurrentUser);
userRouter.put("/me", authMiddleware, UserController.updateCurrentUser);
userRouter.post("/me/avatar", authMiddleware, UserController.uploadAvatar);
userRouter.delete("/me/avatar", authMiddleware, UserController.deleteAvatar);
userRouter.put("/me/password", authMiddleware, UserController.changePassword);
userRouter.get("/me/preferences", authMiddleware, UserController.getPreferences);
userRouter.put("/me/preferences", authMiddleware, UserController.updatePreferences);
userRouter.get("/me/sessions", authMiddleware, UserController.getSessions);
userRouter.delete("/me/sessions", authMiddleware, UserController.revokeSessions);

// Admin-only routes - user management
userRouter.get("/", adminMiddleware, UserController.getAllUsers);
userRouter.post("/", adminMiddleware, UserController.createUser);

// Protected routes - specific user operations (admin required for modification)
userRouter.get("/:id", authMiddleware, UserController.getUserById);
userRouter.put("/:id", adminMiddleware, UserController.updateUser);
userRouter.delete("/:id", adminMiddleware, UserController.deleteUser);

export default userRouter;
