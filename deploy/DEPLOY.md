# AI 多角色工作流 — Hetzner + Neon 部署指南

本文档描述如何将项目部署到 **Hetzner VPS（新加坡节点）** + **Neon PostgreSQL** 的生产环境。

---

## 一、前置准备

在开始之前，请确保已准备好以下内容：

| 项目 | 说明 | 获取方式 |
|------|------|---------|
| Hetzner VPS | CX22（2 核 4GB，新加坡节点）| [hetzner.com](https://www.hetzner.com/cloud) |
| 域名 | 用于 HTTPS 和 OAuth 回调 | 任意域名注册商 |
| Neon 数据库 | PostgreSQL 免费层 | [neon.tech](https://neon.tech) |
| AI API Key | OpenAI / DeepSeek / Groq 任选其一 | 各服务商官网 |
| OAuth App ID | 用于第三方 OAuth 登录（可选） | 你的 OAuth 提供方后台 |

---

## 二、Neon 数据库配置

**第 1 步：** 登录 [neon.tech](https://neon.tech)，创建新项目，选择距离用户最近的区域（推荐 `ap-southeast-1` 新加坡）。

**第 2 步：** 进入项目 → **Connection Details**，复制 **Connection string**，格式如下：

```
postgresql://user:password@ep-xxx-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

**第 3 步：** 后续将此字符串填入服务器的 `.env` 文件中的 `DATABASE_URL`。

---

## 三、Hetzner VPS 初始化

### 3.1 购买服务器

在 Hetzner Cloud 控制台：选择 **CX22**（2 核 4GB）→ 地区选 **Singapore**（新加坡）→ 系统选 **Ubuntu 24.04** → 添加 SSH 公钥 → 创建。

### 3.2 安装基础软件

SSH 登录服务器后，执行以下命令：

```bash
# 更新系统
apt update && apt upgrade -y

# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 安装 pnpm
npm install -g pnpm@9

# 安装 PM2（进程守护）
npm install -g pm2

# 安装 Nginx
apt install -y nginx

# 安装 Certbot（HTTPS 证书）
apt install -y certbot python3-certbot-nginx

# 验证安装
node -v    # 应显示 v22.x.x
pnpm -v    # 应显示 9.x.x
nginx -v   # 应显示 nginx/x.x.x
```

---

## 四、部署应用

### 4.1 上传代码

在本地项目目录执行（将 `your-server-ip` 替换为实际 IP）：

```bash
# 方式一：使用 rsync 上传（推荐）
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='dist' \
  ./ root@your-server-ip:/var/www/ai-workflow-app/

# 方式二：使用 Git（需先推送到 GitHub）
ssh root@your-server-ip
git clone https://github.com/your-username/ai-workflow-app.git /var/www/ai-workflow-app
```

### 4.2 配置环境变量

```bash
# 在服务器上
cd /var/www/ai-workflow-app

# 复制环境变量模板
cp deploy/env.example.txt .env

# 编辑 .env，填入真实值
nano .env
```

需要填写的关键变量：

```bash
DATABASE_URL=postgresql://...        # Neon 连接字符串
BUILT_IN_FORGE_API_URL=https://api.openai.com  # 或 DeepSeek
BUILT_IN_FORGE_API_KEY=sk-xxx        # 你的 API Key
LLM_MODEL=gpt-4o                     # 或 deepseek-chat
JWT_SECRET=<openssl rand -hex 32>    # 随机生成
VITE_APP_ID=xxx                      # OAuth App ID（可选）
OWNER_OPEN_ID=xxx                    # 系统 owner openId（可选）
EXPO_WEB_PREVIEW_URL=https://yourdomain.com
NODE_ENV=production
```

### 4.3 安装依赖并初始化数据库

```bash
cd /var/www/ai-workflow-app

# 安装依赖
pnpm install --frozen-lockfile

# 初始化数据库表（首次部署时执行）
pnpm db:push
```

### 4.4 构建项目

```bash
# 构建后端（输出到 dist/index.js）
pnpm build

# 构建前端静态文件（输出到 dist/）
npx expo export --platform web

# 将前端文件移动到 Nginx 服务目录
mkdir -p /var/www/ai-workflow-app/public
cp -r dist/* /var/www/ai-workflow-app/public/
```

> **注意：** 前端构建输出目录和后端构建输出目录都是 `dist/`，需要先构建后端，再构建前端，或分开处理。建议使用以下顺序：
> 1. `pnpm build`（后端 → `dist/index.js`）
> 2. `npx expo export --platform web --output-dir public`（前端 → `public/`）

### 4.5 启动后端服务

```bash
cd /var/www/ai-workflow-app

# 创建 PM2 日志目录
mkdir -p /var/log/pm2

# 使用 PM2 启动
pm2 start deploy/ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看运行状态
pm2 status
pm2 logs ai-workflow-api
```

---

## 五、配置 Nginx

### 5.1 部署配置文件

```bash
# 复制 Nginx 配置
cp /var/www/ai-workflow-app/deploy/nginx.conf /etc/nginx/sites-available/ai-workflow-app

# 修改配置中的域名
sed -i 's/yourdomain.com/your-actual-domain.com/g' /etc/nginx/sites-available/ai-workflow-app

# 启用站点
ln -s /etc/nginx/sites-available/ai-workflow-app /etc/nginx/sites-enabled/

# 删除默认站点（避免冲突）
rm -f /etc/nginx/sites-enabled/default

# 测试配置语法
nginx -t

# 重载 Nginx
systemctl reload nginx
```

### 5.2 配置 HTTPS（Let's Encrypt）

```bash
# 将域名 DNS 解析到服务器 IP 后执行
certbot --nginx -d yourdomain.com

# 自动续期（certbot 已自动配置，可验证）
certbot renew --dry-run
```

---

## 六、验证部署

```bash
# 检查后端是否正常响应
curl http://localhost:3000/api/health

# 检查 Nginx 是否正确代理
curl https://yourdomain.com/api/health

# 查看后端日志
pm2 logs ai-workflow-api --lines 50
```

访问 `https://yourdomain.com`，应看到 AI 工作流应用界面。

---

## 七、后续更新部署

每次更新代码后，执行以下命令：

```bash
cd /var/www/ai-workflow-app

# 拉取最新代码（如使用 Git）
git pull

# 安装新依赖（如有）
pnpm install --frozen-lockfile

# 如有数据库 schema 变更
pnpm db:push

# 重新构建
pnpm build
npx expo export --platform web --output-dir public

# 重启后端
pm2 restart ai-workflow-api
```

---

## 八、常见问题

**Q：数据库连接失败？**
检查 `DATABASE_URL` 是否包含 `?sslmode=require`，Neon 强制要求 SSL 连接。

**Q：AI 调用报错 401？**
检查 `BUILT_IN_FORGE_API_KEY` 是否正确，以及 `BUILT_IN_FORGE_API_URL` 是否与 Key 对应的服务商匹配。

**Q：OAuth 登录后无法回调？**
确认 `EXPO_WEB_PREVIEW_URL` 与 OAuth 提供方后台配置的回调域名完全一致（包含 `https://`）。

**Q：AI 任务执行超时？**
Nginx 的 `proxy_read_timeout` 已设置为 600 秒（10 分钟），如仍超时，检查 AI API 服务商是否有自己的超时限制。

---

## 九、推荐的 AI API 服务商

| 服务商 | 模型 | 价格（输入/输出 per 1M tokens） | 中文效果 |
|--------|------|-------------------------------|---------|
| **DeepSeek** | `deepseek-chat` | $0.14 / $0.28 | 极佳 |
| **Groq** | `llama-3.3-70b-versatile` | 免费额度 | 良好 |
| **OpenAI** | `gpt-4o-mini` | $0.15 / $0.60 | 良好 |
| **OpenAI** | `gpt-4o` | $2.50 / $10.00 | 优秀 |

对于中文工作流场景，**DeepSeek** 是性价比最高的选择，价格约为 OpenAI 的 1/10，中文理解能力优秀。
