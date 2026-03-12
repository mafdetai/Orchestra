CREATE TABLE "workflow_template_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"templateId" varchar(64) NOT NULL,
	"versionNo" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"config" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" varchar(64),
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "workflow_template_versions_template_id_idx" ON "workflow_template_versions" USING btree ("templateId");
