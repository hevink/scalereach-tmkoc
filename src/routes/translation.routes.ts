import { Hono } from "hono";
import { TranslationController } from "../controllers/translation.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const translationRouter = new Hono();

// All routes are protected
const protectedRoutes = new Hono();
protectedRoutes.use("*", authMiddleware);

// Video translation endpoints
protectedRoutes.post("/videos/:videoId", TranslationController.startTranslation);
protectedRoutes.get("/videos/:videoId", TranslationController.getTranslations);
protectedRoutes.get("/videos/:videoId/:lang", TranslationController.getTranslation);
protectedRoutes.delete("/:translationId", TranslationController.deleteTranslation);

// Supported languages (public-ish, but still auth-protected)
protectedRoutes.get("/languages", TranslationController.getSupportedLanguages);

// Clip translated captions
protectedRoutes.get("/clips/:clipId/captions", TranslationController.getClipTranslationLanguages);
protectedRoutes.get("/clips/:clipId/captions/:lang", TranslationController.getClipTranslatedCaptions);

translationRouter.route("/", protectedRoutes);

export default translationRouter;
