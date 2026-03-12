#!/bin/bash
# ============================================================
# mafdet.ai — Hetzner 服务器初始化脚本
# 在全新 Ubuntu 24.04 服务器上以 root 身份运行
# ============================================================
set -e

echo "================================================"
echo "  mafdet.ai 服务器初始化"
echo "================================================"

# 1. 更新系统
echo "[1/6] 更新系统包..."
apt update -y && apt upgrade -y

# 2. 安装 Node.js 22
echo "[2/6] 安装 Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v

# 3. 安装 pnpm
echo "[3/6] 安装 pnpm..."
npm install -g pnpm@9
pnpm -v

# 4. 安装 PM2
echo "[4/6] 安装 PM2..."
npm install -g pm2
pm2 -v

# 5. 安装 Nginx + Certbot
echo "[5/6] 安装 Nginx 和 Certbot..."
apt install -y nginx certbot python3-certbot-nginx

# 6. 创建应用目录
echo "[6/6] 创建应用目录..."
mkdir -p /var/www/mafdet-ai
mkdir -p /var/log/pm2
chown -R root:root /var/www/mafdet-ai

echo ""
echo "================================================"
echo "  初始化完成！"
echo "  Node: $(node -v)"
echo "  pnpm: $(pnpm -v)"
echo "  PM2:  $(pm2 -v)"
echo "  Nginx: $(nginx -v 2>&1)"
echo "================================================"
