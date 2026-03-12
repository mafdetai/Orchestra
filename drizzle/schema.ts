import { pgEnum, pgTable, serial, text, timestamp, varchar, integer, boolean, real } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */

export const roleEnum = pgEnum("role", ["user", "admin"]);

/**
 * 用户层级：访客(guest) / 注册用户(user) / 专业用户Pro(pro) / 管理员(admin)
 * guest 不存在于数据库，仅用于前端权限判断
 */
export const tierEnum = pgEnum("tier", ["user", "pro", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  tier: tierEnum("tier").default("user").notNull(),  // user | pro | admin
  avatarUrl: text("avatarUrl"),                       // 头像 URL
  bio: text("bio"),                                   // 个人简介
  trialRunsLeft: integer("trialRunsLeft").default(2).notNull(), // 注册送 2 次试用
  passwordHash: text("passwordHash"),                             // 独立登录密码哈希（可为空）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 工作流状态枚举
 */
export const workflowStatusEnum = pgEnum("workflow_status", ["pending", "running", "completed", "error"]);

/**
 * 工作流执行记录表
 * 存储每次任务执行的完整信息，刷新后依然保留
 */
export const workflowRuns = pgTable("workflow_runs", {
  id: varchar("id", { length: 64 }).primaryKey(),           // 使用 UUID 字符串
  templateId: varchar("templateId", { length: 64 }).notNull(),
  templateName: varchar("templateName", { length: 255 }).notNull(),
  task: text("task").notNull(),                              // 用户输入的任务描述
  status: workflowStatusEnum("status").default("pending").notNull(),
  // 各阶段输出（JSON 字符串）
  initiatorOutput: text("initiatorOutput"),                  // 引导者输出
  expertOutputs: text("expertOutputs"),                      // 专家输出 JSON
  summaryOutput: text("summaryOutput"),                      // 汇总者输出（最终报告）
  pdfUrl: text("pdfUrl"),                                    // 生成的 PDF 文件 URL
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  errorMessage: text("errorMessage"),
  expertCount: integer("expertCount").default(0).notNull(),
  completedExperts: integer("completedExperts").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = typeof workflowRuns.$inferInsert;

/**
 * 工作流类型枚举
 * system: 管理员创建的系统工作流（所有用户可用，Prompt 不暴露给前端）
 * user: 用户自己创建的工作流（仅自己可用）
 */
export const workflowTypeEnum = pgEnum("workflow_type", ["system", "user"]);

/**
 * 工作流模板表
 * 存储用户创建的工作流配置，刷新后依然保留
 */
export const workflowTemplates = pgTable("workflow_templates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }),              // 用户工作流关联 users.openId；系统工作流为 null
  workflowType: workflowTypeEnum("workflowType").default("user").notNull(), // system | user
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  config: text("config").notNull(),    // JSON 字符串，存储完整的 WorkflowTemplate 配置（含 Prompt）
  isDefault: integer("isDefault").default(0).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),   // 系统工作流排序
  isActive: boolean("isActive").default(true).notNull(),  // 是否启用
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;

/**
 * 系统工作流版本表
 * 每次创建/更新/回滚系统工作流时写入快照，支持审计和一键回滚
 */
export const workflowTemplateVersions = pgTable("workflow_template_versions", {
  id: serial("id").primaryKey(),
  templateId: varchar("templateId", { length: 64 }).notNull(),
  versionNo: integer("versionNo").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  config: text("config").notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: varchar("createdBy", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowTemplateVersion = typeof workflowTemplateVersions.$inferSelect;
export type InsertWorkflowTemplateVersion = typeof workflowTemplateVersions.$inferInsert;

/**
 * AI 模型配置表（个人私有）
 * 每个用户维护自己的模型列表，专家配置时从中选择
 */
export const aiModels = pgTable("ai_models", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),   // 关联 users.openId，个人私有
  name: varchar("name", { length: 128 }).notNull(),       // 显示名称，如 "DeepSeek Chat"
  provider: varchar("provider", { length: 64 }),          // 服务商，如 "DeepSeek"
  apiUrl: varchar("apiUrl", { length: 512 }).notNull(),   // API 地址，如 https://api.deepseek.com
  apiKey: text("apiKey").notNull(),                       // API Key（服务端加密存储，返回前脱敏）
  modelName: varchar("modelName", { length: 128 }).notNull(), // 模型标识符，如 xxxxx
  isDefault: integer("isDefault").default(0).notNull(),  // 是否为该用户的默认模型
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AiModel = typeof aiModels.$inferSelect;
export type InsertAiModel = typeof aiModels.$inferInsert;

/**
 * 工作流广场发布表
 * 将用户工作流发布到广场，支持热度排行、点赞、复制
 */
export const workflowSquares = pgTable("workflow_squares", {
  id: varchar("id", { length: 64 }).primaryKey(),
  workflowId: varchar("workflowId", { length: 64 }).notNull(),  // 关联 workflowTemplates.id
  authorId: varchar("authorId", { length: 64 }).notNull(),      // 关联 users.openId
  authorName: varchar("authorName", { length: 128 }),           // 作者显示名（减少 JOIN）
  workflowName: varchar("workflowName", { length: 255 }).notNull(),
  description: text("description"),
  isPublic: boolean("isPublic").default(true).notNull(),        // false = Pro 私密
  isVerified: boolean("isVerified").default(false).notNull(),   // 官方认证（Maestro Selection）
  isSystem: boolean("isSystem").default(false).notNull(),       // 是否系统预置（黑盒）
  likeCount: integer("likeCount").default(0).notNull(),
  useCount: integer("useCount").default(0).notNull(),
  copyCount: integer("copyCount").default(0).notNull(),
  // 热度分数：(likeCount*2 + useCount) / (hoursSincePublish+2)^1.5
  hotScore: real("hotScore").default(0).notNull(),
  tags: text("tags"),  // JSON 数组字符串，如 ["宏观","加密","研报"]
  promptVisibility: varchar("promptVisibility", { length: 32 }).default("visible").notNull(), // visible | partial | locked
  modelCostLevel: varchar("modelCostLevel", { length: 16 }).default("standard").notNull(), // flash | standard | pro
  commanderCount: integer("commanderCount").default(1).notNull(),  // 指挥官数量
  expertCount: integer("expertCount").default(0).notNull(),        // 执行专家数量
  summarizerCount: integer("summarizerCount").default(1).notNull(), // 汇总者数量
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type WorkflowSquare = typeof workflowSquares.$inferSelect;
export type InsertWorkflowSquare = typeof workflowSquares.$inferInsert;

/**
 * 工作流点赞表（去重）
 */
export const workflowLikes = pgTable("workflow_likes", {
  id: serial("id").primaryKey(),
  userId: varchar("userId", { length: 64 }).notNull(),
  squareId: varchar("squareId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowLike = typeof workflowLikes.$inferSelect;
export type InsertWorkflowLike = typeof workflowLikes.$inferInsert;

/**
 * 工作流讨论表
 */
export const workflowSquareDiscussions = pgTable("workflow_square_discussions", {
  id: serial("id").primaryKey(),
  squareId: varchar("squareId", { length: 64 }).notNull(),
  userId: varchar("userId", { length: 64 }).notNull(),
  userName: varchar("userName", { length: 128 }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WorkflowSquareDiscussion = typeof workflowSquareDiscussions.$inferSelect;
export type InsertWorkflowSquareDiscussion = typeof workflowSquareDiscussions.$inferInsert;

/**
 * 平台全局配置表（key-value 存储）
 * 用于管理员在 UI 上动态修改执行限制参数，无需改代码
 * key 格式：policy.{tier}.{field}，例如 policy.visitor.maxExperts
 */
export const platformConfig = pgTable("platform_config", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PlatformConfig = typeof platformConfig.$inferSelect;
export type InsertPlatformConfig = typeof platformConfig.$inferInsert;
