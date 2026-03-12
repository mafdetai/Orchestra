import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  WorkflowTemplate, WorkflowRun, RoleOutput, WorkflowStatus,
} from '@/shared/workflow-types';
import { getApiBaseUrl } from '@/constants/oauth';

const STORAGE_KEY_TEMPLATES = '@workflow_templates_v5';
const STORAGE_KEY_HISTORY = '@workflow_history_v5';

// ── State ────────────────────────────────────────────────────────────────────

interface WorkflowState {
  templates: WorkflowTemplate[];
  selectedTemplateId: string;
  currentRun: WorkflowRun | null;
  history: WorkflowRun[];
  isLoaded: boolean;
}

const initialState: WorkflowState = {
  templates: [],
  selectedTemplateId: '',
  currentRun: null,
  history: [],
  isLoaded: false,
};

// ── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD_DATA'; templates: WorkflowTemplate[]; history: WorkflowRun[] }
  | { type: 'SET_TEMPLATES'; templates: WorkflowTemplate[] }
  | { type: 'SELECT_TEMPLATE'; id: string }
  | { type: 'START_RUN'; run: WorkflowRun }
  | { type: 'UPDATE_ROLE_OUTPUT'; roleId: string; output: Partial<RoleOutput> }
  | { type: 'FINISH_RUN'; finalDocument: string; status: WorkflowStatus; completedAt: number }
  | { type: 'ERROR_RUN' }
  | { type: 'CLEAR_RUN' };

function reducer(state: WorkflowState, action: Action): WorkflowState {
  switch (action.type) {
    case 'LOAD_DATA':
      return { ...state, templates: action.templates, history: action.history, isLoaded: true };
    case 'SET_TEMPLATES':
      return { ...state, templates: action.templates };
    case 'SELECT_TEMPLATE':
      return { ...state, selectedTemplateId: action.id };
    case 'START_RUN':
      return { ...state, currentRun: action.run };
    case 'UPDATE_ROLE_OUTPUT': {
      if (!state.currentRun) return state;
      const prev = state.currentRun.roleOutputs[action.roleId] ?? { roleId: action.roleId, output: '', status: 'idle' as const };
      return {
        ...state,
        currentRun: {
          ...state.currentRun,
          roleOutputs: { ...state.currentRun.roleOutputs, [action.roleId]: { ...prev, ...action.output } },
        },
      };
    }
    case 'FINISH_RUN': {
      if (!state.currentRun) return state;
      const finished: WorkflowRun = { ...state.currentRun, finalDocument: action.finalDocument, status: action.status, completedAt: action.completedAt };
      return { ...state, currentRun: finished, history: [finished, ...state.history].slice(0, 100) };
    }
    case 'ERROR_RUN':
      if (!state.currentRun) return state;
      return { ...state, currentRun: { ...state.currentRun, status: 'error', completedAt: Date.now() } };
    case 'CLEAR_RUN':
      return { ...state, currentRun: null };
    default:
      return state;
  }
}

// ── Helper: 将数据库记录转换为 WorkflowRun ────────────────────────────────────

type DbRunRow = {
  id: string;
  templateId: string;
  templateName: string;
  task: string;
  status: string;
  initiatorOutput: string | null;
  expertOutputs: string | null;
  summaryOutput: string | null;
  completedExperts: number;
  expertCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function dbRunToWorkflowRun(row: DbRunRow): WorkflowRun {
  const expertOutputsArr: Array<{ roleId: string; roleName: string; output: string }> =
    row.expertOutputs ? JSON.parse(row.expertOutputs) : [];

  const roleOutputs: Record<string, RoleOutput> = {};
  if (row.initiatorOutput) {
    roleOutputs['initiator'] = { roleId: 'initiator', output: row.initiatorOutput, status: 'completed' };
  }
  for (const e of expertOutputsArr) {
    roleOutputs[e.roleId] = { roleId: e.roleId, output: e.output, status: 'completed' };
  }
  if (row.summaryOutput) {
    roleOutputs['summarizer'] = { roleId: 'summarizer', output: row.summaryOutput, status: 'completed' };
  }

  // createdAt/updatedAt 可能是 string（JSON 序列化后）或 Date
  const toMs = (v: string | Date) => {
    if (typeof v === 'string') return new Date(v).getTime();
    return v.getTime();
  };

  return {
    id: row.id,
    templateId: row.templateId,
    templateName: row.templateName,
    input: row.task,
    status: (row.status as WorkflowStatus) ?? 'completed',
    roleOutputs,
    finalDocument: row.summaryOutput ?? '',
    startedAt: toMs(row.createdAt),
    completedAt: toMs(row.updatedAt),
  };
}

// ── Helper: tRPC 查询（不依赖 React hooks，可在 context 中直接调用） ─────────────

// tRPC + superjson 返回结构为 result.data.json，需要解包
function extractTrpcData(json: { result?: { data?: unknown } }): unknown {
  const dataObj = json?.result?.data;
  if (dataObj && typeof dataObj === 'object' && 'json' in (dataObj as object)) {
    return (dataObj as { json: unknown }).json;
  }
  return dataObj ?? null;
}

async function fetchTrpcQuery(procedure: string): Promise<unknown> {
  const base = getApiBaseUrl();
  const url = `${base}/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { result?: { data?: unknown } };
  return extractTrpcData(json);
}

async function fetchTrpcMutation(procedure: string, input: unknown): Promise<unknown> {
  const base = getApiBaseUrl();
  const url = `${base}/api/trpc/${procedure}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { result?: { data?: unknown } };
  return extractTrpcData(json);
}

// ── Context ──────────────────────────────────────────────────────────────────

interface WorkflowContextValue {
  state: WorkflowState;
  loadData: () => Promise<void>;
  addTemplate: (tpl: WorkflowTemplate) => Promise<void>;
  updateTemplate: (tpl: WorkflowTemplate) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  selectTemplate: (id: string) => void;
  resetTemplates: () => Promise<void>;
  startRun: (run: WorkflowRun) => void;
  updateRoleOutput: (roleId: string, output: Partial<RoleOutput>) => void;
  finishRun: (finalDocument: string, status?: WorkflowStatus) => Promise<void>;
  errorRun: () => void;
  clearRun: () => void;
}

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const isWeb = Platform.OS === 'web';

  const loadData = useCallback(async () => {
    try {
      let templates: WorkflowTemplate[] = [];
      let history: WorkflowRun[] = [];

      // 先从 AsyncStorage 加载（快速响应）
      const [tplJson, histJson] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_TEMPLATES),
        AsyncStorage.getItem(STORAGE_KEY_HISTORY),
      ]);
      if (tplJson) {
        try { templates = JSON.parse(tplJson); } catch { /* 忽略 */ }
      }
      if (histJson) {
        try { history = JSON.parse(histJson); } catch { /* 忽略 */ }
      }

      // Web 平台：再从数据库加载（数据库优先，覆盖 AsyncStorage）
      if (isWeb) {
        try {
          const [dbTemplates, dbRuns] = await Promise.all([
            fetchTrpcQuery('templates.list').catch(() => null),
            fetchTrpcQuery('runs.list').catch(() => null),
          ]);

          if (Array.isArray(dbTemplates) && dbTemplates.length > 0) {
            try {
              const parsed = dbTemplates.map((row: { config: string }) => JSON.parse(row.config) as WorkflowTemplate);
              if (parsed.length > 0) templates = parsed;
            } catch { /* 解析失败则保留 AsyncStorage 数据 */ }
          }

          if (Array.isArray(dbRuns) && dbRuns.length > 0) {
            try {
              history = (dbRuns as DbRunRow[]).map(dbRunToWorkflowRun);
            } catch { /* 解析失败则保留 AsyncStorage 数据 */ }
          }
        } catch { /* 数据库不可用，保留 AsyncStorage 数据 */ }
      }

      dispatch({ type: 'LOAD_DATA', templates, history });
    } catch {
      dispatch({ type: 'LOAD_DATA', templates: [], history: [] });
    }
  }, [isWeb]);

  // 初始化时加载数据
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 持久化模板（AsyncStorage + 数据库）
  const persistTemplates = useCallback(async (templates: WorkflowTemplate[]) => {
    await AsyncStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
    dispatch({ type: 'SET_TEMPLATES', templates });
    // 同步到数据库（Web 平台，异步不阻塞）
    if (isWeb) {
      for (const tpl of templates) {
        fetchTrpcMutation('templates.upsert', {
          id: tpl.id,
          name: tpl.name,
          description: tpl.description ?? '',
          config: JSON.stringify(tpl),
          isDefault: tpl.isDefault ? 1 : 0,
        }).catch(() => { /* 数据库同步失败不影响本地使用 */ });
      }
    }
  }, [isWeb]);

  const addTemplate = useCallback(async (tpl: WorkflowTemplate) => {
    await persistTemplates([...state.templates, tpl]);
  }, [state.templates, persistTemplates]);

  const updateTemplate = useCallback(async (tpl: WorkflowTemplate) => {
    await persistTemplates(state.templates.map(t => t.id === tpl.id ? tpl : t));
  }, [state.templates, persistTemplates]);

  const deleteTemplate = useCallback(async (id: string) => {
    const newTemplates = state.templates.filter(t => t.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(newTemplates));
    dispatch({ type: 'SET_TEMPLATES', templates: newTemplates });
    if (isWeb) {
      fetchTrpcMutation('templates.delete', { id }).catch(() => { /* 忽略 */ });
    }
  }, [state.templates, isWeb]);

  const selectTemplate = useCallback((id: string) => {
    dispatch({ type: 'SELECT_TEMPLATE', id });
  }, []);

  const resetTemplates = useCallback(async () => {
    await AsyncStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify([]));
    dispatch({ type: 'LOAD_DATA', templates: [], history: state.history });
  }, [state.history]);

  const startRun = useCallback((run: WorkflowRun) => {
    dispatch({ type: 'START_RUN', run });
  }, []);

  const updateRoleOutput = useCallback((roleId: string, output: Partial<RoleOutput>) => {
    dispatch({ type: 'UPDATE_ROLE_OUTPUT', roleId, output });
  }, []);

  const finishRun = useCallback(async (finalDocument: string, status: WorkflowStatus = 'completed') => {
    const completedAt = Date.now();
    dispatch({ type: 'FINISH_RUN', finalDocument, status, completedAt });
    if (state.currentRun) {
      const finished: WorkflowRun = { ...state.currentRun, finalDocument, status, completedAt };
      const newHistory = [finished, ...state.history].slice(0, 100);
      await AsyncStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(newHistory));
    }
  }, [state.currentRun, state.history]);

  const errorRun = useCallback(() => {
    dispatch({ type: 'ERROR_RUN' });
  }, []);

  const clearRun = useCallback(() => {
    dispatch({ type: 'CLEAR_RUN' });
  }, []);

  return (
    <WorkflowContext.Provider value={{
      state, loadData,
      addTemplate, updateTemplate, deleteTemplate, selectTemplate, resetTemplates,
      startRun, updateRoleOutput, finishRun, errorRun, clearRun,
    }}>
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider');
  return ctx;
}
