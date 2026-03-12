ALTER TABLE "users" ADD COLUMN "trialRunsLeft" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_squares" ADD COLUMN "tags" text;--> statement-breakpoint
ALTER TABLE "workflow_squares" ADD COLUMN "promptVisibility" varchar(32) DEFAULT 'visible' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_squares" ADD COLUMN "modelCostLevel" varchar(16) DEFAULT 'standard' NOT NULL;