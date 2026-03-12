# ─── Stage 1: 安装依赖 ────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm@9

# 复制依赖清单
COPY package.json pnpm-lock.yaml ./

# 安装全部依赖（包含 devDependencies，构建阶段需要）
RUN pnpm install --frozen-lockfile

# ─── Stage 2: 构建前端（Expo Web 静态文件）────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app

RUN npm install -g pnpm@9

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建 Expo Web 静态文件，输出到 dist/
RUN npx expo export --platform web

# ─── Stage 3: 构建后端（esbuild 打包）────────────────────────────────────────
FROM node:22-alpine AS backend-builder
WORKDIR /app

RUN npm install -g pnpm@9

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 编译后端，输出到 dist/index.js
RUN pnpm build

# ─── Stage 4: 生产镜像 ────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

RUN npm install -g pnpm@9

# 只复制生产依赖
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 复制构建产物
COPY --from=backend-builder /app/dist ./dist
COPY --from=frontend-builder /app/dist ./public

# 复制 drizzle 迁移文件（运行时可能需要）
COPY drizzle ./drizzle

# 非 root 用户运行（安全最佳实践）
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/index.js"]
