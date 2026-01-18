import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrateInvitationTable() {
  console.log("Creating workspace_invitation table...");

  try {
    // Create the table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "workspace_invitation" (
        "id" text PRIMARY KEY NOT NULL,
        "workspace_id" text NOT NULL,
        "email" text NOT NULL,
        "role" text DEFAULT 'member' NOT NULL,
        "token" text NOT NULL,
        "invited_by" text NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "accepted_at" timestamp,
        CONSTRAINT "workspace_invitation_token_unique" UNIQUE("token")
      )
    `);
    console.log("Table created successfully");

    // Add foreign keys
    try {
      await db.execute(sql`
        ALTER TABLE "workspace_invitation" 
        ADD CONSTRAINT "workspace_invitation_workspace_id_workspace_id_fk" 
        FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action
      `);
      console.log("Workspace FK added");
    } catch (e: any) {
      if (e.code === "42710") {
        console.log("Workspace FK already exists");
      } else {
        throw e;
      }
    }

    try {
      await db.execute(sql`
        ALTER TABLE "workspace_invitation" 
        ADD CONSTRAINT "workspace_invitation_invited_by_user_id_fk" 
        FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
      `);
      console.log("User FK added");
    } catch (e: any) {
      if (e.code === "42710") {
        console.log("User FK already exists");
      } else {
        throw e;
      }
    }

    // Create indexes
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_invitation_workspaceId" ON "workspace_invitation" USING btree ("workspace_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_invitation_email" ON "workspace_invitation" USING btree ("email")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "idx_invitation_token" ON "workspace_invitation" USING btree ("token")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_invitation_status" ON "workspace_invitation" USING btree ("status")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "idx_invitation_workspace_email" ON "workspace_invitation" USING btree ("workspace_id","email")`);
    console.log("Indexes created");

    console.log("Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateInvitationTable();
