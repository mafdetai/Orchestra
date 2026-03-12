import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM, invokeGemini } from "./_core/llm";
import { CAPABILITY_CONFIG } from "../shared/workflow-types.js";
import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import * as db from "./db";
import { decryptModelKey, encryptModelKey, maskModelKey } from "./_core/model-key-crypto";

function throwUnauthorized(message = "请先登录"): never {
  throw new TRPCError({ code: "UNAUTHORIZED", message });
}

function throwForbidden(message = "无权限"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const ApiConfigSchema = z.object({
  provider: z.enum(["builtin", "openai", "custom"]),
  capabilityType: z.enum(["general", "data_analysis", "coding", "creative", "research", "risk", "finance", "strategy"]),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  selectedModelId: z.string().optional(),
});

const RoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  systemPrompt: z.string(),
  description: z.string(),
  type: z.enum(["initiator", "expert", "summarizer"]),
  apiConfig: ApiConfigSchema.optional(),
});

// ── 开发/测试模式：关闭所有次数限制 ────────────────────────────────────────────
// 设置环境变量 DEV_DISABLE_LIMITS=true 可在测试阶段跳过所有执行限制
// 上线时将其设为 false 或删除该变量即可重新启用
const DEV_DISABLE_LIMITS = process.env.DEV_DISABLE_LIMITS === "true";

// ── 访客执行策略（Policy Table）────────────────────────────────────────────────

/**
 * 执行策略缓存（从数据库加载，每 60 秒刷新一次）
 * 避免每次请求都查数据库
 */
let _policyCache: Record<string, string> | null = null;
let _policyCacheAt = 0;
const POLICY_CACHE_TTL = 60_000; // 60 秒

async function getPolicy(): Promise<Record<string, string>> {
  const now = Date.now();
  if (_policyCache && now - _policyCacheAt < POLICY_CACHE_TTL) {
    return _policyCache;
  }
  try {
    _policyCache = await db.getAllPlatformConfig();
    _policyCacheAt = now;
  } catch {
    // 数据库不可用时使用默认值
    _policyCache = { ...db.DEFAULT_POLICY_VALUES };
    _policyCacheAt = now;
  }
  return _policyCache!;
}

/** 使配置缓存失效（管理员保存后调用）*/
function invalidatePolicyCache() {
  _policyCache = null;
  _policyCacheAt = 0;
}

// IP 日限计数器（内存实现，生产环境可替换为 Redis）
const ipDailyCount = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return ip?.trim() ?? "unknown";
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function checkIpLimit(ip: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const entry = ipDailyCount.get(ip);
  if (!entry || entry.resetAt < todayStart) {
    ipDailyCount.set(ip, { count: 1, resetAt: todayStart + 86400000 });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

/**
 * 构建执行策略对象（从配置字典解析）
 */
function buildPolicy(cfg: Record<string, string>, tier: string) {
  const p = (key: string) => cfg[`policy.${tier}.${key}`];
  return {
    allowedModel: p("allowedModel") || null,
    maxExperts: parseInt(p("maxExperts") ?? "99", 10),
    dailyIpLimit: parseInt(p("dailyIpLimit") ?? "100", 10),
    maxInputChars: parseInt(p("maxInputChars") ?? "10000", 10),
    timeoutMs: parseInt(p("timeoutMs") ?? "120000", 10),
  };
}

/**
 * 获取执行策略：根据用户等级和是否有自带 Key 决定限制
 * 配置从数据库加载（管理员可在 UI 修改）
 */
async function getExecutionPolicy(user: { tier?: string; role?: string } | null, hasUserKey: boolean) {
  const cfg = await getPolicy();
  if (!user) return buildPolicy(cfg, "visitor");
  if (user.role === "admin" || user.tier === "pro") return buildPolicy(cfg, "pro");
  if (hasUserKey) return buildPolicy(cfg, "registered_with_key");
  return buildPolicy(cfg, "registered_no_key");
}

/**
 * 模型路由器：根据策略决定最终使用的模型
 * 如果策略强制 Flash，覆盖 apiConfig 中的模型设置
 */
type ApiConfigInput = { provider?: string; apiKey?: string; model?: string; baseUrl?: string; capabilityType?: string } | undefined;
type ApiConfigForced = { provider: string; apiKey?: string; model?: string; baseUrl?: string; capabilityType?: string };

function applyModelRouter(
  apiConfig: ApiConfigInput,
  policy: { allowedModel: string | null }
): ApiConfigInput | ApiConfigForced {
  if (!policy.allowedModel) return apiConfig; // Pro/自带Key：不限制
  // 强制使用 Flash：覆盖为内置 builtin（invokeLLM 会使用 Flash）
  const forced: ApiConfigForced = { ...(apiConfig ?? {}), provider: "builtin", model: policy.allowedModel };
  return forced;
}

// ── Helper: 调用 AI（支持内置 / OpenAI / 自定义） ────────────────────────────

type Message = { role: "system" | "user" | "assistant"; content: string };

async function callAI(
  messages: Message[],
  apiConfig?: { provider?: string; apiKey?: string; model?: string; baseUrl?: string; capabilityType?: string; roleType?: string }
): Promise<string> {
  const provider = apiConfig?.provider ?? "builtin";

  const capType = (apiConfig?.capabilityType ?? "general") as keyof typeof CAPABILITY_CONFIG;
  const capSuffix = CAPABILITY_CONFIG[capType]?.promptSuffix ?? "";
  if (capSuffix && messages.length > 0 && messages[0].role === "system") {
    messages = [
      { ...messages[0], content: messages[0].content + capSuffix },
      ...messages.slice(1),
    ];
  }

  if (provider === "builtin") {
    // 如果配置了 Gemini API Key，按角色类型路由到对应 Gemini 模型
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const roleType = apiConfig?.roleType ?? "expert";
      // 指挥官和汇总者使用 Pro，专家使用 Flash
      const geminiModel = (roleType === "initiator" || roleType === "summarizer")
        ? "gemini-2.5-pro"
        : "gemini-2.5-flash";
      // 如果策略强制了模型，优先使用策略模型
      const forcedModel = apiConfig?.model;
      const finalModel = forcedModel && forcedModel.startsWith("gemini") ? forcedModel : geminiModel;
      const response = await invokeGemini({ messages, model: finalModel });
      const raw = response.choices[0]?.message?.content;
      return typeof raw === "string" ? raw : Array.isArray(raw) ? JSON.stringify(raw) : "";
    }
    const response = await invokeLLM({ messages });
    const raw = response.choices[0]?.message?.content;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? JSON.stringify(raw) : "";
  }

  if (provider === "openai" || provider === "custom") {
    const apiKey = apiConfig?.apiKey;
    if (!apiKey) {
      throw new Error(`角色配置了 ${provider === "openai" ? "OpenAI" : "自定义"} API，但未提供 API Key。`);
    }
    const baseUrl = provider === "openai"
      ? "https://api.openai.com/v1"
      : (apiConfig?.baseUrl ?? "https://api.openai.com/v1");
    const model = apiConfig?.model ?? "gpt-4o";
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2000 }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown error");
      throw new Error(`API 调用失败 (${response.status}): ${errText}`);
    }
    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "";
  }

  const response2 = await invokeLLM({ messages });
  const raw2 = response2.choices[0]?.message?.content;
  return typeof raw2 === "string" ? raw2 : Array.isArray(raw2) ? JSON.stringify(raw2) : "";
}

// ── Helper: 发送邮件通知 ──────────────────────────────────────────────────────

async function sendCompletionEmail(
  toEmail: string,
  taskInput: string,
  templateName: string,
  summary: string,
  resendApiKey: string
): Promise<void> {
  const resend = new Resend(resendApiKey);
  const summaryHtml = summary
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
  const shortTask = taskInput.length > 100 ? taskInput.slice(0, 100) + "..." : taskInput;
  await resend.emails.send({
    from: "Orchestra <onboarding@resend.dev>",
    to: [toEmail],
    subject: "✅ 你的任务完成了 — Orchestra by Mafdet.AI",
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:20px}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}.header{background:linear-gradient(135deg,#6C63FF,#8B5CF6);padding:32px;text-align:center}.header h1{color:#fff;margin:0;font-size:24px}.header p{color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px}.badge{display:inline-block;background:rgba(255,255,255,.2);color:#fff;border-radius:20px;padding:4px 14px;font-size:12px;margin-top:12px}.body{padding:32px}.task-box{background:#f8f7ff;border-left:4px solid #6C63FF;border-radius:8px;padding:16px;margin-bottom:24px}.task-box .label{font-size:11px;color:#6C63FF;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}.task-box .task{color:#333;font-size:14px;line-height:1.6}.summary-title{font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:16px}.summary-content{color:#444;font-size:14px;line-height:1.8;border-top:1px solid #eee;padding-top:16px}.footer{background:#f8f8f8;padding:20px 32px;text-align:center;border-top:1px solid #eee}.footer p{color:#999;font-size:12px;margin:0}</style></head><body><div class="container"><div class="header"><h1>✅ 你的任务完成了</h1><p>Orchestra 多角色协同工作流已完成分析并产出综合报告</p><span class="badge">⚡ ${templateName}</span></div><div class="body"><div class="task-box"><div class="label">任务描述</div><div class="task">${shortTask}</div></div><div class="summary-title">📄 综合报告摘要</div><div class="summary-content">${summaryHtml}</div></div><div class="footer"><p>此邮件由 Orchestra by Mafdet.AI 自动发送 · 请勿回复</p></div></div></body></html>`,
  });
}

// ── Helper: 从系统工作流获取真实 Prompt（后端专用，不经过前端） ──────────────

interface RoleConfig {
  id: string;
  name: string;
  systemPrompt: string;
  description: string;
  type: "initiator" | "expert" | "summarizer";
  apiConfig?: {
    provider: string;
    capabilityType?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

interface WorkflowConfig {
  initiator: RoleConfig;
  experts: RoleConfig[];
  summarizer: RoleConfig;
}

function buildFallbackWorkflowConfig(expertCount: number): WorkflowConfig {
  const safeExpertCount = Math.max(0, expertCount || 0);
  return {
    initiator: {
      id: "fallback_initiator",
      name: "指挥官",
      systemPrompt: "原始模板缺失，当前仅展示流程结构。",
      description: "负责拆解任务并分发给并行专家",
      type: "initiator",
    },
    experts: Array.from({ length: safeExpertCount }).map((_, idx) => ({
      id: `fallback_expert_${idx + 1}`,
      name: `执行专家 ${idx + 1}`,
      systemPrompt: "原始模板缺失，当前仅展示流程结构。",
      description: "并行执行专项分析",
      type: "expert" as const,
    })),
    summarizer: {
      id: "fallback_summarizer",
      name: "汇总者",
      systemPrompt: "原始模板缺失，当前仅展示流程结构。",
      description: "负责整合所有专家输出",
      type: "summarizer",
    },
  };
}

function validateWorkflowRoleIds(configJson: string): void {
  let cfg: WorkflowConfig;
  try {
    cfg = JSON.parse(configJson) as WorkflowConfig;
  } catch {
    throw new Error("工作流配置 JSON 无法解析");
  }

  if (!cfg?.initiator || !cfg?.summarizer || !Array.isArray(cfg?.experts)) {
    throw new Error("工作流配置不完整，必须包含 initiator、experts、summarizer");
  }

  const allRoles: Array<{ role: RoleConfig; tag: string }> = [
    { role: cfg.initiator, tag: "initiator" },
    ...cfg.experts.map((role, idx) => ({ role, tag: `expert[${idx}]` })),
    { role: cfg.summarizer, tag: "summarizer" },
  ];

  const seen = new Set<string>();
  for (const { role, tag } of allRoles) {
    const id = role?.id?.trim?.() ?? "";
    if (!id) {
      throw new Error(`角色 ${tag} 缺少 id`);
    }
    if (seen.has(id)) {
      throw new Error(`检测到重复角色 ID：${id}。请确保每个角色 id 唯一`);
    }
    seen.add(id);
  }
}

/**
 * 如果是系统工作流，从数据库读取真实 Prompt 并注入到角色中
 * 前端传来的 systemPrompt 是占位符，此函数替换为真实内容
 */
async function injectSystemPrompts(
  role: z.infer<typeof RoleSchema>,
  systemWorkflowId?: string
): Promise<z.infer<typeof RoleSchema>> {
  if (!systemWorkflowId) return role;
  try {
    const configStr = await db.getSystemWorkflowConfig(systemWorkflowId);
    if (!configStr) return role;
    const config = JSON.parse(configStr) as WorkflowConfig;
    // 按角色 id 匹配，注入真实 systemPrompt
    const allRoles: RoleConfig[] = [
      config.initiator,
      ...(config.experts ?? []),
      config.summarizer,
    ].filter(Boolean);
    const match = allRoles.find((r) => r.id === role.id);
    if (match) {
      return { ...role, systemPrompt: match.systemPrompt };
    }
  } catch (err) {
    console.error("[SystemWorkflow] Failed to inject prompts:", err);
  }
  return role;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    // 获取当前用户详细信息（含 trialRunsLeft、tier）
    getProfile: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user?.openId) return null;
      try {
        const u = await db.getUserByOpenId(ctx.user.openId);
        if (!u) return null;
        return {
          trialRunsLeft: u.trialRunsLeft ?? 0,
          tier: u.tier ?? "user",
          role: u.role ?? "user",
        };
      } catch {
        return null;
      }
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // 管理员：获取所有用户列表
    listUsers: publicProcedure.query(async ({ ctx }) => {
      const user = ctx.user;
      if (!user?.openId) throwUnauthorized();
      // 内置管理员（__builtin_admin__）直接放行，无需查数据库
      const isBuiltinAdmin = user.openId === "__builtin_admin__";
      if (!isBuiltinAdmin) {
        const dbUser = await db.getUserByOpenId(user.openId);
        if (!dbUser || (dbUser.role !== "admin" && dbUser.tier !== "admin")) throwForbidden();
      }
      try {
        return await db.listAllUsers();
      } catch {
        return [];
      }
    }),

    // 管理员：设置用户 tier
    setUserTier: publicProcedure
      .input(z.object({ openId: z.string(), tier: z.enum(["user", "pro", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        const user = ctx.user;
        if (!user?.openId) throwUnauthorized();
        const isBuiltinAdmin = user.openId === "__builtin_admin__";
        if (!isBuiltinAdmin) {
          const dbUser = await db.getUserByOpenId(user.openId);
          if (!dbUser || (dbUser.role !== "admin" && dbUser.tier !== "admin")) throwForbidden();
        }
        await db.setUserTier(input.openId, input.tier);
        return { success: true };
      }),
  }),

  // ── 历史任务持久化 ──────────────────────────────────────────────────────────
  runs: router({
    // 获取历史任务列表
    list: publicProcedure.query(async () => {
      try {
        return await db.listWorkflowRuns(100);
      } catch {
        return [];
      }
    }),

    // 获取单条任务详情
    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        try {
          return await db.getWorkflowRun(input.id);
        } catch {
          return null;
        }
      }),

    // 创建新任务记录（执行开始时调用）
    create: publicProcedure
      .input(z.object({
        id: z.string(),
        templateId: z.string(),
        templateName: z.string(),
        task: z.string(),
        expertCount: z.number(),
        notificationEmail: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          await db.createWorkflowRun({
            id: input.id,
            templateId: input.templateId,
            templateName: input.templateName,
            task: input.task,
            status: "running",
            expertCount: input.expertCount,
            completedExperts: 0,
            notificationEmail: input.notificationEmail ?? null,
          });
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to create run:", err);
          return { success: false };
        }
      }),

    // 更新任务状态（执行过程中调用）
    update: publicProcedure
      .input(z.object({
        id: z.string(),
        status: z.enum(["pending", "running", "completed", "error"]).optional(),
        initiatorOutput: z.string().optional(),
        expertOutputs: z.string().optional(), // JSON string
        summaryOutput: z.string().optional(),
        completedExperts: z.number().optional(),
        errorMessage: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { id, ...data } = input;
          await db.updateWorkflowRun(id, data);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to update run:", err);
          return { success: false };
        }
      }),
  }),

  // ── 工作流模板持久化 ────────────────────────────────────────────────────────
  templates: router({
    // 获取工作流模板列表（系统工作流不返回 Prompt，保护核心资产）
    list: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.openId;
      try {
        const templates = await db.listWorkflowTemplates(userId);
        // 系统工作流：过滤掉 config 中每个角色的 systemPrompt，防止 Prompt 泄露给前端
        return templates.map((t) => {
          if (t.workflowType !== "system") return t;
          try {
            const config = JSON.parse(t.config) as WorkflowConfig;
            const sanitize = (role: RoleConfig) => ({ ...role, systemPrompt: "【系统保护内容】" });
            if (config.initiator) config.initiator = sanitize(config.initiator);
            if (Array.isArray(config.experts)) config.experts = config.experts.map(sanitize);
            if (config.summarizer) config.summarizer = sanitize(config.summarizer);
            return { ...t, config: JSON.stringify(config) };
          } catch {
            return t;
          }
        });
      } catch {
        return [];
      }
    }),

    // 保存（新建或更新）用户工作流模板
    upsert: publicProcedure
      .input(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        config: z.string(), // JSON string of WorkflowTemplate
        isDefault: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        try {
          validateWorkflowRoleIds(input.config);
          await db.upsertWorkflowTemplate({
            id: input.id,
            userId: userId ?? null,
            workflowType: "user",
            name: input.name,
            description: input.description ?? null,
            config: input.config,
            isDefault: input.isDefault ?? 0,
            sortOrder: 0,
          });
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to upsert template:", err);
          return { success: false };
        }
      }),

    // 删除工作流模板
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await db.deleteWorkflowTemplate(input.id);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to delete template:", err);
          return { success: false };
        }
      }),

    // 获取广场工作流公开元数据（已登录用户可用，不含 Prompt）
    // 用于从广场执行他人工作流时加载角色配置
    getPublic: publicProcedure
      .input(z.object({ workflowId: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("请先登录");
        const template = await db.getWorkflowTemplate(input.workflowId);
        if (!template) return null;
        // 返回角色元数据，不含 Prompt
        try {
          const config = JSON.parse(template.config) as WorkflowConfig;
          const sanitize = (role: RoleConfig) => ({
            ...role,
            systemPrompt: "广场工作流：Prompt 由作者保护",
          });
          if (config.initiator) config.initiator = sanitize(config.initiator);
          if (Array.isArray(config.experts)) config.experts = config.experts.map(sanitize);
          if (config.summarizer) config.summarizer = sanitize(config.summarizer);
          return {
            id: template.id,
            name: template.name,
            description: template.description,
            config: JSON.stringify(config),
          };
        } catch {
          return null;
        }
      }),
  }),

  // ── 系统工作流管理（管理员专用） ────────────────────────────────────────────
  systemWorkflows: router({
    // 管理员：列出所有系统工作流（含完整 Prompt）
    list: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throwUnauthorized();
      if (ctx.user.role !== "admin") throwForbidden();
      try {
        return await db.listSystemWorkflows();
      } catch {
        return [];
      }
    }),

    // 公开：列出系统工作流摘要（不含 Prompt，供普通用户选择使用）
    listPublic: publicProcedure.query(async () => {
      try {
        const workflows = await db.listSystemWorkflows();
        // 只返回摘要信息，不含 Prompt
        return workflows.map((w) => {
          let expertCount = 0;
          let scenarioTag: string | undefined;
          try {
            const cfg = JSON.parse(w.config) as WorkflowConfig & { scenarioTag?: string };
            expertCount = Array.isArray(cfg.experts) ? cfg.experts.length : 0;
            scenarioTag = cfg.scenarioTag;
          } catch { /* ignore */ }
          return {
            id: w.id,
            name: w.name,
            description: w.description ?? "",
            expertCount,
            scenarioTag,
          };
        });
      } catch {
        return [];
      }
    }),

    // 管理员：获取单个系统工作流完整配置
    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden();
        return await db.getSystemWorkflow(input.id);
      }),

    // 管理员：查看系统工作流版本历史（最新在前）
    versions: publicProcedure
      .input(z.object({ id: z.string(), limit: z.number().min(1).max(100).optional() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden();
        return await db.listSystemWorkflowVersions(input.id, input.limit ?? 30);
      }),

    // 管理员：创建系统工作流
    create: publicProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        config: z.string(), // 完整 JSON，含 Prompt
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden("无权限：仅管理员可创建系统工作流");
        try {
          validateWorkflowRoleIds(input.config);
          await db.createSystemWorkflow({
            id: input.id,
            name: input.name,
            description: input.description ?? null,
            config: input.config,
            isDefault: 0,
            sortOrder: input.sortOrder ?? 0,
          }, ctx.user?.openId ?? null);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to create system workflow:", err);
          return { success: false, error: String(err) };
        }
      }),

    // 管理员：更新系统工作流
    update: publicProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        config: z.string().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden();
        try {
          const { id, ...data } = input;
          if (typeof data.config === "string") {
            validateWorkflowRoleIds(data.config);
          }
          await db.updateSystemWorkflow(id, data, ctx.user?.openId ?? null);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to update system workflow:", err);
          return { success: false, error: String(err) };
        }
      }),

    // 管理员：回滚到指定版本
    rollback: publicProcedure
      .input(z.object({ id: z.string(), versionNo: z.number().int().positive() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden();
        try {
          const newVersionNo = await db.rollbackSystemWorkflowVersion(
            input.id,
            input.versionNo,
            ctx.user?.openId ?? null,
          );
          return { success: true, newVersionNo };
        } catch (err) {
          console.error("[DB] Failed to rollback system workflow:", err);
          return { success: false, error: String(err) };
        }
      }),

    // 管理员：删除系统工作流
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden();
        try {
          await db.deleteSystemWorkflow(input.id);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to delete system workflow:", err);
          return { success: false, error: String(err) };
        }
      }),
  }),

  // ── AI 模型管理（个人私有） ────────────────────────────────────────────
  models: router({
    // 获取当前用户的模型列表
    list: publicProcedure.query(async ({ ctx }) => {
      const userId = ctx.user?.openId;
      if (!userId) return [];
      try {
        const models = await db.listAiModels(userId);
        // 返回时对 apiKey 脱敏（只显示后 4 位）
        return models.map((m) => ({
          ...m,
          apiKey: maskModelKey(decryptModelKey(m.apiKey)),
        }));
      } catch {
        return [];
      }
    }),

    // 新增模型
    create: publicProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().min(1),
        provider: z.string().optional(),
        apiUrl: z.string().url(),
        apiKey: z.string().min(1),
        modelName: z.string().min(1),
        isDefault: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) throw new Error("请先登录");
        try {
          await db.createAiModel({
            id: input.id,
            userId,
            name: input.name,
            provider: input.provider ?? null,
            apiUrl: input.apiUrl,
            apiKey: encryptModelKey(input.apiKey),
            modelName: input.modelName,
            isDefault: input.isDefault ?? 0,
          });
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to create model:", err);
          return { success: false, error: String(err) };
        }
      }),

    // 更新模型
    update: publicProcedure
      .input(z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        provider: z.string().optional(),
        apiUrl: z.string().url().optional(),
        apiKey: z.string().optional(), // 空字符串表示不修改
        modelName: z.string().min(1).optional(),
        isDefault: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) throw new Error("请先登录");
        try {
          const { id, apiKey, ...rest } = input;
          const updateData: Record<string, unknown> = { ...rest };
          // 只有当 apiKey 非空且不是脱敏占位符时才更新
          if (apiKey && !apiKey.startsWith("...")) {
            updateData.apiKey = encryptModelKey(apiKey);
          }
          await db.updateAiModel(id, userId, updateData);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to update model:", err);
          return { success: false, error: String(err) };
        }
      }),

    // 删除模型
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) throw new Error("请先登录");
        try {
          await db.deleteAiModel(input.id, userId);
          return { success: true };
        } catch (err) {
          console.error("[DB] Failed to delete model:", err);
          return { success: false, error: String(err) };
        }
      }),

    // 获取单个模型的完整 apiKey（供编辑时回填）
    getKey: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) return null;
        try {
          const model = await db.getAiModel(input.id, userId);
          return model ? { apiKey: decryptModelKey(model.apiKey) } : null;
        } catch {
          return null;
        }
      }),
  }),

  workflow: router({
    // 系统工作流一次性执行（完全在后端完成，Prompt 不经过前端）
    executeSystemWorkflow: publicProcedure
      .input(z.object({
        systemWorkflowId: z.string(),
        userInput: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { systemWorkflowId, userInput } = input;
        const configStr = await db.getSystemWorkflowConfig(systemWorkflowId);
        if (!configStr) throw new Error("系统工作流不存在");
        const config = JSON.parse(configStr) as WorkflowConfig;
        const { initiator, experts, summarizer } = config;
        if (!initiator || !summarizer) throw new Error("工作流配置不完整");

        // Phase 1: initiator
        const role1Messages: Message[] = [
          { role: "system", content: initiator.systemPrompt },
          { role: "user", content: `任务描述：\n${userInput}` },
        ];
        const role1Output = await callAI(role1Messages, initiator.apiConfig);

        // Phase 2: parallel experts
        const expertOutputs: { roleId: string; roleName: string; output: string }[] = [];
        await Promise.allSettled(
          (experts ?? []).map(async (expert) => {
            const messages: Message[] = [
              { role: "system", content: expert.systemPrompt },
              { role: "user", content: `任务描述：\n${userInput}\n\n任务分析报告（由引导者提供）：\n${role1Output}\n\n请基于以上信息，从你的专业角度提供深入分析和建议。` },
            ];
            const out = await callAI(messages, expert.apiConfig);
            expertOutputs.push({ roleId: expert.id, roleName: expert.name, output: out });
          })
        );

        // Phase 3: summarizer
        const expertSection = expertOutputs
          .map((e) => `## ${e.roleName} 的分析\n\n${e.output}`)
          .join("\n\n---\n\n");
        const summaryMessages: Message[] = [
          { role: "system", content: summarizer.systemPrompt },
          { role: "user", content: `# 原始任务\n\n${userInput}\n\n---\n\n# 引导者分析\n\n${role1Output}\n\n---\n\n# 各专家分析报告\n\n${expertSection}\n\n---\n\n请整合以上所有专家的分析，生成一份全面、结构清晰的综合报告。` },
        ];
        const summaryOutput = await callAI(summaryMessages, summarizer.apiConfig);

        return {
          role1Output,
          expertOutputs,
          summaryOutput,
          expertCount: (experts ?? []).length,
          workflowName: config.initiator.name ? `系统工作流` : "系统工作流",
        };
      }),

    // 执行角色1（引导者）
    // systemWorkflowId: 如果是系统工作流，传入 ID 以便后端从数据库读取真实 Prompt
    executeRole: publicProcedure
      .input(z.object({
        role: RoleSchema,
        userInput: z.string(),
        context: z.string().optional(),
        systemWorkflowId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { userInput, context, systemWorkflowId } = input;
        // ── 执行策略检查 ──
        const hasUserKey = !!(input.role.apiConfig?.apiKey);
        const policy = await getExecutionPolicy(ctx.user, hasUserKey);
        // 输入字数限制
        if (userInput.length > policy.maxInputChars) {
          throw new Error(`输入内容超过字数限制（最多 ${policy.maxInputChars} 字），请缩短后重试。`);
        }
        // IP 日限检查（仅对访客和无 Key 用户）
        if (!DEV_DISABLE_LIMITS && (!ctx.user || !hasUserKey)) {
          const ip = getClientIp(ctx.req as Parameters<typeof getClientIp>[0]);
          const ipCheck = checkIpLimit(ip, policy.dailyIpLimit);
          if (!ipCheck.allowed) {
            throw new Error(`今日免费执行次数已达上限，请明天再试或登录账号继续使用。`);
          }
        }
        // 注册用户无 API Key：扣减试用次数（仅对 executeRole 扣减一次，不对 executeParallelRole/executeSummary 重复扣）
        if (!DEV_DISABLE_LIMITS && ctx.user?.openId && !hasUserKey) {
          const user = await db.getUserByOpenId(ctx.user.openId);
          const trialLeft = user?.trialRunsLeft ?? 0;
          if (trialLeft <= 0) {
            throw new Error(`你的免费试用次数已用完，请在「模型管理」中绑定自己的 API Key 即可无限使用。`);
          }
          await db.decrementTrialRuns(ctx.user.openId);
        }
        // 注入真实 Prompt（系统工作流）
        const role = await injectSystemPrompts(input.role, systemWorkflowId);
        // 模型路由器：访客/无Key用户强制 Flash
        const routedApiConfig = applyModelRouter(role.apiConfig, policy);
        const messages: Message[] = [
          { role: "system", content: role.systemPrompt },
          {
            role: "user",
            content: context
              ? `任务描述：\n${userInput}\n\n前置分析报告：\n${context}`
              : `任务描述：\n${userInput}`,
          },
        ];
        const output = await callAI(messages, { ...routedApiConfig, roleType: role.type });
        return {
          roleId: role.id,
          output,
          provider: routedApiConfig?.provider ?? "builtin",
          isDowngraded: !!policy.allowedModel, // 是否被降级到 Flash
          maxExperts: policy.maxExperts,
        };
      }),

    // 并行执行专家角色
    executeParallelRole: publicProcedure
      .input(z.object({
        role: RoleSchema,
        userInput: z.string(),
        role1Output: z.string(),
        systemWorkflowId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { userInput, role1Output, systemWorkflowId } = input;
        // ── 执行策略：模型路由（访客/无Key强制 Flash）
        const hasUserKey = !!(input.role.apiConfig?.apiKey);
        const policy = await getExecutionPolicy(ctx.user, hasUserKey);
        // 注入真实 Prompt（系统工作流）
        const role = await injectSystemPrompts(input.role, systemWorkflowId);
        const routedApiConfig = applyModelRouter(role.apiConfig, policy);
        const messages: Message[] = [
          { role: "system", content: role.systemPrompt },
          {
            role: "user",
            content: `任务描述：\n${userInput}\n\n任务分析报告（由引导者提供）：\n${role1Output}\n\n请基于以上信息，从你的专业角度提供深入分析和建议。`,
          },
        ];
        const output = await callAI(messages, { ...routedApiConfig, roleType: role.type });
        return {
          roleId: role.id,
          output,
          provider: routedApiConfig?.provider ?? "builtin",
          isDowngraded: !!policy.allowedModel,
        };
      }),

    // 汇总者生成最终报告
    executeSummary: publicProcedure
      .input(z.object({
        summarizerRole: RoleSchema,
        userInput: z.string(),
        role1Output: z.string(),
        expertOutputs: z.array(z.object({
          roleId: z.string(),
          roleName: z.string(),
          output: z.string(),
        })),
        systemWorkflowId: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { userInput, role1Output, expertOutputs, systemWorkflowId } = input;
        // ── 执行策略：模型路由
        const hasUserKey = !!(input.summarizerRole.apiConfig?.apiKey);
        const policy = await getExecutionPolicy(ctx.user, hasUserKey);
        // 注入真实 Prompt（系统工作流）
        const summarizerRole = await injectSystemPrompts(input.summarizerRole, systemWorkflowId);
        const routedApiConfig = applyModelRouter(summarizerRole.apiConfig, policy);
        const expertSection = expertOutputs
          .map((e) => `## ${e.roleName} 的分析\n\n${e.output}`)
          .join("\n\n---\n\n");
        const messages: Message[] = [
          { role: "system", content: summarizerRole.systemPrompt },
          {
            role: "user",
            content: `# 原始任务\n\n${userInput}\n\n---\n\n# 引导者分析\n\n${role1Output}\n\n---\n\n# 各专家分析报告\n\n${expertSection}\n\n---\n\n请整合以上所有专家的分析，生成一份全面、结构清晰的综合报告。`,
          },
        ];
        const output = await callAI(messages, { ...routedApiConfig, roleType: summarizerRole.type });
        return {
          roleId: summarizerRole.id,
          output,
          provider: routedApiConfig?.provider ?? "builtin",
          isDowngraded: !!policy.allowedModel,
        };
      }),

    // 广场执行计数
    incrementSquareUse: publicProcedure
      .input(z.object({ squareId: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await db.incrementUseCount(input.squareId);
          return { success: true };
        } catch {
          return { success: false };
        }
      }),

    // 发送完成通知邮件
    sendCompletionNotification: publicProcedure
      .input(z.object({
        email: z.string().email(),
        taskInput: z.string(),
        templateName: z.string(),
        summary: z.string(),
        resendApiKey: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { email, taskInput, templateName, summary, resendApiKey } = input;
        try {
          await sendCompletionEmail(email, taskInput, templateName, summary, resendApiKey);
          return { success: true, message: `通知邮件已发送至 ${email}` };
        } catch (err) {
          console.error("[Email] Failed to send:", err);
          return { success: false, message: String(err) };
        }
      }),
  }),

  // ─── 工作流广场路由 ─────────────────────────────────────────────────────────
  square: router({
    // 广场列表（热度/最新/官方精选）
    list: publicProcedure
      .input(z.object({
        sortBy: z.enum(["hot", "latest", "verified", "trending7d"]).default("hot"),
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().default(0),
      }))
      .query(async ({ input, ctx }) => {
        const items = await db.listSquare(input);
        const discussionMap = await db.getSquareDiscussionCounts(items.map(i => i.id));
        const discussionPreviewMap = await db.getSquareDiscussionPreviews(items.map(i => i.id), 3);
        // 如果用户已登录，返回其点赞状态
        let likedIds: string[] = [];
        if (ctx.user) {
          likedIds = await db.getUserLikes(ctx.user.openId, items.map(i => i.id));
        }
        return items.map(item => ({
          ...item,
          isLiked: likedIds.includes(item.id),
          discussionCount: discussionMap[item.id] ?? 0,
          discussionPreviews: discussionPreviewMap[item.id] ?? [],
        }));
      }),

    // 广场详情（含流程设计；Prompt 对登录用户可见，游客不可见）
    detail: publicProcedure
      .input(z.object({ squareId: z.string() }))
      .query(async ({ input, ctx }) => {
        const square = await db.getSquare(input.squareId);
        if (!square) {
          throw new TRPCError({ code: "NOT_FOUND", message: "工作流不存在" });
        }
        const canAccess = square.isPublic || (ctx.user && (ctx.user.openId === square.authorId || ctx.user.role === "admin"));
        if (!canAccess) {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权限查看该工作流" });
        }

        const template = await db.getWorkflowTemplate(square.workflowId);
        let cfg: WorkflowConfig = buildFallbackWorkflowConfig(square.expertCount);
        let missingTemplate = false;
        if (!template) {
          missingTemplate = true;
        } else {
          try {
            cfg = JSON.parse(template.config) as WorkflowConfig;
          } catch {
            missingTemplate = true;
            cfg = buildFallbackWorkflowConfig(square.expertCount);
          }
        }

        const isLoggedIn = !!ctx.user;
        const canViewPrompt = isLoggedIn && !square.isSystem && !missingTemplate;
        const maskedPrompt = missingTemplate
          ? "原始模板缺失，当前仅展示流程结构"
          : square.isSystem
            ? "官方工作流 Prompt 受保护"
            : "注册后可查看完整 Prompt 设计";
        const sanitize = (role: RoleConfig): RoleConfig => ({ ...role, systemPrompt: maskedPrompt });

        const outputConfig: WorkflowConfig = canViewPrompt
          ? cfg
          : {
              initiator: sanitize(cfg.initiator),
              experts: (cfg.experts ?? []).map(sanitize),
              summarizer: sanitize(cfg.summarizer),
            };

        const promptNotice = missingTemplate
          ? "说明：该工作流原始模板已不可用，当前展示的是流程结构快照。"
          : square.isSystem
            ? "说明：该工作流为官方保护模板，Prompt 不对外展示。"
            : canViewPrompt
              ? "说明：Prompt 设计仅对注册用户可见，你当前已登录，可查看完整内容。"
              : "说明：Prompt 设计仅对注册用户可见，请先注册后查看完整内容。";

        const discussionMap = await db.getSquareDiscussionCounts([square.id]);

        return {
          squareId: square.id,
          workflowId: square.workflowId,
          workflowName: square.workflowName,
          description: square.description,
          authorId: square.authorId,
          authorName: square.authorName,
          isVerified: square.isVerified,
          isSystem: square.isSystem,
          expertCount: square.expertCount,
          publishedAt: square.publishedAt,
          discussionCount: discussionMap[square.id] ?? 0,
          canViewPrompt,
          promptNotice,
          config: JSON.stringify(outputConfig),
        };
      }),

    // 发布工作流到广场
    publish: publicProcedure
      .input(z.object({
        workflowId: z.string(),
        isPublic: z.boolean().default(true),
      }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) throwUnauthorized("请先登录");
        const actorName = ctx.user?.name ?? "匿名用户";

        const template = await db.getWorkflowTemplate(input.workflowId);
        if (!template) {
          throw new TRPCError({ code: "NOT_FOUND", message: "工作流不存在" });
        }

        // 归属校验：仅允许发布自己的用户工作流；系统工作流仅管理员可发布
        const isOwner = template.workflowType === "user" && template.userId === userId;
        const canPublishSystem = template.workflowType === "system" && ctx.user?.role === "admin";
        if (!isOwner && !canPublishSystem) {
          throwForbidden("只能发布你自己的工作流");
        }

        // Pro 权限检查：只有 Pro 用户可以创建私密工作流
        if (!input.isPublic && ctx.user?.tier !== "pro" && ctx.user?.role !== "admin") {
          throw new Error("私密工作流需要 Pro 会员权限");
        }

        // expertCount 以真实配置为准，不信任前端输入
        let expertCount = 0;
        try {
          const cfg = JSON.parse(template.config) as WorkflowConfig;
          expertCount = Array.isArray(cfg.experts) ? cfg.experts.length : 0;
        } catch {
          expertCount = 0;
        }

        // 发布冲突策略：同一作者+同一 workflow 幂等更新（沿用原 squareId，保留历史热度和互动数据）
        const existing = await db.getSquareByAuthorAndWorkflow(userId, template.id);
        const targetSquareId = existing?.id ?? `sq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const squareId = await db.publishToSquare({
          id: targetSquareId,
          workflowId: template.id,
          authorId: userId,
          authorName: actorName,
          workflowName: template.name,
          description: template.description,
          isPublic: input.isPublic,
          isSystem: template.workflowType === "system",
          expertCount,
        });
        return { success: true, squareId, mode: existing ? "updated" : "created" };
      }),

    // 点赞 / 取消点赞
    like: publicProcedure
      .input(z.object({ squareId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) throw new Error("请先登录再点赞");
        return db.toggleLike(userId, input.squareId);
      }),

    discussions: router({
      // 讨论列表
      list: publicProcedure
        .input(z.object({
          squareId: z.string(),
          limit: z.number().min(1).max(100).default(30),
        }))
        .query(async ({ input, ctx }) => {
          const square = await db.getSquare(input.squareId);
          if (!square) throw new Error("工作流不存在");
          const canAccess = square.isPublic || (ctx.user && (ctx.user.openId === square.authorId || ctx.user.role === "admin"));
          if (!canAccess) throwForbidden("无权限查看该工作流讨论");
          return db.listSquareDiscussions(input.squareId, input.limit);
        }),

      // 发表评论
      add: publicProcedure
        .input(z.object({
          squareId: z.string(),
          content: z.string().min(1).max(2000),
        }))
        .mutation(async ({ input, ctx }) => {
          const userId = ctx.user?.openId;
          if (!userId) throwUnauthorized("请先登录后参与讨论");
          const square = await db.getSquare(input.squareId);
          if (!square) throw new Error("工作流不存在");
          const canAccess = square.isPublic || userId === square.authorId || ctx.user?.role === "admin";
          if (!canAccess) throwForbidden("无权限参与该工作流讨论");
          const content = input.content.trim();
          if (!content) throw new Error("讨论内容不能为空");
          const id = await db.createSquareDiscussion({
            squareId: input.squareId,
            userId,
            userName: ctx.user?.name ?? "匿名用户",
            content,
          });
          return { success: true, id };
        }),
    }),

    // 复制工作流（克隆到个人 DIY 列表）
    copy: publicProcedure
      .input(z.object({ squareId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.user?.openId;
        if (!userId) throw new Error("请先登录再复制");
        // 获取广场工作流信息
        const square = await db.getSquare(input.squareId);
        if (!square) throw new Error("工作流不存在");
        // 系统工作流（黑盒）不允许复制 config
        if (square.isSystem) {
          await db.incrementCopyCount(input.squareId);
          return { success: true, message: "已添加到你的工作流列表（内容受保护，可直接使用）", isSystem: true };
        }
        // 获取原始工作流 config
        const originalTemplate = await db.getWorkflowTemplate(square.workflowId);
        if (!originalTemplate) throw new Error("工作流配置不存在");
        // 克隆到用户个人工作流
        const newId = `wf_copy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await db.createWorkflowTemplate({
          id: newId,
          userId,
          workflowType: "user",
          name: `${square.workflowName}(副本)`,
          description: square.description,
          config: originalTemplate.config,
          isDefault: 0,
          sortOrder: 0,
          isActive: true,
        });
        await db.incrementCopyCount(input.squareId);
        return { success: true, message: "工作流已复制到你的 DIY 列表", newTemplateId: newId };
      }),

    // 管理员：设置认证状态
    setVerified: publicProcedure
      .input(z.object({ squareId: z.string(), isVerified: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throwUnauthorized();
        if (ctx.user.role !== "admin") throwForbidden();
        await db.setSquareVerified(input.squareId, input.isVerified);
        return { success: true };
      }),
  }),

  //  // ─── 平台配置路由（管理员修改执行限制） ───────────────────────────────────────
  config: router({
    // 公开：获取所有平台配置（包含默认值）
    getAll: publicProcedure.query(async () => {
      try {
        return await db.getAllPlatformConfig();
      } catch {
        return { ...db.DEFAULT_POLICY_VALUES };
      }
    }),

    // 管理员专用：批量保存配置
    setAll: publicProcedure
      .input(z.object({
        entries: z.array(z.object({
          key: z.string(),
          value: z.string(),
          description: z.string().optional(),
        })),
      }))
      .mutation(async ({ input, ctx }) => {
        const user = ctx.user;
        if (!user?.openId) throwUnauthorized();
        // 内置管理员（__builtin_admin__）直接放行，无需查数据库
        const isBuiltinAdmin = user.openId === "__builtin_admin__";
        if (!isBuiltinAdmin) {
          const dbUser = await db.getUserByOpenId(user.openId);
          if (!dbUser || (dbUser.role !== "admin" && dbUser.tier !== "admin")) throwForbidden();
        }
        await db.setPlatformConfigs(input.entries);
        // 使策略缓存失效，下次请求即时生效
        invalidatePolicyCache();
        return { success: true };
      }),
  }),

  // ─── 作者主页路由 ───────────────────────────────────────────────────────
  profile: router({
    // 获取用户公开主页
    get: publicProcedure
      .input(z.object({ openId: z.string() }))
      .query(async ({ input, ctx }) => {
        const profile = await db.getPublicProfile(input.openId);
        if (!profile) return null;
        const isOwner = ctx.user?.openId === input.openId;
        const workflows = await db.listSquareByAuthor(input.openId, isOwner);
        // 统计数据
        const totalUses = workflows.reduce((sum, w) => sum + w.useCount, 0);
        const totalLikes = workflows.reduce((sum, w) => sum + w.likeCount, 0);
        return {
          ...profile,
          isOwner,
          workflows,
          stats: { totalWorkflows: workflows.length, totalUses, totalLikes },
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
