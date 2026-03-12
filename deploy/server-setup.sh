#!/bin/bash
# ============================================================
# mafdet.ai — 应用配置和启动脚本
# 在代码上传完成后，在服务器上以 root 身份运行
# ============================================================
set -e

APP_DIR="/var/www/mafdet-ai"
DOMAIN="mafdet.ai"

echo "================================================"
echo "  mafdet.ai 应用配置和启动"
echo "================================================"

# 1. 安装依赖
echo "[1/5] 安装 Node 依赖..."
cd "$APP_DIR"
pnpm install --frozen-lockfile --prod

# 2. 初始化数据库（首次部署）
echo "[2/5] 初始化数据库..."
pnpm db:push

# 3. 配置 Nginx
echo "[3/5] 配置 Nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/mafdet-ai
sed -i "s/yourdomain.com/$DOMAIN/g" /etc/nginx/sites-available/mafdet-ai

# 更新 Nginx 前端静态文件路径
sed -i "s|root /var/www/ai-workflow-app;|root /var/www/mafdet-ai/web-dist;|g" /etc/nginx/sites-available/mafdet-ai

# 启用站点
ln -sf /etc/nginx/sites-available/mafdet-ai /etc/nginx/sites-enabled/mafdet-ai
rm -f /etc/nginx/sites-enabled/default

# 测试并重载 Nginx
nginx -t
systemctl reload nginx
echo "  Nginx 配置完成"

# 4. 启动后端
echo "[4/5] 启动后端服务..."
# 更新 PM2 配置中的路径
sed -i "s|/var/www/ai-workflow-app|/var/www/mafdet-ai|g" "$APP_DIR/deploy/ecosystem.config.js"
sed -i "s|/var/log/pm2/ai-workflow|/var/log/pm2/mafdet|g" "$APP_DIR/deploy/ecosystem.config.js"

pm2 start "$APP_DIR/deploy/ecosystem.config.js"
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
pm2 save
echo "  PM2 启动完成"

# 5. 健康检查
echo "[5/5] 健康检查..."
sleep 3
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "  ✓ 后端 API 正常响应"
else
  echo "  ✗ 后端未响应，请检查日志: pm2 logs mafdet-ai-api"
fi

echo ""
echo "================================================"
echo "  应用已启动！"
echo ""
echo "  下一步：申请 HTTPS 证书"
echo "  确保域名 $DOMAIN 已解析到本服务器 IP"
echo "  然后运行："
echo "    certbot --nginx -d $DOMAIN"
echo "================================================"
