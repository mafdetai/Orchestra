import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyAdminSession } from "./admin-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// 内置管理员虚拟用户对象（不需要数据库）
const BUILTIN_ADMIN_USER: User = {
  id: -1,
  openId: "__builtin_admin__",
  name: "Administrator",
  email: null,
  loginMethod: "password",
  role: "admin",
  tier: "admin",
  avatarUrl: null,
  bio: null,
  trialRunsLeft: 9999,
  passwordHash: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSignedIn: new Date(),
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  // 优先检查内置管理员 session（不依赖 OAuth 和数据库）
  const isBuiltinAdmin = await verifyAdminSession(opts.req.headers.cookie);
  if (isBuiltinAdmin) {
    return {
      req: opts.req,
      res: opts.res,
      user: BUILTIN_ADMIN_USER,
    };
  }

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
