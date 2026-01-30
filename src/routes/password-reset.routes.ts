import { Hono } from "hono";
import { PasswordResetController } from "../controllers/password-reset.controller";

const passwordResetRouter = new Hono();

passwordResetRouter.post("/request", PasswordResetController.requestReset);
passwordResetRouter.get("/verify/:token", PasswordResetController.verifyToken);
passwordResetRouter.post("/reset/:token", PasswordResetController.resetPassword);

export default passwordResetRouter;
