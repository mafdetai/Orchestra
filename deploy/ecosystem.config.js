module.exports = {
  apps: [
    {
      name: "mafdet-ai-api",
      script: "./dist/index.js",
      cwd: "/var/www/mafdet-ai",

      // 进程管理
      instances: 1,          // 单实例（AI 任务有状态，暂不用集群）
      autorestart: true,     // 崩溃自动重启
      watch: false,          // 生产环境关闭文件监听
      max_memory_restart: "512M",

      // 环境变量（从 .env 文件加载）
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },

      // 日志配置
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "/var/log/pm2/mafdet-out.log",
      error_file: "/var/log/pm2/mafdet-error.log",
      merge_logs: true,

      // 优雅重启
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
