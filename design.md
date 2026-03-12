# AI 多角色工作流 — 设计文档

## 应用概述

一款支持10个AI角色串并行协作的移动工作流应用。工作流执行顺序为：
- **角色1**（引导者）：首先执行，处理用户输入，产出初步内容
- **角色2-9**（并行专家）：同时接收角色1的输出并行执行，各自产出专项内容
- **角色10**（汇总者）：收集所有角色输出，汇总生成最终文档

---

## 品牌色彩

| 用途 | 颜色 |
|------|------|
| 主色（Primary） | `#6C63FF`（紫色，代表智慧与协作） |
| 背景 | `#F8F7FF`（浅紫白） |
| 深色背景 | `#1A1A2E`（深蓝黑） |
| Surface | `#FFFFFF` / `#252540` |
| 成功 | `#22C55E` |
| 警告 | `#F59E0B` |
| 错误 | `#EF4444` |

---

## 屏幕列表

### 1. 首页（Home）
- 显示当前工作流配置摘要（10个角色名称与状态）
- 快速启动按钮
- 历史执行记录列表（最近5条）

### 2. 角色配置页（Roles Config）
- 列表显示10个角色卡片
- 每个角色可编辑：名称、系统提示词（System Prompt）、角色描述
- 角色1标记为"引导者"，角色2-9标记为"并行专家"，角色10标记为"汇总者"
- 支持重置为默认配置

### 3. 执行页（Run Workflow）
- 顶部：用户输入框（任务描述）
- 中部：实时执行状态可视化
  - 角色1执行状态（进行中/完成）
  - 角色2-9并行状态（8个小卡片同时显示进度）
  - 角色10汇总状态
- 底部：执行/停止按钮

### 4. 结果页（Result）
- 展示角色10汇总的最终文档（Markdown渲染）
- 可展开查看各角色的单独输出
- 分享/复制按钮

### 5. 历史记录页（History）
- 按时间倒序显示历史执行记录
- 每条记录显示：执行时间、任务描述摘要、状态
- 点击进入结果详情

---

## 关键用户流程

### 主流程：执行工作流
1. 用户在首页点击"开始执行"
2. 跳转到执行页，输入任务描述
3. 点击"运行"按钮
4. 角色1开始执行（显示加载动画）
5. 角色1完成后，角色2-9同时开始执行（8个并行进度条）
6. 所有角色2-9完成后，角色10开始汇总
7. 汇总完成，自动跳转到结果页
8. 用户查看最终文档，可分享或复制

### 配置流程：修改角色
1. 用户进入角色配置页
2. 点击某个角色卡片
3. 弹出编辑表单（名称、提示词）
4. 保存后自动更新

---

## 工作流引擎设计

### 状态机
```
IDLE → RUNNING_ROLE1 → RUNNING_PARALLEL (角色2-9) → RUNNING_SUMMARY → COMPLETED
                                                                      ↓
                                                                    ERROR
```

### 数据结构
```typescript
type RoleStatus = 'idle' | 'running' | 'completed' | 'error';

interface Role {
  id: number;          // 1-10
  name: string;
  systemPrompt: string;
  description: string;
  type: 'initiator' | 'expert' | 'summarizer';
}

interface WorkflowRun {
  id: string;
  input: string;
  startedAt: Date;
  completedAt?: Date;
  roleOutputs: Record<number, string>;  // roleId -> output
  finalDocument?: string;
  status: 'running' | 'completed' | 'error';
}
```

---

## Tab 导航结构

| Tab | 图标 | 标题 |
|-----|------|------|
| 首页 | house.fill | 工作流 |
| 角色配置 | person.3.fill | 角色 |
| 历史记录 | clock.fill | 历史 |
