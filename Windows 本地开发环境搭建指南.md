# Windows 本地开发环境搭建指南（GitHub 版）

> 适用系统：Windows 10（2004+）或 Windows 11  
> 目标：在 Windows + WSL2 上运行 Orchestra（Mafdet.AI）开源项目  
> 说明：本指南面向公开仓库，本地环境不需要与线上服务器密钥保持一致

---

## 第一步：安装 WSL2

以管理员身份打开 PowerShell，执行：

```powershell
wsl --install
```

安装完成后重启电脑。首次进入 Ubuntu 终端时，按提示设置 WSL 的用户名和密码。

如果你之前装过 WSL1：

```powershell
wsl --set-default-version 2
wsl --update
```

---

## 第二步：安装 Windows Terminal（推荐）

在 Microsoft Store 安装 `Windows Terminal`，后续统一用它打开 Ubuntu（WSL）终端。

---

## 第三步：在 WSL2 中安装 Node.js 22

在 Ubuntu 终端执行：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc

nvm install 22
node -v
npm -v
```

---

## 第四步：安装 pnpm 9

```bash
npm install -g pnpm@9
pnpm -v
```

---

## 第五步：安装 VS Code 并连接 WSL

1. Windows 安装 [Visual Studio Code](https://code.visualstudio.com/)
2. 安装扩展：`ms-vscode-remote.remote-wsl`
3. 在 WSL 项目目录执行：

```bash
code .
```

---

## 第六步：从 GitHub 获取代码

请把代码放在 WSL 文件系统（例如 `~/projects`），不要放到 `/mnt/c` 下。

```bash
mkdir -p ~/projects
cd ~/projects

git clone <你的 GitHub 仓库地址> ai-workflow-app
cd ai-workflow-app
```

---

## 第七步：配置 `.env`

优先从模板复制：

```bash
# 如果仓库根目录已有 .env.example
cp .env.example .env

# 如果没有 .env.example，可使用这个模板
# cp deploy/env.example.txt .env
```

至少保证以下变量正确：

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
JWT_SECRET=请替换为随机字符串
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000

# 至少配置一种 LLM Key
GEMINI_API_KEY=your_key
# 或 BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY

# 管理后台登录（可选，但建议本地也配置）
ADMIN_USERNAME=administrator
ADMIN_PASSWORD_HASH=请用 pnpm hash:password 生成
```

重要安全说明：

- `.env` 只用于本地/服务器运行，不能提交到 Git。
- `JWT_SECRET` 不需要与生产环境一致，建议每个环境独立设置。
- API Key 明文只保存在你自己的环境变量中。

---

## 第八步：安装依赖并启动

```bash
pnpm install
pnpm db:push
pnpm dev
```

默认地址：

- 前端（Metro/Web）：`http://localhost:8081`
- 后端 API：`http://localhost:3000`
- 健康检查：`http://localhost:3000/api/health`

---

## 常见问题

**Q：管理员后台显示 `访问受限 / Error: HTTP 500`？**

通常是 `.env` 缺少 `ADMIN_USERNAME` 或 `ADMIN_PASSWORD_HASH`。补齐后重启服务。

**Q：登录时报“网络错误，请检查连接后重试”？**

检查 `EXPO_PUBLIC_API_BASE_URL` 是否为 `http://localhost:3000`，并确认后端已启动。

**Q：`db:push` 失败或提示数据库不可用？**

检查 `DATABASE_URL` 是否可连通（本项目使用 PostgreSQL，不需要 MySQL）。

**Q：WSL 文件在 Windows 哪里能看到？**

资源管理器输入：`\\wsl$\Ubuntu\home\你的用户名\projects`

---

## 环境速查

| 工具 | 推荐版本 | 验证命令 |
|------|------|------|
| WSL | 2.x | `wsl --version` |
| Ubuntu | 22.04 LTS | `lsb_release -a` |
| Node.js | 22.x | `node -v` |
| pnpm | 9.x | `pnpm -v` |
