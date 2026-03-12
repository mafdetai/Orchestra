CREATE TABLE "ai_models" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"provider" varchar(64),
	"apiUrl" varchar(512) NOT NULL,
	"apiKey" text NOT NULL,
	"modelName" varchar(128) NOT NULL,
	"isDefault" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
