// 工作流共享类型定义

export type RoleType = 'initiator' | 'expert' | 'summarizer';
export type RoleStatus = 'idle' | 'running' | 'completed' | 'error';
export type WorkflowStatus = 'idle' | 'running_role1' | 'running_parallel' | 'running_summary' | 'completed' | 'error';

/** AI 服务提供商 */
export type ApiProvider = 'builtin' | 'openai' | 'custom';

/** 角色专项能力类型 */
export type CapabilityType =
  | 'general'         // 通用
  | 'data_analysis'   // 数据分析
  | 'coding'          // 代码/技术
  | 'creative'        // 创意写作
  | 'research'        // 深度研究
  | 'risk'            // 风险评估
  | 'finance'         // 财务分析
  | 'strategy';       // 战略规划

export const API_PROVIDER_CONFIG: Record<ApiProvider, { label: string; color: string; models: string[] }> = {
  builtin: {
    label: '内置 LLM',
    color: '#6C63FF',
    models: ['default'],
  },
  openai: {
    label: 'OpenAI',
    color: '#10A37F',
    models: ['xxxxx', 'xxxxx', 'xxxxx', 'xxxxx'],
  },
  custom: {
    label: '自定义 API',
    color: '#F59E0B',
    models: [],
  },
};

export const CAPABILITY_CONFIG: Record<CapabilityType, { label: string; icon: string; color: string; promptSuffix: string }> = {
  general: {
    label: '通用',
    icon: '⚡',
    color: '#6C63FF',
    promptSuffix: '',
  },
  data_analysis: {
    label: '数据分析',
    icon: '📊',
    color: '#0EA5E9',
    promptSuffix: '\n\n【专项能力增强】你擅长数据分析，请在输出中尽量使用结构化数据、表格、数字指标和量化分析，提供数据驱动的洞察。',
  },
  coding: {
    label: '代码/技术',
    icon: '💻',
    color: '#8B5CF6',
    promptSuffix: '\n\n【专项能力增强】你擅长技术实现，请在输出中提供具体的技术方案、代码示例（如适用）、架构设计和技术选型建议。',
  },
  creative: {
    label: '创意写作',
    icon: '✨',
    color: '#EC4899',
    promptSuffix: '\n\n【专项能力增强】你擅长创意写作，请在输出中使用生动的语言、独特的视角和富有感染力的表达，激发读者的想象力。',
  },
  research: {
    label: '深度研究',
    icon: '🔬',
    color: '#14B8A6',
    promptSuffix: '\n\n【专项能力增强】你擅长深度研究，请在输出中引用权威来源、提供多维度分析、梳理关键发现，并给出有据可查的结论。',
  },
  risk: {
    label: '风险评估',
    icon: '⚠️',
    color: '#F59E0B',
    promptSuffix: '\n\n【专项能力增强】你擅长风险评估，请在输出中系统识别各类风险（高/中/低），量化影响程度，并提供具体的风险缓解措施。',
  },
  finance: {
    label: '财务分析',
    icon: '💰',
    color: '#22C55E',
    promptSuffix: '\n\n【专项能力增强】你擅长财务分析，请在输出中提供成本效益分析、ROI 估算、预算规划和财务可行性评估，使用具体数字支撑结论。',
  },
  strategy: {
    label: '战略规划',
    icon: '🎯',
    color: '#EF4444',
    promptSuffix: '\n\n【专项能力增强】你擅长战略规划，请在输出中提供清晰的战略框架、优先级排序、关键成功因素和可执行的战略路线图。',
  },
};

export interface RoleApiConfig {
  provider: ApiProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  capabilityType: CapabilityType;
  /** 引用模型管理页维护的模型 ID */
  selectedModelId?: string;
}

export interface Role {
  id: string;
  name: string;
  systemPrompt: string;
  description: string;
  type: RoleType;
  apiConfig?: RoleApiConfig;
}

export interface RoleOutput {
  roleId: string;
  output: string;
  status: RoleStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  provider?: ApiProvider;
}

/**
 * 工作流模板：内嵌完整角色定义，每个工作流独立维护自己的角色配置。
 * 不再引用全局角色库，每个工作流的引导者/专家/汇总者完全独立可配置。
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;

  // 内嵌角色定义（每个工作流独立，不共享全局角色库）
  initiator: Role;           // 引导者（固定1个）
  experts: Role[];           // 并行专家列表（N个，可增删）
  summarizer: Role;          // 汇总者（固定1个）

  createdAt: number;
}

export interface WorkflowRun {
  id: string;
  templateId: string;
  templateName: string;
  input: string;
  startedAt: number;
  completedAt?: number;
  roleOutputs: Record<string, RoleOutput>;
  finalDocument?: string;
  status: WorkflowStatus;
}

// ── 默认角色工厂函数 ──────────────────────────────────────────────────────────

export function makeDefaultInitiator(idSuffix = ''): Role {
  return {
    id: `role_initiator${idSuffix}`,
    name: '引导者',
    description: '分析用户输入，提炼核心主题，为后续角色提供结构化的任务背景',
    type: 'initiator',
    apiConfig: { provider: 'builtin', capabilityType: 'general' },
    systemPrompt: `你是一个专业的任务分析师。你的职责是：
1. 深入理解用户的任务需求
2. 提炼核心主题和关键要素
3. 输出结构化的任务分析报告，包含：任务背景、核心目标、关键约束、期望产出
请用清晰、简洁的语言输出，为后续专家提供明确的工作方向。`,
  };
}

export function makeDefaultSummarizer(idSuffix = ''): Role {
  return {
    id: `role_summarizer${idSuffix}`,
    name: '汇总者',
    description: '整合所有专家输出，生成最终综合文档',
    type: 'summarizer',
    apiConfig: { provider: 'builtin', capabilityType: 'general' },
    systemPrompt: `你是一个专业的文档整合专家。你将收到来自多个专家的分析报告，你需要：
1. 整合所有专家的核心观点和建议
2. 消除矛盾，形成统一的结论
3. 生成结构清晰、内容完整的综合报告
4. 报告应包含：执行摘要、详细分析、行动建议、风险提示
请输出专业的综合报告，用Markdown格式呈现，确保内容全面且有价值。`,
  };
}

export function makeExpertRole(name: string, capabilityType: CapabilityType, idSuffix = ''): Role {
  const capCfg = CAPABILITY_CONFIG[capabilityType];
  return {
    id: `role_expert_${capabilityType}${idSuffix}`,
    name,
    description: `${capCfg.label}方向的专项分析`,
    type: 'expert',
    apiConfig: { provider: 'builtin', capabilityType },
    systemPrompt: `你是一个专业的${name}。基于任务分析报告，请从你的专业角度深入分析，提供专业见解和具体建议，输出详细的分析报告。${capCfg.promptSuffix}`,
  };
}

/** 默认工作流模板（内嵌角色） */
export const DEFAULT_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: 'tpl_default',
  name: '空白工作流',
  description: '开源空壳示例：请自行创建和配置工作流',
  isDefault: false,
  initiator: {
    id: 'role_initiator',
    name: '指挥官',
    description: '分析任务并拆解执行目标',
    type: 'initiator',
    apiConfig: { provider: 'builtin', capabilityType: 'general' },
    systemPrompt: '请先创建你的工作流并配置 Prompt。',
  },
  experts: [],
  summarizer: {
    id: 'role_summarizer',
    name: '汇总者',
    description: '整合执行结果并生成总结',
    type: 'summarizer',
    apiConfig: { provider: 'builtin', capabilityType: 'general' },
    systemPrompt: '请先创建你的工作流并配置 Prompt。',
  },
  createdAt: 0,
};

// 向后兼容：保留旧的常量（供迁移期使用）
export const ROLE_ID_INITIATOR = 'role_initiator';
export const ROLE_ID_SUMMARIZER = 'role_summarizer';
export const ROLE_ID_RESEARCH = 'role_research';
export const ROLE_ID_RISK = 'role_risk';
export const ROLE_ID_STRATEGY = 'role_strategy';

/** @deprecated 使用 WorkflowTemplate.initiator/experts/summarizer 替代 */
export const DEFAULT_ROLES: Role[] = [
  DEFAULT_WORKFLOW_TEMPLATE.initiator,
  ...DEFAULT_WORKFLOW_TEMPLATE.experts,
  DEFAULT_WORKFLOW_TEMPLATE.summarizer,
];
