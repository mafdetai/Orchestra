CREATE TYPE "public"."tier" AS ENUM('user', 'pro', 'admin');--> statement-breakpoint
CREATE TABLE "workflow_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"squareId" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_squares" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"workflowId" varchar(64) NOT NULL,
	"authorId" varchar(64) NOT NULL,
	"authorName" varchar(128),
	"workflowName" varchar(255) NOT NULL,
	"description" text,
	"isPublic" boolean DEFAULT true NOT NULL,
	"isVerified" boolean DEFAULT false NOT NULL,
	"isSystem" boolean DEFAULT false NOT NULL,
	"likeCount" integer DEFAULT 0 NOT NULL,
	"useCount" integer DEFAULT 0 NOT NULL,
	"copyCount" integer DEFAULT 0 NOT NULL,
	"hotScore" real DEFAULT 0 NOT NULL,
	"commanderCount" integer DEFAULT 1 NOT NULL,
	"expertCount" integer DEFAULT 0 NOT NULL,
	"summarizerCount" integer DEFAULT 1 NOT NULL,
	"publishedAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tier" "tier" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatarUrl" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;