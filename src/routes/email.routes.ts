import { Hono } from "hono";
import { UserController } from "../controllers/user.controller";

const emailRouter = new Hono();

// Public route for email availability check
emailRouter.get("/check", UserController.checkEmail);

export default emailRouter;