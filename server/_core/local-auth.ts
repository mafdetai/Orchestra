/**
 * 独立注册/登录系统（邮箱 + 密码）
 * 完全不依赖第三方 OAuth，支持 VPS 独立部署。
 */
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME } from "../../shared/const";
import { hashPassword, isLegacySha256Hash, verifyPassword } from "./password";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function registerLocalAuthRoutes(app: Express) {
  /**
   * POST /api/auth/register
   * body: { email, password, name? }
   */
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { email, password, name } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码不能为空" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "邮箱格式不正确" });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ error: "密码至少 6 位" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "数据库不可用" });
      return;
    }

    // 检查邮箱是否已注册
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, String(email).toLowerCase().trim()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "该邮箱已注册，请直接登录" });
      return;
    }

    const openId = `local_${randomUUID()}`;
    const passwordHash = hashPassword(String(password));
    const now = new Date();

    await db.insert(users).values({
      openId,
      email: String(email).toLowerCase().trim(),
      name: name ? String(name).trim() : String(email).split("@")[0],
      loginMethod: "local",
      passwordHash,
      role: "user",
      tier: "user",
      trialRunsLeft: 2,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });

    // 签发 session
    const sessionToken = await sdk.createSessionToken(openId, {
      name: name || String(email).split("@")[0],
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    res.json({
      success: true,
      user: {
        openId,
        email: String(email).toLowerCase().trim(),
        name: name || String(email).split("@")[0],
        loginMethod: "local",
        tier: "user",
        role: "user",
      },
    });
  });

  /**
   * POST /api/auth/login
   * body: { email, password }
   */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码不能为空" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "数据库不可用" });
      return;
    }

    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, String(email).toLowerCase().trim()))
      .limit(1);

    const user = result[0];

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "邮箱或密码错误" });
      return;
    }

    const passwordOk = verifyPassword(String(password), user.passwordHash);
    if (!passwordOk) {
      res.status(401).json({ error: "邮箱或密码错误" });
      return;
    }

    // 更新最后登录时间；旧 SHA-256 登录成功后自动升级为更安全的 scrypt 哈希
    const now = new Date();
    const updatePayload: { lastSignedIn: Date; updatedAt?: Date; passwordHash?: string } = {
      lastSignedIn: now,
    };
    if (isLegacySha256Hash(user.passwordHash)) {
      updatePayload.passwordHash = hashPassword(String(password));
      updatePayload.updatedAt = now;
    }
    await db.update(users).set(updatePayload).where(eq(users.openId, user.openId));

    // 签发 session
    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || user.email || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    res.json({
      success: true,
      user: {
        openId: user.openId,
        email: user.email,
        name: user.name,
        loginMethod: user.loginMethod,
        tier: user.tier,
        role: user.role,
      },
    });
  });
}
