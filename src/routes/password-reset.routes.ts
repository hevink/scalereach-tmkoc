import { Hono } from "hono";
import { PasswordResetController } from "../controllers/password-reset.controller";
import { RateLimitPresets } from "../middleware/rate-limit";

const passwordResetRouter = new Hono();

passwordResetRouter.post("/request", RateLimitPresets.passwordReset(), PasswordResetController.requestReset);
passwordResetRouter.get("/verify/:token", RateLimitPresets.auth(), PasswordResetController.verifyToken);
passwordResetRouter.post("/reset/:token", RateLimitPresets.passwordReset(), PasswordResetController.resetPassword);

export default passwordResetRouter;
