CREATE TYPE "public"."workflow_type" AS ENUM('system', 'user');--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "userId" varchar(64);--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "workflowType" "workflow_type" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "sortOrder" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;