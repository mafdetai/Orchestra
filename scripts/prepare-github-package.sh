#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$ROOT_DIR/github-release/source}"

if [[ -z "$TARGET_DIR" || "$TARGET_DIR" == "/" ]]; then
  echo "Invalid target directory: $TARGET_DIR" >&2
  exit 1
fi

if [[ "$TARGET_DIR" == "$ROOT_DIR" ]]; then
  echo "Target directory cannot be project root: $TARGET_DIR" >&2
  exit 1
fi

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

RSYNC_EXCLUDES=(
  "--exclude=.git/"
  "--exclude=.env"
  "--exclude=.env.*"
  "--exclude=node_modules/"
  "--exclude=.expo/"
  "--exclude=.m[a]nus/"
  "--exclude=dist/"
  "--exclude=web-dist/"
  "--exclude=github-release/"
  "--exclude=*Zone.Identifier"
  "--exclude=Orchestra (Mafdet.AI) 项目环境速查.md"
  "--exclude=Orchestra 开源版环境速查.md"
  "--exclude=Codex 接管环境速查.md"
  "--exclude=性能与封装优化方案（待执行）.md"
  "--exclude=PROJECT_CONTEXT.md"
  "--exclude=INDEPENDENCE_ANALYSIS.md"
  "--exclude=todo.md"
  "--exclude=deploy/DEPLOY-WINDOWS.md"
  "--exclude=deploy/DEPLOY-VSCODE.md"
)

rsync -a "${RSYNC_EXCLUDES[@]}" "$ROOT_DIR/" "$TARGET_DIR/"

if [[ -f "$ROOT_DIR/deploy/env.example.txt" ]]; then
  cp "$ROOT_DIR/deploy/env.example.txt" "$TARGET_DIR/.env.example"
elif [[ -f "$ROOT_DIR/.env" ]]; then
  awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{print $1"=__REPLACE_ME__"}' "$ROOT_DIR/.env" > "$TARGET_DIR/.env.example"
fi

echo "GitHub package prepared: $TARGET_DIR"
