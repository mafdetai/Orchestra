/**
 * 独立管理员账号体系
 * 使用用户名 + 密码（推荐 scrypt 哈希）验证，不依赖第三方 OAuth
 * 管理员凭证通过环境变量配置：ADMIN_USERNAME / ADMIN_PASSWORD_HASH
 */
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import { isLegacySha256Hash, verifyPassword } from "./password";

// 管理员专用 cookie 名称（与普通用户 session 分开）
export const ADMIN_COOKIE_NAME = "mafdet_admin_session";

// 固定的管理员 openId（用于在 DB 中标识管理员用户）
const ADMIN_OPEN_ID = "__builtin_admin__";

function getSessionSecret() {
  const secret = ENV.cookieSecret || "fallback-secret-change-in-production";
  return new TextEncoder().encode(secret);
}

async function signAdminSession(): Promise<string> {
  const secretKey = getSessionSecret();
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + ONE_YEAR_MS) / 1000);

  return new SignJWT({
    openId: ADMIN_OPEN_ID,
    appId: ENV.appId || "admin",
    name: "Administrator",
    isAdmin: true,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

export async function verifyAdminSession(
  cookieHeader: string | undefined,
): Promise<boolean> {
  if (!cookieHeader) return false;

  // Parse cookie header manually
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((part) => {
    const [key, ...vals] = part.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(vals.join("="));
  });

  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return false;

  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ["HS256"] });
    return (payload as any).isAdmin === true && (payload as any).openId === ADMIN_OPEN_ID;
  } catch {
    return false;
  }
}

export function registerAdminAuthRoutes(app: Express) {
  // POST /api/admin/login — 管理员登录
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username || !password) {
      res.status(400).json({ error: "用户名和密码不能为空" });
      return;
    }

    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedHash = process.env.ADMIN_PASSWORD_HASH;

    if (!expectedUsername || !expectedHash) {
      res.status(500).json({ error: "管理员账号未配置，请设置 ADMIN_USERNAME 和 ADMIN_PASSWORD_HASH 环境变量" });
      return;
    }

    const usernameMatch = username === expectedUsername;
    // 支持三种验证方式：
    // 1. scrypt 哈希（推荐）
    // 2. 旧 SHA-256 哈希（兼容）
    // 3. 明文密码（仅兼容旧配置，不推荐）
    const passwordMatch = expectedHash.startsWith("scrypt$")
      ? verifyPassword(password, expectedHash)
      : isLegacySha256Hash(expectedHash)
        ? verifyPassword(password, expectedHash)
        : password === expectedHash;

    if (!usernameMatch || !passwordMatch) {
      res.status(401).json({ error: "用户名或密码错误" });
      return;
    }

    try {
      const sessionToken = await signAdminSession();
      const cookieOptions = getSessionCookieOptions(req);

      res.cookie(ADMIN_COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.json({
        success: true,
        token: sessionToken,
        user: {
          openId: ADMIN_OPEN_ID,
          name: "Administrator",
          role: "admin",
        },
      });
    } catch (error) {
      console.error("[AdminAuth] Failed to sign session:", error);
      res.status(500).json({ error: "登录失败，请稍后重试" });
    }
  });

  // POST /api/admin/logout — 管理员退出
  app.post("/api/admin/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(ADMIN_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/admin/me — 验证管理员 session
  app.get("/api/admin/me", async (req: Request, res: Response) => {
    const isAdmin = await verifyAdminSession(req.headers.cookie);
    if (!isAdmin) {
      res.status(401).json({ error: "未登录或 session 已过期" });
      return;
    }
    res.json({
      user: {
        openId: ADMIN_OPEN_ID,
        name: "Administrator",
        role: "admin",
      },
    });
  });
}
