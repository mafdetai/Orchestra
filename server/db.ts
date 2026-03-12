import { desc, eq, isNull, or, and, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import {
  AiModel,
  InsertAiModel,
  InsertWorkflowSquareDiscussion,
  InsertUser,
  InsertWorkflowRun,
  InsertWorkflowSquare,
  InsertWorkflowTemplate,
  InsertWorkflowTemplateVersion,
  WorkflowSquareDiscussion,
  WorkflowSquare,
  WorkflowTemplateVersion,
  aiModels,
  platformConfig,
  users,
  workflowLikes,
  workflowSquareDiscussions,
  workflowRuns,
  workflowSquares,
  workflowTemplateVersions,
  workflowTemplates,
} from "../drizzle/schema";
import type { WorkflowTemplate } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _squareDiscussionTableReady: Promise<void> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
// NEON_DATABASE_URL takes priority over DATABASE_URL (which may be a built-in placeholder).
export async function getDb() {
  const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!_db && dbUrl) {
    try {
      const sql = neon(dbUrl);
      _db = drizzle(sql);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function ensureSquareDiscussionTable() {
  if (_squareDiscussionTableReady) return _squareDiscussionTableReady;
  _squareDiscussionTableReady = (async () => {
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "workflow_square_discussions" (
        "id" serial PRIMARY KEY,
        "squareId" varchar(64) NOT NULL,
        "userId" varchar(64) NOT NULL,
        "userName" varchar(128),
        "content" text NOT NULL,
        "createdAt" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "idx_square_discussions_square_created"
      ON "workflow_square_discussions" ("squareId", "createdAt" DESC)
    `);
  })().catch((err) => {
    _squareDiscussionTableReady = null;
    throw err;
  });
  return _squareDiscussionTableReady;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    // 首次注册赠送 2 次试用（仅在 INSERT 时设置，ON CONFLICT 时不覆盖）
    values.trialRunsLeft = values.trialRunsLeft ?? 2;

    // PostgreSQL: ON CONFLICT DO UPDATE (replaces MySQL's ON DUPLICATE KEY UPDATE)
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function decrementTrialRuns(openId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ trialRunsLeft: users.trialRunsLeft }).from(users).where(eq(users.openId, openId)).limit(1);
  const current = result[0]?.trialRunsLeft ?? 0;
  if (current <= 0) return 0;
  await db.update(users).set({ trialRunsLeft: current - 1 }).where(eq(users.openId, openId));
  return current - 1;
}

export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    openId: users.openId,
    name: users.name,
    email: users.email,
    tier: users.tier,
    role: users.role,
    trialRunsLeft: users.trialRunsLeft,
    createdAt: users.createdAt,
  }).from(users).orderBy(desc(users.createdAt)).limit(200);
}

export async function setUserTier(openId: string, tier: "user" | "pro" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ tier }).where(eq(users.openId, openId));
}

// ─── Workflow Runs ────────────────────────────────────────────────────────────

export async function createWorkflowRun(data: InsertWorkflowRun) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(workflowRuns).values(data);
  return data.id;
}

export async function getWorkflowRun(id: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function listWorkflowRuns(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt)).limit(limit);
}

export async function updateWorkflowRun(id: string, data: Partial<InsertWorkflowRun>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Always update updatedAt on manual updates
  await db.update(workflowRuns).set({ ...data, updatedAt: new Date() }).where(eq(workflowRuns.id, id));
}

// ─── Workflow Templates ───────────────────────────────────────────────────────

export async function createWorkflowTemplate(data: InsertWorkflowTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(workflowTemplates).values(data);
  return data.id;
}

/**
 * 列出用户可见的工作流：系统工作流（所有人可见）+ 该用户自己的工作流
 * 注意：返回结果中系统工作流的 config 字段将被调用方过滤（不返回 Prompt）
 */
export async function listWorkflowTemplates(userId?: string) {
  const db = await getDb();
  if (!db) return [];
  // 系统工作流（workflowType = 'system'）对所有人可见
  // 用户工作流（workflowType = 'user'）只对对应用户可见
  if (userId) {
    return db.select().from(workflowTemplates)
      .where(or(
        eq(workflowTemplates.workflowType, "system"),
        and(eq(workflowTemplates.workflowType, "user"), eq(workflowTemplates.userId, userId))
      ))
      .orderBy(desc(workflowTemplates.createdAt));
  }
  // 未登录用户只能看到系统工作流
  return db.select().from(workflowTemplates)
    .where(eq(workflowTemplates.workflowType, "system"))
    .orderBy(desc(workflowTemplates.createdAt));
}

/**
 * 管理员专用：列出所有系统工作流（含完整 config/Prompt）
 */
export async function listSystemWorkflows(): Promise<WorkflowTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workflowTemplates)
    .where(eq(workflowTemplates.workflowType, "system"))
    .orderBy(workflowTemplates.sortOrder, desc(workflowTemplates.createdAt));
}

/**
 * 管理员专用：获取单个系统工作流完整配置（含 Prompt）
 */
export async function getSystemWorkflow(id: string): Promise<WorkflowTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(workflowTemplates)
    .where(and(eq(workflowTemplates.id, id), eq(workflowTemplates.workflowType, "system")))
    .limit(1);
  return result[0] ?? null;
}

/**
 * 管理员专用：创建系统工作流
 */
export async function createSystemWorkflow(
  data: InsertWorkflowTemplate,
  actorOpenId?: string | null,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // userId 不传（让数据库使用默认值 NULL），避免 drizzle 将 null 序列化为空字符串导致插入失败
  const { userId: _uid, ...rest } = data;
  const payload = { ...rest, workflowType: "system" as const };
  await db.insert(workflowTemplates).values(payload);
  try {
    await createSystemWorkflowVersionSnapshot(data.id, {
      createdBy: actorOpenId ?? null,
      notes: "创建系统工作流",
    });
  } catch (error) {
    // 兼容迁移尚未执行场景：不中断主流程
    console.warn("[Versioning] Failed to create initial system workflow snapshot:", error);
  }
  return data.id;
}

/**
 * 管理员专用：更新系统工作流
 */
export async function updateSystemWorkflow(
  id: string,
  data: Partial<InsertWorkflowTemplate>,
  actorOpenId?: string | null,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 对历史数据做一次基线快照，避免升级后首次编辑丢失回滚点
  try {
    const before = await getSystemWorkflow(id);
    if (before) {
      const latest = await listSystemWorkflowVersions(id, 1);
      if (latest.length === 0) {
        await insertSystemWorkflowVersion({
          templateId: before.id,
          name: before.name,
          description: before.description ?? null,
          config: before.config,
          sortOrder: before.sortOrder ?? 0,
          isActive: before.isActive ?? true,
          createdBy: actorOpenId ?? null,
          notes: "初始化基线版本",
        });
      }
    }
  } catch (error) {
    // 兼容迁移尚未执行场景：不中断主流程
    console.warn("[Versioning] Failed to create baseline snapshot before update:", error);
  }

  await db.update(workflowTemplates)
    .set({ ...data, workflowType: "system", updatedAt: new Date() })
    // 不限制 workflowType，允许将 user 类型的工作流升级为 system 类型
    .where(eq(workflowTemplates.id, id));

  try {
    await createSystemWorkflowVersionSnapshot(id, {
      createdBy: actorOpenId ?? null,
      notes: "更新系统工作流",
    });
  } catch (error) {
    // 兼容迁移尚未执行场景：不中断主流程
    console.warn("[Versioning] Failed to create system workflow snapshot after update:", error);
  }
}

/**
 * 管理员专用：删除系统工作流
 */
export async function deleteSystemWorkflow(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await createSystemWorkflowVersionSnapshot(id, {
      notes: "删除前快照",
    });
  } catch (error) {
    // 兼容迁移尚未执行场景：不中断主流程
    console.warn("[Versioning] Failed to snapshot before delete:", error);
  }
  await db.delete(workflowTemplates)
    .where(and(eq(workflowTemplates.id, id), eq(workflowTemplates.workflowType, "system")));
}

/**
 * 管理员专用：列出系统工作流版本历史（最新在前）
 */
export async function listSystemWorkflowVersions(
  templateId: string,
  limit = 30,
): Promise<WorkflowTemplateVersion[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(workflowTemplateVersions)
    .where(eq(workflowTemplateVersions.templateId, templateId))
    .orderBy(desc(workflowTemplateVersions.versionNo), desc(workflowTemplateVersions.createdAt))
    .limit(limit);
}

/**
 * 管理员专用：回滚系统工作流到指定版本
 * 回滚成功后会生成一个新版本，记录本次回滚结果
 */
export async function rollbackSystemWorkflowVersion(
  templateId: string,
  versionNo: number,
  actorOpenId?: string | null,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select()
    .from(workflowTemplateVersions)
    .where(and(
      eq(workflowTemplateVersions.templateId, templateId),
      eq(workflowTemplateVersions.versionNo, versionNo),
    ))
    .limit(1);
  const snapshot = rows[0];
  if (!snapshot) {
    throw new Error(`版本 v${versionNo} 不存在`);
  }

  await db.update(workflowTemplates)
    .set({
      workflowType: "system",
      name: snapshot.name,
      description: snapshot.description ?? null,
      config: snapshot.config,
      sortOrder: snapshot.sortOrder ?? 0,
      isActive: snapshot.isActive ?? true,
      updatedAt: new Date(),
    })
    .where(eq(workflowTemplates.id, templateId));

  return createSystemWorkflowVersionSnapshot(templateId, {
    createdBy: actorOpenId ?? null,
    notes: `回滚到 v${versionNo}`,
  });
}

async function createSystemWorkflowVersionSnapshot(
  templateId: string,
  options: { createdBy?: string | null; notes?: string | null } = {},
): Promise<number> {
  const current = await getSystemWorkflow(templateId);
  if (!current) throw new Error("系统工作流不存在");
  return insertSystemWorkflowVersion({
    templateId: current.id,
    name: current.name,
    description: current.description ?? null,
    config: current.config,
    sortOrder: current.sortOrder ?? 0,
    isActive: current.isActive ?? true,
    createdBy: options.createdBy ?? null,
    notes: options.notes ?? null,
  });
}

async function insertSystemWorkflowVersion(
  data: Omit<InsertWorkflowTemplateVersion, "versionNo">,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const latest = await db.select({ versionNo: workflowTemplateVersions.versionNo })
    .from(workflowTemplateVersions)
    .where(eq(workflowTemplateVersions.templateId, data.templateId))
    .orderBy(desc(workflowTemplateVersions.versionNo))
    .limit(1);
  const versionNo = (latest[0]?.versionNo ?? 0) + 1;

  await db.insert(workflowTemplateVersions).values({
    ...data,
    versionNo,
  });

  return versionNo;
}

/**
 * 获取系统工作流的完整 config（含 Prompt）供执行时使用
 * 该函数仅在后端执行时调用，不经过前端
 */
export async function getSystemWorkflowConfig(id: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ config: workflowTemplates.config })
    .from(workflowTemplates)
    .where(and(eq(workflowTemplates.id, id), eq(workflowTemplates.workflowType, "system")))
    .limit(1);
  return result[0]?.config ?? null;
}

export async function getWorkflowTemplate(id: string): Promise<WorkflowTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id)).limit(1);
  return result[0] ?? null;
}

export async function updateWorkflowTemplate(id: string, data: Partial<InsertWorkflowTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workflowTemplates).set({ ...data, updatedAt: new Date() }).where(eq(workflowTemplates.id, id));
}

export async function deleteWorkflowTemplate(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(workflowTemplates).where(eq(workflowTemplates.id, id));
}

export async function upsertWorkflowTemplate(data: InsertWorkflowTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // PostgreSQL: ON CONFLICT DO UPDATE
  await db.insert(workflowTemplates).values(data).onConflictDoUpdate({
    target: workflowTemplates.id,
    set: {
      name: data.name,
      description: data.description,
      config: data.config,
      isDefault: data.isDefault,
      updatedAt: new Date(),
    },
  });
  return data.id;
}

// ─── AI Models ───────────────────────────────────────────────────────────────

export async function listAiModels(userId: string): Promise<AiModel[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(aiModels)
    .where(eq(aiModels.userId, userId))
    .orderBy(desc(aiModels.createdAt));
}

export async function getAiModel(id: string, userId: string): Promise<AiModel | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(aiModels)
    .where(and(eq(aiModels.id, id), eq(aiModels.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

export async function createAiModel(data: InsertAiModel): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 如果设为默认，先清除该用户其他默认标记
  if (data.isDefault === 1) {
    await db.update(aiModels)
      .set({ isDefault: 0 })
      .where(eq(aiModels.userId, data.userId));
  }
  await db.insert(aiModels).values(data);
  return data.id;
}

export async function updateAiModel(id: string, userId: string, data: Partial<InsertAiModel>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 如果设为默认，先清除该用户其他默认标记
  if (data.isDefault === 1) {
    await db.update(aiModels)
      .set({ isDefault: 0 })
      .where(eq(aiModels.userId, userId));
  }
  await db.update(aiModels)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(aiModels.id, id), eq(aiModels.userId, userId)));
}

export async function deleteAiModel(id: string, userId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 只能删除自己的模型
  await db.delete(aiModels)
    .where(and(eq(aiModels.id, id), eq(aiModels.userId, userId)));
}

// ─── Workflow Square (工作流广场) ───────────────────────────────────────────────

/**
 * 计算热度分数：(likeCount*2 + useCount) / (hoursSincePublish+2)^1.5
 */
function calcHotScore(likeCount: number, useCount: number, publishedAt: Date): number {
  const hoursSince = (Date.now() - publishedAt.getTime()) / 3600000;
  return (likeCount * 2 + useCount) / Math.pow(hoursSince + 2, 1.5);
}

/**
 * 发布工作流到广场
 */
export async function publishToSquare(data: InsertWorkflowSquare): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const score = calcHotScore(data.likeCount ?? 0, data.useCount ?? 0, now);
  await db.insert(workflowSquares).values({ ...data, hotScore: score, publishedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: workflowSquares.id,
      set: {
        workflowId: data.workflowId,
        authorName: data.authorName,
        workflowName: data.workflowName,
        description: data.description,
        isPublic: data.isPublic ?? true,
        isSystem: data.isSystem ?? false,
        expertCount: data.expertCount ?? 0,
        updatedAt: now,
      },
    });
  return data.id;
}

/**
 * 广场列表（支持排序和筛选）
 * sortBy: hot | latest | verified
 */
export async function listSquare(opts: {
  sortBy?: "hot" | "latest" | "verified" | "trending7d";
  limit?: number;
  offset?: number;
  authorId?: string;
}): Promise<WorkflowSquare[]> {
  const db = await getDb();
  if (!db) return [];
  const { sortBy = "hot", limit = 20, offset = 0 } = opts;

  if (sortBy === "hot") {
    return db.select().from(workflowSquares)
      .where(eq(workflowSquares.isPublic, true))
      .orderBy(desc(workflowSquares.hotScore))
      .limit(limit).offset(offset);
  } else if (sortBy === "verified") {
    return db.select().from(workflowSquares)
      .where(and(eq(workflowSquares.isPublic, true), eq(workflowSquares.isVerified, true)))
      .orderBy(desc(workflowSquares.hotScore))
      .limit(limit).offset(offset);
  } else if (sortBy === "trending7d") {
    // 近7天趋势：按近 7 天内的点赞数 + 使用数加权排序
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return db.select().from(workflowSquares)
      .where(and(
        eq(workflowSquares.isPublic, true),
        // 迗用 hotScore 作为代理，实际部署后可改为基于 7 天内的增量计算
      ))
      .orderBy(desc(workflowSquares.hotScore))
      .limit(limit).offset(offset);
  } else {
    return db.select().from(workflowSquares)
      .where(eq(workflowSquares.isPublic, true))
      .orderBy(desc(workflowSquares.publishedAt))
      .limit(limit).offset(offset);
  }
}

/**
 * 作者主页：获取用户公开的工作流列表
 */
export async function listSquareByAuthor(authorId: string, includePrivate = false): Promise<WorkflowSquare[]> {
  const db = await getDb();
  if (!db) return [];
  if (includePrivate) {
    return db.select().from(workflowSquares)
      .where(eq(workflowSquares.authorId, authorId))
      .orderBy(desc(workflowSquares.publishedAt));
  }
  return db.select().from(workflowSquares)
    .where(and(eq(workflowSquares.authorId, authorId), eq(workflowSquares.isPublic, true)))
    .orderBy(desc(workflowSquares.publishedAt));
}

/**
 * 点赞 / 取消点赞，返回最新点赞数
 */
export async function toggleLike(userId: string, squareId: string): Promise<{ liked: boolean; likeCount: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(workflowLikes)
    .where(and(eq(workflowLikes.userId, userId), eq(workflowLikes.squareId, squareId)))
    .limit(1);

  const square = await db.select().from(workflowSquares).where(eq(workflowSquares.id, squareId)).limit(1);
  if (!square[0]) throw new Error("工作流不存在");

  let newLikeCount: number;
  let liked: boolean;

  if (existing.length > 0) {
    // 取消点赞
    await db.delete(workflowLikes).where(and(eq(workflowLikes.userId, userId), eq(workflowLikes.squareId, squareId)));
    newLikeCount = Math.max(0, square[0].likeCount - 1);
    liked = false;
  } else {
    // 点赞
    await db.insert(workflowLikes).values({ userId, squareId });
    newLikeCount = square[0].likeCount + 1;
    liked = true;
  }

  const newScore = calcHotScore(newLikeCount, square[0].useCount, square[0].publishedAt);
  await db.update(workflowSquares)
    .set({ likeCount: newLikeCount, hotScore: newScore, updatedAt: new Date() })
    .where(eq(workflowSquares.id, squareId));

  return { liked, likeCount: newLikeCount };
}

/**
 * 检查用户是否已点赞
 */
export async function getUserLikes(userId: string, squareIds: string[]): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  if (squareIds.length === 0) return [];
  const results = await db.select({ squareId: workflowLikes.squareId })
    .from(workflowLikes)
    .where(eq(workflowLikes.userId, userId));
  const likedSet = new Set(results.map(r => r.squareId));
  return squareIds.filter(id => likedSet.has(id));
}

/**
 * 工作流被使用时增加使用次数
 */
export async function incrementUseCount(squareId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const square = await db.select().from(workflowSquares).where(eq(workflowSquares.id, squareId)).limit(1);
  if (!square[0]) return;
  const newUseCount = square[0].useCount + 1;
  const newScore = calcHotScore(square[0].likeCount, newUseCount, square[0].publishedAt);
  await db.update(workflowSquares)
    .set({ useCount: newUseCount, hotScore: newScore, updatedAt: new Date() })
    .where(eq(workflowSquares.id, squareId));
}

/**
 * 复制工作流（增加 copyCount）
 */
export async function incrementCopyCount(squareId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const square = await db.select().from(workflowSquares).where(eq(workflowSquares.id, squareId)).limit(1);
  if (!square[0]) return;
  await db.update(workflowSquares)
    .set({ copyCount: square[0].copyCount + 1, updatedAt: new Date() })
    .where(eq(workflowSquares.id, squareId));
}

/**
 * 管理员：设置工作流认证状态
 */
export async function setSquareVerified(squareId: string, isVerified: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workflowSquares)
    .set({ isVerified, updatedAt: new Date() })
    .where(eq(workflowSquares.id, squareId));
}

/**
 * 获取广场工作流详情
 */
export async function getSquare(squareId: string): Promise<WorkflowSquare | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(workflowSquares).where(eq(workflowSquares.id, squareId)).limit(1);
  return result[0] ?? null;
}

/**
 * 根据作者 + 工作流 ID 查找已发布记录（用于发布幂等更新）
 */
export async function getSquareByAuthorAndWorkflow(authorId: string, workflowId: string): Promise<WorkflowSquare | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(workflowSquares)
    .where(and(eq(workflowSquares.authorId, authorId), eq(workflowSquares.workflowId, workflowId)))
    .limit(1);
  return result[0] ?? null;
}

/**
 * 广场讨论：读取评论列表
 */
export async function listSquareDiscussions(squareId: string, limit = 50): Promise<WorkflowSquareDiscussion[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    await ensureSquareDiscussionTable();
  } catch {
    return [];
  }
  return db.select().from(workflowSquareDiscussions)
    .where(eq(workflowSquareDiscussions.squareId, squareId))
    .orderBy(desc(workflowSquareDiscussions.createdAt))
    .limit(limit);
}

/**
 * 广场讨论：新增评论
 */
export async function createSquareDiscussion(data: InsertWorkflowSquareDiscussion): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await ensureSquareDiscussionTable();
  const inserted = await db.insert(workflowSquareDiscussions).values(data).returning({ id: workflowSquareDiscussions.id });
  return inserted[0]?.id ?? 0;
}

/**
 * 广场讨论：批量读取讨论数
 */
export async function getSquareDiscussionCounts(squareIds: string[]): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db || squareIds.length === 0) return {};
  try {
    await ensureSquareDiscussionTable();
  } catch {
    return {};
  }
  const rows = await db
    .select({
      squareId: workflowSquareDiscussions.squareId,
      count: sql<number>`count(*)::int`,
    })
    .from(workflowSquareDiscussions)
    .where(inArray(workflowSquareDiscussions.squareId, squareIds))
    .groupBy(workflowSquareDiscussions.squareId);
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.squareId] = Number(row.count ?? 0);
  }
  return result;
}

/**
 * 广场讨论：批量读取每个工作流的最新评论预览（按时间倒序，单个工作流最多 perSquare 条）
 */
export async function getSquareDiscussionPreviews(
  squareIds: string[],
  perSquare = 3
): Promise<Record<string, Array<{ userName: string | null; content: string; createdAt: Date }>>> {
  if (squareIds.length === 0 || perSquare <= 0) return {};
  const db = await getDb();
  if (!db) return {};
  try {
    await ensureSquareDiscussionTable();
  } catch {
    return {};
  }

  const rows = await db
    .select({
      squareId: workflowSquareDiscussions.squareId,
      userName: workflowSquareDiscussions.userName,
      content: workflowSquareDiscussions.content,
      createdAt: workflowSquareDiscussions.createdAt,
    })
    .from(workflowSquareDiscussions)
    .where(inArray(workflowSquareDiscussions.squareId, squareIds))
    .orderBy(desc(workflowSquareDiscussions.createdAt));

  const result: Record<string, Array<{ userName: string | null; content: string; createdAt: Date }>> = {};
  for (const row of rows) {
    if (!result[row.squareId]) result[row.squareId] = [];
    if (result[row.squareId].length >= perSquare) continue;
    const createdAt = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    result[row.squareId].push({
      userName: row.userName ?? null,
      content: row.content,
      createdAt,
    });
  }
  return result;
}

// ─── Platform Config (平台全局配置) ───────────────────────────────────────────

/**
 * 默认执行策略（数据库未配置时的兜底值）
 */
export const DEFAULT_POLICY_VALUES = {
  "policy.visitor.allowedModel": "gemini-2.5-flash",
  "policy.visitor.maxExperts": "2",
  "policy.visitor.dailyIpLimit": "5",
  "policy.visitor.maxInputChars": "5000",
  "policy.visitor.timeoutMs": "30000",
  "policy.registered_no_key.allowedModel": "gemini-2.5-flash",
  "policy.registered_no_key.maxExperts": "2",
  "policy.registered_no_key.dailyIpLimit": "10",
  "policy.registered_no_key.maxInputChars": "5000",
  "policy.registered_no_key.timeoutMs": "60000",
  "policy.registered_no_key.trialRunsOnRegister": "2",
  "policy.registered_with_key.allowedModel": "",
  "policy.registered_with_key.maxExperts": "99",
  "policy.registered_with_key.dailyIpLimit": "100",
  "policy.registered_with_key.maxInputChars": "10000",
  "policy.registered_with_key.timeoutMs": "120000",
  "policy.pro.allowedModel": "",
  "policy.pro.maxExperts": "99",
  "policy.pro.dailyIpLimit": "500",
  "policy.pro.maxInputChars": "20000",
  "policy.pro.timeoutMs": "180000",
} as const;

export type PolicyKey = keyof typeof DEFAULT_POLICY_VALUES;

/**
 * 读取所有平台配置（返回 key-value 对象，未配置的 key 使用默认值）
 */
export async function getAllPlatformConfig(): Promise<Record<string, string>> {
  const defaults: Record<string, string> = { ...DEFAULT_POLICY_VALUES };
  const db = await getDb();
  if (!db) return defaults;
  try {
    const rows = await db.select().from(platformConfig);
    for (const row of rows) {
      defaults[row.key] = row.value;
    }
  } catch {
    // DB 不可用时返回默认值
  }
  return defaults;
}

/**
 * 读取单个配置项（未配置时返回默认值）
 */
export async function getPlatformConfig(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return (DEFAULT_POLICY_VALUES as Record<string, string>)[key] ?? null;
  try {
    const rows = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
    if (rows[0]) return rows[0].value;
    return (DEFAULT_POLICY_VALUES as Record<string, string>)[key] ?? null;
  } catch {
    return (DEFAULT_POLICY_VALUES as Record<string, string>)[key] ?? null;
  }
}

/**
 * 批量写入配置项（管理员专用）
 */
export async function setPlatformConfigs(entries: Array<{ key: string; value: string; description?: string }>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const entry of entries) {
    await db.insert(platformConfig)
      .values({ key: entry.key, value: entry.value, description: entry.description ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: platformConfig.key,
        set: { value: entry.value, description: entry.description ?? null, updatedAt: new Date() },
      });
  }
}

/**
 * 作者主页：获取用户公开信息
 */
export async function getPublicProfile(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    openId: users.openId,
    name: users.name,
    avatarUrl: users.avatarUrl,
    bio: users.bio,
    tier: users.tier,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ?? null;
}
