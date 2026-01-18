CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"aaguid" text,
	CONSTRAINT "passkey_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "twoFactor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text,
	"backup_codes" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"is_onboarded" boolean DEFAULT false NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo" text,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workspace_member" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"storage_key" text,
	"storage_url" text,
	"title" text,
	"duration" integer,
	"file_size" integer,
	"mime_type" text,
	"metadata" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twoFactor" ADD CONSTRAINT "twoFactor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "workspace_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_userId" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_account_providerId_accountId" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_account_providerId" ON "account" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_passkey_userId" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_passkey_credentialID" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "idx_passkey_userId_createdAt" ON "passkey" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_passkey_userId_credentialID" ON "passkey" USING btree ("user_id","credential_id");--> statement-breakpoint
CREATE INDEX "idx_session_userId" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_expiresAt" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_session_userId_expiresAt" ON "session" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_session_token_expiresAt" ON "session" USING btree ("token","expires_at");--> statement-breakpoint
CREATE INDEX "idx_session_token" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_twoFactor_userId" ON "twoFactor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_id" ON "user" USING btree ("id");--> statement-breakpoint
CREATE INDEX "idx_user_isOnboarded" ON "user" USING btree ("is_onboarded");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_verification_expiresAt" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier_value" ON "verification" USING btree ("identifier","value");--> statement-breakpoint
CREATE INDEX "idx_verification_value" ON "verification" USING btree ("value");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspace_slug" ON "workspace" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_workspace_ownerId" ON "workspace" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspaceMember_workspaceId_userId" ON "workspace_member" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_workspaceMember_userId" ON "workspace_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_workspaceMember_workspaceId" ON "workspace_member" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_project_workspaceId" ON "project" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_project_createdBy" ON "project" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_project_status" ON "project" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_video_projectId" ON "video" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_video_status" ON "video" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_video_sourceType" ON "video" USING btree ("source_type");