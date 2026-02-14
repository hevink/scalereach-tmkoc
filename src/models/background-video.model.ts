import { db } from "../db";
import { backgroundCategory, backgroundVideo } from "../db/schema";
import { eq, desc, sql } from "drizzle-orm";
import type {
  BackgroundCategory,
  NewBackgroundCategory,
  BackgroundVideo,
  NewBackgroundVideo,
} from "../db/schema/background-video.schema";

export class BackgroundVideoModel {
  private static log(op: string, details?: any) {
    console.log(`[BG VIDEO MODEL] ${op}`, details ? JSON.stringify(details) : "");
  }

  static async listCategories(): Promise<BackgroundCategory[]> {
    this.log("LIST_CATEGORIES");
    return db
      .select()
      .from(backgroundCategory)
      .orderBy(backgroundCategory.sortOrder);
  }

  static async listByCategory(categoryId: string): Promise<BackgroundVideo[]> {
    this.log("LIST_BY_CATEGORY", { categoryId });
    return db
      .select()
      .from(backgroundVideo)
      .where(eq(backgroundVideo.categoryId, categoryId))
      .orderBy(desc(backgroundVideo.createdAt));
  }

  static async getById(id: string): Promise<BackgroundVideo | null> {
    this.log("GET_BY_ID", { id });
    const result = await db
      .select()
      .from(backgroundVideo)
      .where(eq(backgroundVideo.id, id));
    return result[0] || null;
  }

  static async getRandomByCategory(categoryId: string): Promise<BackgroundVideo | null> {
    this.log("GET_RANDOM_BY_CATEGORY", { categoryId });
    const result = await db
      .select()
      .from(backgroundVideo)
      .where(eq(backgroundVideo.categoryId, categoryId))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return result[0] || null;
  }

  static async create(data: NewBackgroundVideo): Promise<BackgroundVideo> {
    this.log("CREATE", { id: data.id, categoryId: data.categoryId });
    const result = await db.insert(backgroundVideo).values(data).returning();
    return result[0];
  }

  static async createCategory(data: NewBackgroundCategory): Promise<BackgroundCategory> {
    this.log("CREATE_CATEGORY", { slug: data.slug });
    const result = await db.insert(backgroundCategory).values(data).returning();
    return result[0];
  }

  static async getCategoryBySlug(slug: string): Promise<BackgroundCategory | null> {
    this.log("GET_CATEGORY_BY_SLUG", { slug });
    const result = await db
      .select()
      .from(backgroundCategory)
      .where(eq(backgroundCategory.slug, slug));
    return result[0] || null;
  }
}
