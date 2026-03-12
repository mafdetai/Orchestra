import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  StyleSheet, Modal, useWindowDimensions, ActivityIndicator
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { RolesTab } from "@/components/roles-tab";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import {
  WorkflowTemplate, WorkflowRun, Role,
  CapabilityType,
  CAPABILITY_CONFIG,
  RoleApiConfig,
} from "@/shared/workflow-types";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import type { AiModelConfig } from "./models";

// 加载用户的模型列表
async function fetchUserModels(): Promise<AiModelConfig[]> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/trpc/models.list`, { credentials: "include" });
    if (!res.ok) return [];
    const json = await res.json() as { result?: { data?: { json?: unknown } | unknown } };
    // tRPC with superjson returns result.data.json
    const dataObj = json.result?.data;
    const arr = (dataObj as { json?: unknown })?.json ?? dataObj;
    return Array.isArray(arr) ? (arr as AiModelConfig[]) : [];
  } catch {
    return [];
  }
}

// 系统工作流类型（前端只读，不含 Prompt）
interface SystemWorkflow {
  id: string;
  name: string;
  description: string;
  scenarioTag?: string;
  expertCount: number;
}

// 加载用户 Profile（trialRunsLeft、tier）
async function fetchUserProfile(): Promise<{ trialRunsLeft: number; tier: string; role: string } | null> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/trpc/auth.getProfile`, { credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json() as { result?: { data?: { json?: unknown } | unknown } };
    // tRPC with superjson returns result.data.json
    const dataObj = json.result?.data;
    const obj = (dataObj as { json?: unknown })?.json ?? dataObj;
    return (obj as { trialRunsLeft: number; tier: string; role: string }) ?? null;
  } catch {
    return null;
  }
}

// 加载系统工作流列表（不含 Prompt）
async function fetchSystemWorkflows(): Promise<SystemWorkflow[]> {
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/trpc/systemWorkflows.listPublic`, { credentials: "include" });
    if (!res.ok) return [];
    const json = await res.json() as { result?: { data?: { json?: unknown } | unknown } };
    // tRPC with superjson returns result.data.json (array)
    const dataObj = json.result?.data;
    const arr = (dataObj as { json?: unknown })?.json ?? dataObj;
    return Array.isArray(arr) ? (arr as SystemWorkflow[]) : [];
  } catch {
    return [];
  }
}

// ── 内联专家编辑卡片// ── 内联专家编辑卡片 ────────────────────────────────────────────
interface ExpertDraft {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  capabilityType: CapabilityType;
  // 模型选择：使用「我的AI模型」维护的模型 ID，空字符串表示使用内置
  selectedModelId: string;
  expanded: boolean;
}

function ExpertCard({
  expert,
  index,
  colors,
  onChange,
  onDelete,
  availableModels,
}: {
  expert: ExpertDraft;
  index: number;
  colors: ReturnType<typeof useColors>;
  onChange: (updated: ExpertDraft) => void;
  onDelete: () => void;
  availableModels: AiModelConfig[];
}) {
  const capCfg = CAPABILITY_CONFIG[expert.capabilityType];
  const selectedModel = availableModels.find(m => m.id === expert.selectedModelId);
  const [showModelPicker, setShowModelPicker] = useState(false);

  return (
    <View style={[expertStyles.card, { backgroundColor: colors.surface, borderColor: expert.expanded ? "#0EA5E9" : colors.border }]}>
      {/* 卡片头部 */}
      <TouchableOpacity
        style={expertStyles.header}
        onPress={() => onChange({ ...expert, expanded: !expert.expanded })}
        activeOpacity={0.8}
      >
        <View style={expertStyles.headerLeft}>
          <View style={[expertStyles.indexBadge, { backgroundColor: "#0EA5E9" }]}>
            <Text style={expertStyles.indexText}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[expertStyles.expertName, { color: colors.foreground }]}>
              {expert.name || `专家 ${index + 1}`}
            </Text>
            <View style={expertStyles.badges}>
              <View style={[expertStyles.capBadge, { backgroundColor: capCfg.color + "20" }]}>
                <Text style={[expertStyles.capText, { color: capCfg.color }]}>{capCfg.icon} {capCfg.label}</Text>
              </View>
              {selectedModel ? (
                <View style={[expertStyles.provBadge, { backgroundColor: "#6C63FF15" }]}>
                  <Text style={[expertStyles.provText, { color: "#6C63FF" }]}>{selectedModel.name}</Text>
                </View>
              ) : (
                <View style={[expertStyles.provBadge, { backgroundColor: "#6B728020" }]}>
                  <Text style={[expertStyles.provText, { color: "#6B7280" }]}>内置 LLM</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={expertStyles.headerRight}>
          <TouchableOpacity onPress={onDelete} style={expertStyles.deleteBtn} activeOpacity={0.7}>
            <Text style={{ color: colors.error, fontSize: 18, lineHeight: 20 }}>×</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted, fontSize: 14 }}>{expert.expanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {/* 展开的配置区 */}
      {expert.expanded && (
        <View style={[expertStyles.body, { borderTopColor: colors.border }]}>
          {/* 名称 */}
          <Text style={[expertStyles.label, { color: colors.foreground }]}>专家名称 *</Text>
          <TextInput
            style={[expertStyles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={expert.name}
            onChangeText={v => onChange({ ...expert, name: v })}
            placeholder="例如：市场营销专家、法律顾问..."
            placeholderTextColor={colors.muted}
          />

          {/* 描述 */}
          <Text style={[expertStyles.label, { color: colors.foreground }]}>描述</Text>
          <TextInput
            style={[expertStyles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={expert.description}
            onChangeText={v => onChange({ ...expert, description: v })}
            placeholder="简述该专家的职责"
            placeholderTextColor={colors.muted}
          />

          {/* 系统提示词 */}
          <Text style={[expertStyles.label, { color: colors.foreground }]}>系统提示词（留空自动生成）</Text>
          <TextInput
            style={[expertStyles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, minHeight: 72 }]}
            value={expert.systemPrompt}
            onChangeText={v => onChange({ ...expert, systemPrompt: v })}
            placeholder="描述该专家的分析角度和输出要求..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />

          {/* 专项能力 */}
          <Text style={[expertStyles.label, { color: colors.foreground }]}>专项能力</Text>
          <View style={expertStyles.capGrid}>
            {(Object.keys(CAPABILITY_CONFIG) as CapabilityType[]).map(cap => {
              const cfg = CAPABILITY_CONFIG[cap];
              const isActive = expert.capabilityType === cap;
              return (
                <TouchableOpacity
                  key={cap}
                  style={[expertStyles.capPill, { borderColor: isActive ? cfg.color : colors.border, backgroundColor: isActive ? cfg.color + "15" : colors.background }]}
                  onPress={() => onChange({ ...expert, capabilityType: cap })}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13 }}>{cfg.icon}</Text>
                  <Text style={[expertStyles.capPillText, { color: isActive ? cfg.color : colors.muted }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* AI 模型选择 */}
          <Text style={[expertStyles.label, { color: colors.foreground }]}>AI 模型</Text>
          {availableModels.length === 0 ? (
            <View style={[expertStyles.noModelBox, { backgroundColor: "#F59E0B10", borderColor: "#F59E0B40" }]}>
              <Text style={[expertStyles.noModelText, { color: "#F59E0B" }]}>
                还没有可用模型，请先到「我的 / 我的AI模型」页面添加 API 配置
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[expertStyles.modelSelector, { backgroundColor: colors.background, borderColor: expert.selectedModelId ? "#6C63FF" : colors.border }]}
                onPress={() => setShowModelPicker(true)}
                activeOpacity={0.8}
              >
                {selectedModel ? (
                  <View style={{ flex: 1 }}>
                    <Text style={[expertStyles.modelSelectorName, { color: colors.foreground }]}>{selectedModel.name}</Text>
                    <Text style={[expertStyles.modelSelectorSub, { color: colors.muted }]}>
                      {selectedModel.provider ? `${selectedModel.provider} · ` : ""}{selectedModel.modelName}
                    </Text>
                  </View>
                ) : (
                  <Text style={[expertStyles.modelSelectorPlaceholder, { color: colors.muted }]}>选择模型...</Text>
                )}
                <Text style={{ color: colors.muted, fontSize: 14 }}>▼</Text>
              </TouchableOpacity>

              {/* 模型选择弹窗 */}
              <Modal visible={showModelPicker} transparent animationType="fade" onRequestClose={() => setShowModelPicker(false)}>
                <TouchableOpacity
                  style={expertStyles.pickerOverlay}
                  activeOpacity={1}
                  onPress={() => setShowModelPicker(false)}
                >
                  <View style={[expertStyles.pickerBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[expertStyles.pickerTitle, { color: colors.foreground }]}>选择模型</Text>
                    <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                      {availableModels.map(m => {
                        const isSelected = m.id === expert.selectedModelId;
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[expertStyles.pickerItem, { borderBottomColor: colors.border, backgroundColor: isSelected ? "#6C63FF10" : "transparent" }]}
                            onPress={() => {
                              onChange({ ...expert, selectedModelId: m.id });
                              setShowModelPicker(false);
                            }}
                            activeOpacity={0.8}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[expertStyles.pickerItemName, { color: isSelected ? "#6C63FF" : colors.foreground }]}>{m.name}</Text>
                              <Text style={[expertStyles.pickerItemSub, { color: colors.muted }]}>
                                {m.provider ? `${m.provider} · ` : ""}{m.modelName}
                              </Text>
                            </View>
                            {isSelected && <Text style={{ color: "#6C63FF", fontSize: 16 }}>✓</Text>}
                            {m.isDefault === 1 && !isSelected && (
                              <View style={[expertStyles.defaultTag, { backgroundColor: "#6C63FF15" }]}>
                                <Text style={{ color: "#6C63FF", fontSize: 10, fontWeight: "600" }}>默认</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </TouchableOpacity>
              </Modal>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const expertStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1.5, marginBottom: 8, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  headerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  indexBadge: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  indexText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  expertName: { fontSize: 14, fontWeight: "600", marginBottom: 3 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  capBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  capText: { fontSize: 10, fontWeight: "600" },
  provBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  provText: { fontSize: 10, fontWeight: "600" },
  deleteBtn: { padding: 4 },
  body: { borderTopWidth: 1, padding: 12, gap: 8 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  input: { borderRadius: 8, borderWidth: 1, padding: 10, fontSize: 13 },
  capGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  capPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  capPillText: { fontSize: 11 },
  provRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  provPill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  provPillText: { fontSize: 12 },
  // 模型选择器
  noModelBox: { borderRadius: 8, borderWidth: 1, padding: 10 },
  noModelText: { fontSize: 12, lineHeight: 18 },
  modelSelector: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1.5, padding: 10, gap: 8 },
  modelSelectorName: { fontSize: 13, fontWeight: "600" },
  modelSelectorSub: { fontSize: 11, marginTop: 2 },
  modelSelectorPlaceholder: { flex: 1, fontSize: 13 },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  pickerBox: { width: "100%", maxWidth: 400, borderRadius: 16, borderWidth: 1, padding: 16 },
  pickerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  pickerItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5, gap: 8 },
  pickerItemName: { fontSize: 14, fontWeight: "600" },
  pickerItemSub: { fontSize: 12, marginTop: 2 },
  defaultTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
});

// ── 访客震撼演示面板 ────────────────────────────────────────────────────────────

const DEMO_EXPERTS = [
  { id: "e1", name: "宏观经济分析师", color: "#6C63FF" },
  { id: "e2", name: "行业竞争情报官", color: "#0EA5E9" },
  { id: "e3", name: "技术路线评估师", color: "#F59E0B" },
  { id: "e4", name: "风险合规顾问", color: "#EF4444" },
  { id: "e5", name: "财务模型建模师", color: "#22C55E" },
  { id: "e6", name: "用户体验设计师", color: "#EC4899" },
  { id: "e7", name: "法律合规分析师", color: "#8B5CF6" },
  { id: "e8", name: "全球市场策略师", color: "#14B8A6" },
];

function GuestHeroBanner({ onRegister }: { onRegister: () => void }) {
  const colors = useColors();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(p => p + 1), 900);
    return () => clearInterval(t);
  }, []);

  // 模拟动态进度：每个专家按内部节奏循环展示 idle/running/done
  const getExpertStatus = (idx: number) => {
    const phase = (tick + idx * 2) % 9;
    if (phase < 3) return "idle";
    if (phase < 7) return "running";
    return "done";
  };

  return (
    <View style={[heroBannerStyles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* 标题区 */}
      <View style={heroBannerStyles.header}>
        <View style={heroBannerStyles.titleRow}>
          <Text style={[heroBannerStyles.title, { color: colors.foreground }]}>
            多角色 AI 协同分析
          </Text>
          <View style={[heroBannerStyles.badge, { backgroundColor: "#6C63FF20", borderColor: "#6C63FF40" }]}>
            <Text style={{ color: "#6C63FF", fontSize: 10, fontWeight: "700" }}>LIVE DEMO</Text>
          </View>
        </View>
        <Text style={[heroBannerStyles.subtitle, { color: colors.muted }]}>
          指挥官分解任务 → 8 位执行专家并行分析 → 汇总者整合报告
        </Text>
      </View>

      {/* 工作流演示面板 */}
      <View style={heroBannerStyles.flowRow}>
        {/* 指挥官 */}
        <View style={[heroBannerStyles.commanderBox, { backgroundColor: "#6C63FF15", borderColor: "#6C63FF40" }]}>
          <Text style={{ color: "#6C63FF", fontSize: 11, fontWeight: "700" }}>指挥官</Text>
          <View style={[heroBannerStyles.statusDot, { backgroundColor: "#6C63FF" }]} />
          <Text style={{ color: "#6C63FF", fontSize: 9 }}>分解任务中...</Text>
        </View>
        <Text style={[heroBannerStyles.arrow, { color: colors.muted }]}>→</Text>

        {/* 8 位执行专家 */}
        <View style={heroBannerStyles.expertsGrid}>
          {DEMO_EXPERTS.map((e, idx) => {
            const status = getExpertStatus(idx);
            return (
              <View
                key={e.id}
                style={[
                  heroBannerStyles.expertChip,
                  {
                    backgroundColor: status === "done" ? e.color + "20" : status === "running" ? e.color + "15" : colors.background,
                    borderColor: status === "idle" ? colors.border : e.color + "60",
                    opacity: status === "idle" ? 0.5 : 1,
                  }
                ]}
              >
                <View style={[heroBannerStyles.expertDot, { backgroundColor: status === "idle" ? colors.border : e.color }]} />
                <Text style={{ color: status === "idle" ? colors.muted : e.color, fontSize: 9, fontWeight: status === "running" ? "700" : "400" }} numberOfLines={1}>
                  {e.name}
                </Text>
                {status === "done" && <Text style={{ color: e.color, fontSize: 9 }}>✓</Text>}
                {status === "running" && <ActivityIndicator size="small" color={e.color} style={{ transform: [{ scale: 0.5 }] }} />}
              </View>
            );
          })}
        </View>

        <Text style={[heroBannerStyles.arrow, { color: colors.muted }]}>→</Text>
        {/* 汇总者 */}
        <View style={[heroBannerStyles.commanderBox, { backgroundColor: "#22C55E15", borderColor: "#22C55E40" }]}>
          <Text style={{ color: "#22C55E", fontSize: 11, fontWeight: "700" }}>汇总者</Text>
          <View style={[heroBannerStyles.statusDot, { backgroundColor: "#22C55E" }]} />
          <Text style={{ color: "#22C55E", fontSize: 9 }}>整合报告</Text>
        </View>
      </View>

      {/* 访客限制警示 + 注册引导 */}
      <View style={[heroBannerStyles.guestWarning, { backgroundColor: "#F59E0B10", borderColor: "#F59E0B30" }]}>
        <View style={heroBannerStyles.warningLeft}>
          <Text style={{ fontSize: 14 }}>⚠️</Text>
          <View>
            <Text style={{ color: "#F59E0B", fontSize: 12, fontWeight: "700" }}>访客模式限制</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>仅 2 位执行专家 · Flash 模型 · 每日 5 次</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[heroBannerStyles.registerBtn, { backgroundColor: "#6C63FF" }]}
          onPress={onRegister}
          activeOpacity={0.85}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>注册解锁</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const heroBannerStyles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  header: { marginBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: "700" },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  subtitle: { fontSize: 12 },
  flowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  commanderBox: { borderRadius: 10, borderWidth: 1, padding: 8, alignItems: "center", gap: 4, minWidth: 64 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  arrow: { fontSize: 16, fontWeight: "300" },
  expertsGrid: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  expertChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 4, minWidth: 80 },
  expertDot: { width: 5, height: 5, borderRadius: 2.5 },
  guestWarning: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 10, borderWidth: 1, padding: 10 },
  warningLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  registerBtn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
});

const apiBannerStyles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, marginLeft: 8 },
});

// ── 主页面 ────────────────────────────────────────────────────────────────────

function makeDraft(overrides?: Partial<ExpertDraft>): ExpertDraft {
  return {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    description: "",
    systemPrompt: "",
    capabilityType: "general",
    selectedModelId: "",
    expanded: true,
    ...overrides,
  };
}

export default function WebHomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const [activeTab, setActiveTab] = useState<'workflow' | 'roles'>('workflow');
  const { user } = useAuth();
  const [userProfile, setUserProfile] = useState<{ trialRunsLeft: number; tier: string; role: string } | null>(null);
  const { state, loadData, addTemplate, deleteTemplate, selectTemplate } = useWorkflow();

  const [taskInput, setTaskInput] = useState("");
  const [showNewWorkflow, setShowNewWorkflow] = useState(false);
  const [systemWorkflows, setSystemWorkflows] = useState<SystemWorkflow[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [useSystemWorkflow, setUseSystemWorkflow] = useState(false);

  // 新建工作流表单
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  // 专家草稿列表（内嵌配置）
  const [expertDrafts, setExpertDrafts] = useState<ExpertDraft[]>([]);
  const [availableModels, setAvailableModels] = useState<AiModelConfig[]>([]);
  // 固定角色模型配置
  const [initiatorModelId, setInitiatorModelId] = useState("");
  const [summarizerModelId, setSummarizerModelId] = useState("");
  const [roleModelPickerTarget, setRoleModelPickerTarget] = useState<"initiator" | "summarizer" | null>(null);

  useEffect(() => {
    if (!state.isLoaded) loadData();
    // 加载用户模型列表
    fetchUserModels().then(setAvailableModels);
    // 加载系统工作流列表
    fetchSystemWorkflows().then(list => {
      setSystemWorkflows(list);
      if (list.length > 0) {
        setSelectedSystemId(list[0].id);
        setUseSystemWorkflow(true);
      }
    });
  }, []);

  // 登录用户加载 Profile（trialRunsLeft、tier）
  useEffect(() => {
    if (user) {
      fetchUserProfile().then(setUserProfile);
    } else {
      setUserProfile(null);
    }
  }, [user]);

  // 打开弹窗时，用当前选中工作流的专家初始化草稿
  const openNewWorkflow = () => {
    const currentTpl = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
    const existingExperts = currentTpl?.experts ?? [];
    setExpertDrafts(
      existingExperts.length > 0
        ? existingExperts.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            systemPrompt: r.systemPrompt,
            capabilityType: r.apiConfig?.capabilityType ?? "general",
            selectedModelId: r.apiConfig?.selectedModelId ?? "",
            expanded: false,
          }))
        : [makeDraft({ expanded: true })]
    );
    setNewName("");
    setNewDesc("");
    setInitiatorModelId(defaultTpl?.initiator?.apiConfig?.selectedModelId ?? "");
    setSummarizerModelId(defaultTpl?.summarizer?.apiConfig?.selectedModelId ?? "");
    setRoleModelPickerTarget(null);
    setShowNewWorkflow(true);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const getStatusInfo = (run: WorkflowRun) => {
    if (run.status === "completed") return { label: "已完成", color: colors.success };
    if (run.status === "error") return { label: "失败", color: colors.error };
    return { label: "进行中", color: colors.warning };
  };

  const selectedTemplate = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
  const recentHistory = state.history.slice(0, 5);

  const handleStartRun = () => {
    if (!taskInput.trim()) return;
    if (useSystemWorkflow && selectedSystemId) {
      // 使用系统工作流：传递 systemWorkflowId，Prompt 在后端读取
      router.push({ pathname: "/web/run" as any, params: { prefill: taskInput.trim(), autoStart: "1", systemWorkflowId: selectedSystemId } });
    } else {
      // 使用用户自定义工作流
      router.push({ pathname: "/web/run" as any, params: { prefill: taskInput.trim(), autoStart: "1" } });
    }
  };

  const handleCreateWorkflow = async () => {
    if (!newName.trim() || expertDrafts.length === 0) return;

    // 从默认工作流获取引导者和汇总者模板
    const defaultTpl = state.templates.find(t => t.isDefault) ?? state.templates[0];
    const expertIdSeed = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fallbackInitiator: Role = {
      id: `role_initiator_${Date.now()}`,
      name: "指挥官",
      description: "分析任务",
      type: "initiator",
      systemPrompt: "你是一个任务分析师，请分析用户任务并输出结构化报告。",
      apiConfig: { provider: "builtin", capabilityType: "general" },
    };
    const fallbackSummarizer: Role = {
      id: `role_summarizer_${Date.now()}`,
      name: "汇总者",
      description: "整合专家输出",
      type: "summarizer",
      systemPrompt: "你是一个文档整合专家，请整合所有专家的输出并生成综合报告。",
      apiConfig: { provider: "builtin", capabilityType: "general" },
    };
    const baseInitiator = defaultTpl?.initiator ?? fallbackInitiator;
    const baseSummarizer = defaultTpl?.summarizer ?? fallbackSummarizer;

    const initiatorModel = availableModels.find(m => m.id === initiatorModelId);
    const summarizerModel = availableModels.find(m => m.id === summarizerModelId);
    const initiatorApiConfig: RoleApiConfig = {
      provider: initiatorModel ? "custom" : "builtin",
      capabilityType: baseInitiator.apiConfig?.capabilityType ?? "general",
      selectedModelId: initiatorModelId || undefined,
      ...(initiatorModel ? { apiKey: initiatorModel.apiKey, model: initiatorModel.modelName, baseUrl: initiatorModel.apiUrl } : {}),
    };
    const summarizerApiConfig: RoleApiConfig = {
      provider: summarizerModel ? "custom" : "builtin",
      capabilityType: baseSummarizer.apiConfig?.capabilityType ?? "general",
      selectedModelId: summarizerModelId || undefined,
      ...(summarizerModel ? { apiKey: summarizerModel.apiKey, model: summarizerModel.modelName, baseUrl: summarizerModel.apiUrl } : {}),
    };

    // 将草稿转换为 Role 对象（内嵌到模板中）
    const experts: Role[] = expertDrafts.map((draft, idx) => {
      const model = availableModels.find(m => m.id === draft.selectedModelId);
      const apiConfig: RoleApiConfig = {
        provider: model ? "custom" : "builtin",
        capabilityType: draft.capabilityType,
        selectedModelId: draft.selectedModelId || undefined,
        ...(model ? { apiKey: model.apiKey, model: model.modelName, baseUrl: model.apiUrl } : {}),
      };
      return {
        // 新建模板时总是重建专家 ID，避免历史模板里潜在重复 ID 导致并行结果被覆盖
        id: `role_expert_${expertIdSeed}_${idx}`,
        name: draft.name || `专家 ${idx + 1}`,
        description: draft.description || `${draft.name || "专家"}的专项分析`,
        type: "expert" as const,
        apiConfig,
        systemPrompt: draft.systemPrompt ||
          `你是一个专业的${draft.name || "专家"}。基于任务分析报告，请从你的专业角度深入分析，提供专业见解和具体建议，输出详细的分析报告。`,
      };
    });

    const tpl: WorkflowTemplate = {
      id: `tpl_${Date.now()}`,
      name: newName.trim(),
      description: newDesc.trim() || `指挥官分析 → ${experts.length} 位执行专家并行 → 汇总者整合`,
      initiator: { ...baseInitiator, apiConfig: initiatorApiConfig },
      experts,
      summarizer: { ...baseSummarizer, apiConfig: summarizerApiConfig },
      createdAt: Date.now(),
    };
    await addTemplate(tpl);
    selectTemplate(tpl.id);
    setRoleModelPickerTarget(null);
    setShowNewWorkflow(false);
  };

  const updateDraft = (id: string, updated: ExpertDraft) => {
    setExpertDrafts(prev => prev.map(d => d.id === id ? updated : d));
  };

  const deleteDraft = (id: string) => {
    setExpertDrafts(prev => prev.filter(d => d.id !== id));
  };

  const addDraft = () => {
    setExpertDrafts(prev => [...prev, makeDraft()]);
  };

  const { width } = useWindowDimensions();

  const defaultTpl = state.templates.find(t => t.isDefault) ?? state.templates[0];
  const initiator = defaultTpl?.initiator;
  const summarizer = defaultTpl?.summarizer;
  const initiatorSelectedModel = availableModels.find(m => m.id === initiatorModelId);
  const summarizerSelectedModel = availableModels.find(m => m.id === summarizerModelId);

  return (
    <WebLayout title="工作流">
      {/* ── Tab 切换栏 ── */}
      <View style={tabStyles.tabBar}>
        <TouchableOpacity
          style={[tabStyles.tabBtn, activeTab === 'workflow' && tabStyles.tabBtnActive]}
          onPress={() => setActiveTab('workflow')}
          activeOpacity={0.8}
        >
          <Text style={[tabStyles.tabBtnText, { color: activeTab === 'workflow' ? '#6C63FF' : colors.muted }]}>⚡ 工作流</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[tabStyles.tabBtn, activeTab === 'roles' && tabStyles.tabBtnActive]}
          onPress={() => setActiveTab('roles')}
          activeOpacity={0.8}
        >
          <Text style={[tabStyles.tabBtnText, { color: activeTab === 'roles' ? '#6C63FF' : colors.muted }]}>⚙️ 流程配置</Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'roles' ? (
        <RolesTab />
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 访客震撼演示面板（未登录时显示） ── */}
        {!user && (
          <GuestHeroBanner onRegister={() => router.push("/web/login" as any)} />
        )}

        {/* ── 注册用户无 API Key 引导 Banner ── */}
        {user && userProfile && userProfile.trialRunsLeft <= 1 && userProfile.tier !== "pro" && (
          <View style={[apiBannerStyles.container, { backgroundColor: "#6C63FF10", borderColor: "#6C63FF30" }]}>
            <View style={apiBannerStyles.left}>
              <Text style={{ fontSize: 16 }}>⚡</Text>
              <View>
                <Text style={{ color: "#6C63FF", fontSize: 13, fontWeight: "700" }}>
                  {userProfile.trialRunsLeft <= 0 ? "免费试用已用完" : `还剩 ${userProfile.trialRunsLeft} 次免费试用`}
                </Text>
                <Text style={{ color: "#6C63FF99", fontSize: 11, marginTop: 2 }}>绑定 API Key 解锁无限次数 · 支持 OpenAI / 自定义模型</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[apiBannerStyles.btn, { backgroundColor: "#6C63FF" }]}
              onPress={() => router.push("/web/me" as any)}
              activeOpacity={0.85}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>立即绑定</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 任务输入区 ── */}
        <View style={[styles.inputSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.inputTitle, { color: colors.foreground }]}>描述你的任务</Text>
              <Text style={[styles.inputSub, { color: colors.muted }]}>Orchestra 将指挥官、执行专家、汇总者协同工作，自动分析并产出综合报告</Text>
          <TextInput
            style={[styles.taskInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={taskInput}
            onChangeText={setTaskInput}
            placeholder="例如：为一款新的健康饮料制定完整的市场推广方案，包括目标用户分析、竞品研究、营销策略、风险评估..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: taskInput.trim() ? "#6C63FF" : colors.border }]}
            onPress={handleStartRun}
            disabled={!taskInput.trim()}
            activeOpacity={0.85}
          >
            <IconSymbol name="play.fill" size={18} color="#FFFFFF" />
            <Text style={styles.startBtnText}>开始执行</Text>
          </TouchableOpacity>
        </View>

        {/* ── 工作流选择区 ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>选择工作流</Text>
          </View>

          {/* 系统工作流（管理员预置） */}
          {systemWorkflows.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <View style={{ backgroundColor: "#6C63FF", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>官方场景</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Orchestra 官方预置，组织方：Mafdet.AI</Text>
              </View>
              <View style={styles.templateGrid}>
                {systemWorkflows.map(sw => {
                  const isSelected = useSystemWorkflow && selectedSystemId === sw.id;
                  return (
                    <TouchableOpacity
                      key={sw.id}
                      style={[
                        styles.templateCard,
                        { backgroundColor: isSelected ? "#6C63FF12" : colors.surface, borderColor: isSelected ? "#6C63FF" : colors.border }
                      ]}
                      onPress={() => { setSelectedSystemId(sw.id); setUseSystemWorkflow(true); }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.templateCardHeader}>
                        <View style={[styles.templateRadio, { borderColor: isSelected ? "#6C63FF" : colors.border }]}>
                          {isSelected && <View style={styles.templateRadioDot} />}
                        </View>
                        <Text style={[styles.templateCardName, { color: isSelected ? "#6C63FF" : colors.foreground }]}>{sw.name}</Text>
                        {sw.scenarioTag && (
                          <View style={{ backgroundColor: "#6C63FF15", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: "#6C63FF", fontSize: 10 }}>{sw.scenarioTag}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.templateCardDesc, { color: colors.muted }]}>{sw.description}</Text>
                      <View style={styles.templateCardFlow}>
                        <View style={[styles.flowPill, { backgroundColor: "#6C63FF20" }]}>
                          <Text style={[styles.flowPillText, { color: "#6C63FF" }]}>指挥官</Text>
                        </View>
                        <Text style={[styles.flowArrow, { color: colors.muted }]}>→</Text>
                        <View style={[styles.flowPill, { backgroundColor: "#0EA5E920" }]}>
                          <Text style={[styles.flowPillText, { color: "#0EA5E9" }]}>{sw.expertCount} 位执行专家</Text>
                        </View>
                        <Text style={[styles.flowArrow, { color: colors.muted }]}>→</Text>
                        <View style={[styles.flowPill, { backgroundColor: "#22C55E20" }]}>
                          <Text style={[styles.flowPillText, { color: "#22C55E" }]}>汇总者</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 用户自定义工作流 */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ backgroundColor: colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>DIY 工作流</Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>自定义配置专家和流程</Text>
            </View>
            <TouchableOpacity
              style={[styles.addBtn, { borderColor: "#6C63FF", backgroundColor: "#6C63FF15" }]}
              onPress={openNewWorkflow}
              activeOpacity={0.8}
            >
              <Text style={[styles.addBtnText, { color: "#6C63FF" }]}>+ 新建</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.templateGrid}>
            {state.templates.map(tpl => {
              const isSelected = !useSystemWorkflow && tpl.id === state.selectedTemplateId;
              const experts = tpl.experts;
              return (
                <TouchableOpacity
                  key={tpl.id}
                  style={[
                    styles.templateCard,
                    { backgroundColor: isSelected ? "#6C63FF12" : colors.surface, borderColor: isSelected ? "#6C63FF" : colors.border }
                  ]}
                  onPress={() => { selectTemplate(tpl.id); setUseSystemWorkflow(false); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.templateCardHeader}>
                    <View style={[styles.templateRadio, { borderColor: isSelected ? "#6C63FF" : colors.border }]}>
                      {isSelected && <View style={styles.templateRadioDot} />}
                    </View>
                    <Text style={[styles.templateCardName, { color: isSelected ? "#6C63FF" : colors.foreground }]}>{tpl.name}</Text>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: "/web/square" as any, params: { publishTemplateId: tpl.id, publishTemplateName: tpl.name } })}
                        activeOpacity={0.7}
                        style={{ borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: "#6C63FF15", borderWidth: 1, borderColor: "#6C63FF40" }}
                      >
                        <Text style={{ color: "#6C63FF", fontSize: 11, fontWeight: "600" }}>发布</Text>
                      </TouchableOpacity>
                      {!tpl.isDefault && (
                        <TouchableOpacity onPress={() => deleteTemplate(tpl.id)} activeOpacity={0.7} style={styles.deleteBtn}>
                          <Text style={{ color: colors.error, fontSize: 12 }}>删除</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.templateCardDesc, { color: colors.muted }]}>{tpl.description}</Text>
                  <View style={styles.templateCardFlow}>
                    <View style={[styles.flowPill, { backgroundColor: "#6C63FF20" }]}>
                      <Text style={[styles.flowPillText, { color: "#6C63FF" }]}>{tpl.initiator.name}</Text>
                    </View>
                    <Text style={[styles.flowArrow, { color: colors.muted }]}>→</Text>
                    <View style={[styles.flowPill, { backgroundColor: "#0EA5E920" }]}>
                      <Text style={[styles.flowPillText, { color: "#0EA5E9" }]}>{experts.length} 位执行专家</Text>
                    </View>
                    <Text style={[styles.flowArrow, { color: colors.muted }]}>→</Text>
                    <View style={[styles.flowPill, { backgroundColor: "#22C55E20" }]}>
                      <Text style={[styles.flowPillText, { color: "#22C55E" }]}>{tpl.summarizer.name}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 最近历史 ── */}
        {recentHistory.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>最近执行</Text>
              <TouchableOpacity onPress={() => router.push("/web/history" as any)} activeOpacity={0.7}>
                <Text style={[styles.viewAll, { color: "#6C63FF" }]}>查看全部 →</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.historyTable, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {recentHistory.map((run, idx) => {
                const si = getStatusInfo(run);
                const duration = run.completedAt ? Math.round((run.completedAt - run.startedAt) / 1000) : null;
                return (
                  <TouchableOpacity
                    key={run.id}
                    style={[styles.historyRow, idx < recentHistory.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                    onPress={() => router.push({ pathname: "/web/result" as any, params: { runId: run.id } })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.historyLeft}>
                      <Text style={[styles.historyInput, { color: colors.foreground }]} numberOfLines={1}>{run.input}</Text>
                      <Text style={[styles.historyMeta, { color: colors.muted }]}>
                        {formatTime(run.startedAt)}{run.templateName ? ` · ${run.templateName}` : ""}{duration != null ? ` · ${duration}s` : ""}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: si.color + "20" }]}>
                      <Text style={[styles.statusText, { color: si.color }]}>{si.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
      )}
      {/* ── 新建工作流弹窗（始终挂载） ── */}
      <Modal
        visible={showNewWorkflow}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRoleModelPickerTarget(null);
          setShowNewWorkflow(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {/* 弹窗头部 */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>新建工作流</Text>
              <TouchableOpacity
                onPress={() => {
                  setRoleModelPickerTarget(null);
                  setShowNewWorkflow(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalClose, { color: colors.muted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* 工作流名称 */}
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>工作流名称 *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={newName}
                onChangeText={setNewName}
                placeholder="例如：产品竞品分析、市场调研..."
                placeholderTextColor={colors.muted}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>描述（可选）</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="简述工作流用途"
                placeholderTextColor={colors.muted}
              />

              {/* 指挥官（固定，不可更改数量） */}
              <View style={[styles.fixedRoleRow, { backgroundColor: "#6C63FF10", borderColor: "#6C63FF30" }]}>
                <View style={[styles.fixedRoleBadge, { backgroundColor: "#6C63FF" }]}>
                  <Text style={styles.fixedRoleBadgeText}>第 1 步</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fixedRoleLabel, { color: colors.muted }]}>指挥官（固定 1 个）</Text>
                  <Text style={[styles.fixedRoleName, { color: "#6C63FF" }]}>{initiator?.name ?? "指挥官"}</Text>
                  <TouchableOpacity
                    style={[styles.fixedRoleModelPicker, { backgroundColor: colors.background, borderColor: initiatorModelId ? "#6C63FF" : colors.border }]}
                    onPress={() => setRoleModelPickerTarget("initiator")}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fixedRoleModelName, { color: colors.foreground }]}>
                        {initiatorSelectedModel?.name ?? "内置 LLM（默认）"}
                      </Text>
                      <Text style={[styles.fixedRoleModelSub, { color: colors.muted }]}>
                        {initiatorSelectedModel
                          ? `${initiatorSelectedModel.provider ? `${initiatorSelectedModel.provider} · ` : ""}${initiatorSelectedModel.modelName}`
                          : "点击可选择“我的AI模型”"}
                      </Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>串行执行</Text>
              </View>

              {/* 并行专家区 */}
              <View style={styles.expertsHeader}>
                <View>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 0 }]}>
                    并行执行专家（{expertDrafts.length} 位）*
                  </Text>
                  <Text style={[styles.fieldHint, { color: colors.muted }]}>所有执行专家同时并行执行，可自由增删配置</Text>
                </View>
                <TouchableOpacity
                  style={[styles.addExpertBtn, { backgroundColor: "#0EA5E915", borderColor: "#0EA5E940" }]}
                  onPress={addDraft}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: "#0EA5E9", fontSize: 13, fontWeight: "600" }}>+ 添加执行专家</Text>
                </TouchableOpacity>
              </View>

              {expertDrafts.length === 0 && (
                <View style={[styles.emptyExperts, { borderColor: colors.border }]}>
                  <Text style={[styles.emptyExpertsText, { color: colors.muted }]}>点击“添加执行专家”创建并行执行专家角色</Text>
                </View>
              )}

              {expertDrafts.map((draft, idx) => (
                <ExpertCard
                  key={draft.id}
                  expert={draft}
                  index={idx}
                  colors={colors}
                  onChange={updated => updateDraft(draft.id, updated)}
                  onDelete={() => deleteDraft(draft.id)}
                  availableModels={availableModels}
                />
              ))}

              {/* 汇总者（固定，不可更改数量） */}
              <View style={[styles.fixedRoleRow, { backgroundColor: "#22C55E10", borderColor: "#22C55E30", marginTop: 8 }]}>
                <View style={[styles.fixedRoleBadge, { backgroundColor: "#22C55E" }]}>
                  <Text style={styles.fixedRoleBadgeText}>汇总</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fixedRoleLabel, { color: colors.muted }]}>汇总者（固定 1 个）</Text>
                  <Text style={[styles.fixedRoleName, { color: "#22C55E" }]}>{summarizer?.name ?? "汇总者"}</Text>
                  <TouchableOpacity
                    style={[styles.fixedRoleModelPicker, { backgroundColor: colors.background, borderColor: summarizerModelId ? "#22C55E" : colors.border }]}
                    onPress={() => setRoleModelPickerTarget("summarizer")}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fixedRoleModelName, { color: colors.foreground }]}>
                        {summarizerSelectedModel?.name ?? "内置 LLM（默认）"}
                      </Text>
                      <Text style={[styles.fixedRoleModelSub, { color: colors.muted }]}>
                        {summarizerSelectedModel
                          ? `${summarizerSelectedModel.provider ? `${summarizerSelectedModel.provider} · ` : ""}${summarizerSelectedModel.modelName}`
                          : "点击可选择“我的AI模型”"}
                      </Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>▼</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>产出文档</Text>
              </View>

              {/* 工作流预览 */}
              {newName.trim() && expertDrafts.length > 0 && (
                <View style={[styles.previewBox, { backgroundColor: "#6C63FF10", borderColor: "#6C63FF30" }]}>
                  <Text style={[styles.previewLabel, { color: "#6C63FF" }]}>工作流预览</Text>
                  <View style={styles.previewFlow}>
                    <View style={[styles.previewPill, { backgroundColor: "#6C63FF20" }]}>
                      <Text style={[styles.previewPillText, { color: "#6C63FF" }]}>{initiator?.name ?? "指挥官"}</Text>
                    </View>
                    <Text style={[styles.previewArrow, { color: colors.muted }]}>→</Text>
                    <View style={[styles.previewPill, { backgroundColor: "#0EA5E920" }]}>
                      <Text style={[styles.previewPillText, { color: "#0EA5E9" }]}>{expertDrafts.length} 位执行专家并行</Text>
                    </View>
                    <Text style={[styles.previewArrow, { color: colors.muted }]}>→</Text>
                    <View style={[styles.previewPill, { backgroundColor: "#22C55E20" }]}>
                      <Text style={[styles.previewPillText, { color: "#22C55E" }]}>{summarizer?.name ?? "汇总者"}</Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setRoleModelPickerTarget(null);
                  setShowNewWorkflow(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: newName.trim() && expertDrafts.length > 0 ? "#6C63FF" : colors.border }]}
                onPress={handleCreateWorkflow}
                disabled={!newName.trim() || expertDrafts.length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmBtnText}>创建工作流</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={showNewWorkflow && roleModelPickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModelPickerTarget(null)}
      >
        <TouchableOpacity
          style={expertStyles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setRoleModelPickerTarget(null)}
        >
          <View style={[expertStyles.pickerBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[expertStyles.pickerTitle, { color: colors.foreground }]}>
              {roleModelPickerTarget === "initiator" ? "选择指挥官模型" : "选择汇总者模型"}
            </Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  expertStyles.pickerItem,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor:
                      ((roleModelPickerTarget === "initiator" ? initiatorModelId : summarizerModelId) || "") === ""
                        ? "#6C63FF10"
                        : "transparent",
                  },
                ]}
                onPress={() => {
                  if (roleModelPickerTarget === "initiator") setInitiatorModelId("");
                  if (roleModelPickerTarget === "summarizer") setSummarizerModelId("");
                  setRoleModelPickerTarget(null);
                }}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      expertStyles.pickerItemName,
                      {
                        color:
                          ((roleModelPickerTarget === "initiator" ? initiatorModelId : summarizerModelId) || "") === ""
                            ? "#6C63FF"
                            : colors.foreground,
                      },
                    ]}
                  >
                    内置 LLM（默认）
                  </Text>
                  <Text style={[expertStyles.pickerItemSub, { color: colors.muted }]}>使用系统内置模型</Text>
                </View>
                {((roleModelPickerTarget === "initiator" ? initiatorModelId : summarizerModelId) || "") === "" && (
                  <Text style={{ color: "#6C63FF", fontSize: 16 }}>✓</Text>
                )}
              </TouchableOpacity>
              {availableModels.map(m => {
                const currentId = roleModelPickerTarget === "initiator" ? initiatorModelId : summarizerModelId;
                const isSelected = m.id === currentId;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[expertStyles.pickerItem, { borderBottomColor: colors.border, backgroundColor: isSelected ? "#6C63FF10" : "transparent" }]}
                    onPress={() => {
                      if (roleModelPickerTarget === "initiator") setInitiatorModelId(m.id);
                      if (roleModelPickerTarget === "summarizer") setSummarizerModelId(m.id);
                      setRoleModelPickerTarget(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[expertStyles.pickerItemName, { color: isSelected ? "#6C63FF" : colors.foreground }]}>{m.name}</Text>
                      <Text style={[expertStyles.pickerItemSub, { color: colors.muted }]}>
                        {m.provider ? `${m.provider} · ` : ""}{m.modelName}
                      </Text>
                    </View>
                    {isSelected && <Text style={{ color: "#6C63FF", fontSize: 16 }}>✓</Text>}
                    {m.isDefault === 1 && !isSelected && (
                      <View style={[expertStyles.defaultTag, { backgroundColor: "#6C63FF15" }]}>
                        <Text style={{ color: "#6C63FF", fontSize: 10, fontWeight: "600" }}>默认</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </WebLayout>
  );
}

const tabStyles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: '#6C63FF' },
  tabBtnText: { fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
  scrollContent: { padding: 24, paddingBottom: 60, gap: 24 },

  // 任务输入
  inputSection: { borderRadius: 20, borderWidth: 1, padding: 24 },
  inputTitle: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  inputSub: { fontSize: 14, marginBottom: 16 },
  taskInput: { borderRadius: 12, borderWidth: 1, padding: 16, fontSize: 14, minHeight: 120, marginBottom: 16 },
  startBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14 },
  startBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },

  // 区块
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  addBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontWeight: "600" },
  viewAll: { fontSize: 13 },

  // 工作流模板卡片
  templateGrid: { gap: 10 },
  templateCard: { borderRadius: 14, borderWidth: 1.5, padding: 16 },
  templateCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  templateRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  templateRadioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#6C63FF" },
  templateCardName: { flex: 1, fontSize: 15, fontWeight: "600" },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  templateCardDesc: { fontSize: 13, marginBottom: 10, marginLeft: 28 },
  templateCardFlow: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 28, flexWrap: "wrap" },
  flowPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  flowPillText: { fontSize: 12, fontWeight: "500" },
  flowArrow: { fontSize: 12 },

  // 历史记录
  historyTable: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  historyRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  historyLeft: { flex: 1 },
  historyInput: { fontSize: 14, fontWeight: "500", marginBottom: 2 },
  historyMeta: { fontSize: 12 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 12, fontWeight: "600" },

  // 弹窗
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", maxWidth: 600, borderRadius: 20, borderWidth: 1, padding: 24, maxHeight: "92%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalClose: { fontSize: 18, padding: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  fieldHint: { fontSize: 12, marginBottom: 8, marginTop: -2 },
  fieldInput: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 4 },

  // 固定角色行（引导者/汇总者）
  fixedRoleRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 14 },
  fixedRoleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  fixedRoleBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  fixedRoleLabel: { fontSize: 11, marginBottom: 2 },
  fixedRoleName: { fontSize: 15, fontWeight: "700" },
  fixedRoleModelPicker: { marginTop: 8, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  fixedRoleModelName: { fontSize: 12, fontWeight: "600" },
  fixedRoleModelSub: { fontSize: 11, marginTop: 2 },

  // 专家区
  expertsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, marginBottom: 8 },
  addExpertBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  emptyExperts: { borderRadius: 10, borderWidth: 1, borderStyle: "dashed", padding: 16, alignItems: "center", marginBottom: 8 },
  emptyExpertsText: { fontSize: 13 },

  // 预览
  previewBox: { borderRadius: 10, borderWidth: 1, padding: 14, marginTop: 14 },
  previewLabel: { fontSize: 11, fontWeight: "700", marginBottom: 8 },
  previewFlow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  previewPill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  previewPillText: { fontSize: 12, fontWeight: "600" },
  previewArrow: { fontSize: 14 },

  // 底部按钮
  modalFooter: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: "center" },
  cancelBtnText: { fontSize: 14 },
  confirmBtn: { flex: 2, borderRadius: 10, padding: 12, alignItems: "center" },
  confirmBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
