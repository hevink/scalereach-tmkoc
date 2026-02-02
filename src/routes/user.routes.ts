import { Hono } from "hono";
import { UserController } from "../controllers/user.controller";
import { authMiddleware } from "../middleware/auth.middleware";

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

// Protected routes - general
userRouter.use("/*", authMiddleware);
userRouter.get("/", UserController.getAllUsers);
userRouter.get("/:id", UserController.getUserById);
userRouter.post("/", UserController.createUser);
userRouter.put("/:id", UserController.updateUser);
userRouter.delete("/:id", UserController.deleteUser);

export default userRouter;
