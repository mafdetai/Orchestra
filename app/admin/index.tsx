/**
 * 管理员后台 — 系统工作流管理
 *
 * 路径：/admin
 * 权限：仅 role=admin 的用户可访问
 * 功能：
 *   - 查看所有系统工作流（含完整 Prompt）
 *   - 新增 / 编辑 / 删除系统工作流
 *   - 预置场景快速创建
 */
import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert, ActivityIndicator,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";
import {
  WorkflowTemplate, Role,
  CapabilityType, CAPABILITY_CONFIG,
  makeDefaultInitiator, makeDefaultSummarizer,
} from "@/shared/workflow-types";

// ── tRPC 工具 ─────────────────────────────────────────────────────────────────

// tRPC + superjson 返回结构为 result.data.json，需要解包
function extractTrpcData(json: { result?: { data?: unknown }; error?: { message?: string } }): unknown {
  if (json.error) throw new Error(json.error.message ?? "请求失败");
  const dataObj = json.result?.data;
  if (dataObj && typeof dataObj === 'object' && 'json' in (dataObj as object)) {
    return (dataObj as { json: unknown }).json;
  }
  return dataObj ?? null;
}

function extractTrpcErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, any>;
  return (
    obj?.error?.message ??
    obj?.error?.json?.message ??
    obj?.error?.data?.message ??
    null
  );
}

async function trpcQuery(procedure: string) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/trpc/${procedure}`, { credentials: "include" });
  const json = await res.json() as { result?: { data?: unknown }; error?: { message?: string } };
  if (!res.ok) {
    const message = extractTrpcErrorMessage(json);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return extractTrpcData(json);
}

async function trpcMutation(procedure: string, input: unknown) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/trpc/${procedure}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  const json = await res.json() as { result?: { data?: unknown }; error?: { message?: string } };
  if (!res.ok) {
    const message = extractTrpcErrorMessage(json);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return extractTrpcData(json);
}

function encodeTrpcInput(input: unknown) {
  return encodeURIComponent(JSON.stringify({ json: input }));
}

// ── 预置场景模板 ──────────────────────────────────────────────────────────────

const PRESET_SCENARIOS: Array<{
  label: string;
  icon: string;
  description: string;
  color: string;
  buildTemplate: () => Omit<WorkflowTemplate, "id" | "createdAt">;
}> = [];

// ── 工作流编辑器（简化版，管理员用） ─────────────────────────────────────────

interface WorkflowEditorProps {
  workflow: Partial<WorkflowTemplate> | null;
  onSave: (data: { id: string; name: string; description: string; config: string }) => Promise<void>;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function WorkflowEditor({ workflow, onSave, onClose, colors }: WorkflowEditorProps) {
  const isEdit = !!workflow?.id;
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [configJson, setConfigJson] = useState(() => {
    if (workflow && workflow.initiator) {
      const { id: _id, createdAt: _c, ...rest } = workflow as WorkflowTemplate;
      return JSON.stringify(rest, null, 2);
    }
    return "";
  });
  const [jsonError, setJsonError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "json">("basic");

  // 同步 name/description 到 configJson
  const syncBasicToJson = () => {
    try {
      const parsed = JSON.parse(configJson || "{}") as Record<string, unknown>;
      parsed.name = name;
      parsed.description = description;
      setConfigJson(JSON.stringify(parsed, null, 2));
      setJsonError("");
    } catch {
      // ignore
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setJsonError("请填写工作流名称"); return; }
    let finalConfig = configJson;
    try {
      const parsed = JSON.parse(configJson || "{}") as Record<string, unknown>;
      parsed.name = name;
      parsed.description = description;
      // 验证必要字段
      if (!parsed.initiator) throw new Error("缺少 initiator 字段");
      if (!Array.isArray(parsed.experts) || parsed.experts.length === 0) throw new Error("experts 不能为空");
      if (!parsed.summarizer) throw new Error("缺少 summarizer 字段");
      finalConfig = JSON.stringify(parsed);
      setJsonError("");
    } catch (e) {
      setJsonError(`JSON 格式错误：${String(e)}`);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: (workflow as WorkflowTemplate)?.id ?? `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        description: description.trim(),
        config: finalConfig,
      });
      onClose();
    } catch (e) {
      setJsonError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={editorStyles.overlay}>
        <View style={[editorStyles.box, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {/* 头部 */}
          <View style={editorStyles.header}>
            <Text style={[editorStyles.title, { color: colors.foreground }]}>
              {isEdit ? "编辑系统工作流" : "新建系统工作流"}
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[editorStyles.closeBtn, { color: colors.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab 切换 */}
          <View style={[editorStyles.tabBar, { borderBottomColor: colors.border }]}>
            {(["basic", "json"] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[editorStyles.tab, activeTab === tab && { borderBottomColor: "#6C63FF", borderBottomWidth: 2 }]}
                onPress={() => { if (tab === "json") syncBasicToJson(); setActiveTab(tab); }}
                activeOpacity={0.8}
              >
                <Text style={[editorStyles.tabText, { color: activeTab === tab ? "#6C63FF" : colors.muted }]}>
                  {tab === "basic" ? "基本信息" : "JSON 配置"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {activeTab === "basic" ? (
              <View style={editorStyles.formBody}>
                <Text style={[editorStyles.label, { color: colors.foreground }]}>工作流名称 *</Text>
                <TextInput
                  style={[editorStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="例如：商业计划书分析"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[editorStyles.label, { color: colors.foreground }]}>描述</Text>
                <TextInput
                  style={[editorStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, height: 80, textAlignVertical: "top" }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="简要描述此工作流的用途和特点"
                  placeholderTextColor={colors.muted}
                  multiline
                />
                <View style={[editorStyles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[editorStyles.infoText, { color: colors.muted }]}>
                    💡 切换到「JSON 配置」标签可编辑完整的角色配置，包括引导者、专家和汇总者的系统提示词（Prompt）。
                  </Text>
                </View>
              </View>
            ) : (
              <View style={editorStyles.formBody}>
                <Text style={[editorStyles.label, { color: colors.foreground }]}>完整配置 JSON</Text>
                <View style={[editorStyles.jsonHint, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
                  <Text style={{ color: "#92400E", fontSize: 12, lineHeight: 18 }}>
                    ⚠️ 此处包含完整的 Prompt 配置，属于系统核心资产。普通用户无法看到此内容，请妥善保管。
                  </Text>
                </View>
                <TextInput
                  style={[editorStyles.jsonInput, { backgroundColor: colors.surface, borderColor: jsonError ? "#EF4444" : colors.border, color: colors.foreground }]}
                  value={configJson}
                  onChangeText={(v) => { setConfigJson(v); setJsonError(""); }}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={`{\n  "initiator": {...},\n  "experts": [...],\n  "summarizer": {...}\n}`}
                  placeholderTextColor={colors.muted}
                />
              </View>
            )}
          </ScrollView>

          {jsonError ? (
            <View style={[editorStyles.errorBar, { backgroundColor: "#FEE2E2" }]}>
              <Text style={{ color: "#DC2626", fontSize: 13 }}>{jsonError}</Text>
            </View>
          ) : null}

          <View style={editorStyles.footer}>
            <TouchableOpacity style={[editorStyles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[editorStyles.cancelText, { color: colors.muted }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[editorStyles.saveBtn, { backgroundColor: saving ? colors.muted : "#6C63FF" }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={editorStyles.saveBtnText}>{saving ? "保存中..." : "保存"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

interface SystemWorkflow {
  id: string;
  name: string;
  description?: string | null;
  config: string;
  workflowType?: string;
  isDefault?: number;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface SystemWorkflowVersion {
  id: number;
  templateId: string;
  versionNo: number;
  name: string;
  description?: string | null;
  createdBy?: string | null;
  notes?: string | null;
  createdAt: string | Date;
}

interface SquareItem {
  id: string;
  workflowName: string;
  authorName: string;
  isVerified: boolean;
  likeCount: number;
  useCount: number;
  isPublic: boolean;
}

interface UserItem {
  openId: string;
  name: string;
  email?: string | null;
  tier: string;
  role: string;
  trialRunsLeft: number;
}

export default function AdminScreen() {
  const colors = useColors();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"workflows" | "square" | "users" | "limits">("workflows");
  const [workflows, setWorkflows] = useState<SystemWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingWorkflow, setEditingWorkflow] = useState<Partial<WorkflowTemplate> | null | undefined>(undefined);
  const [showPresets, setShowPresets] = useState(false);
  // 广场管理
  const [squareItems, setSquareItems] = useState<SquareItem[]>([]);
  const [squareLoading, setSquareLoading] = useState(false);
  // 用户管理
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  // 限制配置
  const [limitsConfig, setLimitsConfig] = useState<Record<string, string>>({});
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [tierSaving, setTierSaving] = useState<Record<string, boolean>>({});
  const [limitsEdited, setLimitsEdited] = useState<Record<string, string>>({});
  const [versionTarget, setVersionTarget] = useState<SystemWorkflow | null>(null);
  const [versions, setVersions] = useState<SystemWorkflowVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollbackingVersionNo, setRollbackingVersionNo] = useState<number | null>(null);

  const loadSquare = useCallback(async () => {
    setSquareLoading(true);
    try {
      const data = await trpcQuery("square.list?input=%7B%22json%22%3A%7B%22sortBy%22%3A%22hot%22%2C%22limit%22%3A50%2C%22offset%22%3A0%7D%7D");
      if (Array.isArray(data)) setSquareItems(data as SquareItem[]);
    } catch {
      // ignore
    } finally {
      setSquareLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await trpcQuery("auth.listUsers");
      if (Array.isArray(data)) setUsers(data as UserItem[]);
    } catch {
      // ignore
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const handleSetVerified = async (squareId: string, isVerified: boolean) => {
    try {
      await trpcMutation("square.setVerified", { squareId, isVerified });
      setSquareItems(prev => prev.map(i => i.id === squareId ? { ...i, isVerified } : i));
    } catch (e) {
      Alert.alert("设置失败", String(e));
    }
  };

  const handleSetUserTier = async (openId: string, tier: string) => {
    try {
      await trpcMutation("auth.setUserTier", { openId, tier });
      setUsers(prev => prev.map(u => u.openId === openId ? { ...u, tier } : u));
    } catch (e) {
      Alert.alert("设置失败", String(e));
    }
  };

  const loadLimits = useCallback(async () => {
    setLimitsLoading(true);
    try {
      const data = await trpcQuery("config.getAll");
      if (data && typeof data === "object") {
        const cfg = data as Record<string, string>;
        setLimitsConfig(cfg);
        setLimitsEdited(cfg);
      }
    } catch {
      // ignore
    } finally {
      setLimitsLoading(false);
    }
  }, []);

  const handleSaveLimits = async () => {
    setLimitsSaving(true);
    try {
      const entries = Object.entries(limitsEdited).map(([key, value]) => ({ key, value }));
      await trpcMutation("config.setAll", { entries });
      setLimitsConfig({ ...limitsEdited });
      Alert.alert("保存成功", "限制配置已更新，即时生效。");
    } catch (e) {
      Alert.alert("保存失败", String(e));
    } finally {
      setLimitsSaving(false);
    }
  };

  // 按等级独立保存
  const handleSaveTier = async (tierKey: string) => {
    setTierSaving(prev => ({ ...prev, [tierKey]: true }));
    try {
      // 只保存该等级的字段
      const prefix = `policy.${tierKey}.`;
      const entries = Object.entries(limitsEdited)
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, value]) => ({ key, value }));
      await trpcMutation("config.setAll", { entries });
      // 同步到 limitsConfig
      setLimitsConfig(prev => {
        const next = { ...prev };
        entries.forEach(({ key, value }) => { next[key] = value; });
        return next;
      });
      Alert.alert("保存成功", `${tierKey} 等级限制已更新，即时生效。`);
    } catch (e) {
      Alert.alert("保存失败", String(e));
    } finally {
      setTierSaving(prev => ({ ...prev, [tierKey]: false }));
    }
  };

  useEffect(() => {
    if (activeTab === "square") loadSquare();
    if (activeTab === "users") loadUsers();
    if (activeTab === "limits") loadLimits();
  }, [activeTab, loadSquare, loadUsers, loadLimits]);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await trpcQuery("systemWorkflows.list");
      if (Array.isArray(data)) {
        setWorkflows(data as SystemWorkflow[]);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("无权限") || msg.includes("请先登录")) {
        setError("管理员会话已失效或权限不足，请重新登录。");
        router.replace("/admin/login" as any);
      } else {
        setError("加载失败：" + msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async (workflowId: string) => {
    setVersionsLoading(true);
    try {
      const data = await trpcQuery(`systemWorkflows.versions?input=${encodeTrpcInput({ id: workflowId, limit: 50 })}`);
      if (Array.isArray(data)) {
        setVersions(data as SystemWorkflowVersion[]);
      } else {
        setVersions([]);
      }
    } catch (e) {
      setVersions([]);
      Alert.alert("加载失败", `无法加载版本历史：${String(e)}`);
    } finally {
      setVersionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleSave = async (data: { id: string; name: string; description: string; config: string }) => {
    const existing = workflows.find(w => w.id === data.id);
    if (existing) {
      await trpcMutation("systemWorkflows.update", data);
    } else {
      await trpcMutation("systemWorkflows.create", data);
    }
    await loadWorkflows();
  };

  const handleDelete = (wf: SystemWorkflow) => {
    Alert.alert(
      "删除系统工作流",
      `确定要删除「${wf.name}」吗？此操作不可撤销，所有用户将无法再使用此工作流。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await trpcMutation("systemWorkflows.delete", { id: wf.id });
              await loadWorkflows();
            } catch (e) {
              Alert.alert("删除失败", String(e));
            }
          },
        },
      ]
    );
  };

  const openVersionModal = (wf: SystemWorkflow) => {
    setVersionTarget(wf);
    setVersions([]);
    setRollbackingVersionNo(null);
    void loadVersions(wf.id);
  };

  const handleRollback = (wf: SystemWorkflow, versionNo: number) => {
    Alert.alert(
      "确认回滚",
      `确定将「${wf.name}」回滚到 v${versionNo} 吗？当前配置会被覆盖，并自动生成一个新版本记录此次回滚。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "回滚",
          style: "destructive",
          onPress: async () => {
            try {
              setRollbackingVersionNo(versionNo);
              const result = await trpcMutation("systemWorkflows.rollback", { id: wf.id, versionNo }) as {
                success?: boolean;
                error?: string;
                newVersionNo?: number;
              };
              if (!result?.success) {
                throw new Error(result?.error ?? "回滚失败");
              }
              await loadWorkflows();
              await loadVersions(wf.id);
              Alert.alert("回滚成功", `已回滚到 v${versionNo}，并生成新版本 v${result.newVersionNo ?? "?"}。`);
            } catch (e) {
              Alert.alert("回滚失败", String(e));
            } finally {
              setRollbackingVersionNo(null);
            }
          },
        },
      ],
    );
  };

  const formatAdminTime = (value: string | Date) => {
    return new Date(value).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleUsePreset = (preset: typeof PRESET_SCENARIOS[0]) => {
    const template = preset.buildTemplate();
    setEditingWorkflow({
      id: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...template,
      createdAt: Date.now(),
    } as WorkflowTemplate);
    setShowPresets(false);
  };

  // 解析 config 获取专家数量
  const getExpertCount = (config: string): number => {
    try {
      const parsed = JSON.parse(config) as { experts?: unknown[] };
      return Array.isArray(parsed.experts) ? parsed.experts.length : 0;
    } catch {
      return 0;
    }
  };

  return (
    <ScreenContainer>
      {/* 顶部导航 */}
      <View style={[adminStyles.topBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={adminStyles.backBtn}
          onPress={() => router.push("/web")}
          activeOpacity={0.7}
        >
          <Text style={[adminStyles.backText, { color: colors.muted }]}>← 返回</Text>
        </TouchableOpacity>
        <View style={adminStyles.topBarCenter}>
          <Text style={[adminStyles.topBarTitle, { color: colors.foreground }]}>管理员后台</Text>
          <View style={adminStyles.adminBadge}>
            <Text style={adminStyles.adminBadgeText}>ADMIN</Text>
          </View>
        </View>
        <TouchableOpacity
          style={adminStyles.backBtn}
          onPress={async () => {
            try {
              const base = getApiBaseUrl();
              await fetch(`${base}/api/admin/logout`, { method: "POST", credentials: "include" });
            } catch {}
            router.replace("/admin/login" as any);
          }}
          activeOpacity={0.7}
        >
          <Text style={[adminStyles.backText, { color: "#DC2626" }]}>退出</Text>
        </TouchableOpacity>
      </View>

      {/* Tab 切换栏 */}
      <View style={[adminStyles.tabBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {(["workflows", "square", "users", "limits"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[adminStyles.tab, activeTab === tab && { backgroundColor: "#6C63FF" }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.8}
          >
            <Text style={[adminStyles.tabText, { color: activeTab === tab ? "#fff" : colors.muted }]}>
              {tab === "workflows" ? "系统工作流" : tab === "square" ? "广场管理" : tab === "users" ? "用户管理" : "限制配置"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* 页面标题 */}
        <View style={adminStyles.pageHeader}>
          <Text style={[adminStyles.pageTitle, { color: colors.foreground }]}>
            {activeTab === "workflows" ? "系统工作流管理" : activeTab === "square" ? "广场工作流管理" : activeTab === "users" ? "用户管理" : "限制配置"}
          </Text>
          <Text style={[adminStyles.pageSubtitle, { color: colors.muted }]}>
            {activeTab === "workflows" ? "管理所有用户可见的系统工作流。Prompt 内容仅管理员可见。" : activeTab === "square" ? "管理广场工作流，设置 Verified 认证和公开状态。" : activeTab === "users" ? "管理用户权限等级（user/pro/admin）。" : "配置各用户等级的执行限制，修改后即时生效。"}
          </Text>
        </View>

        {/* 安全提示（仅系统工作流 Tab 显示） */}
        {activeTab === "workflows" && (
          <View style={[adminStyles.securityBanner, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}>
            <Text style={{ fontSize: 13, color: "#92400E", lineHeight: 20 }}>
              🔒 <Text style={{ fontWeight: "700" }}>Prompt 保护已启用</Text>：系统工作流的 Prompt 在前端 API 响应中自动过滤，普通用户无法通过任何方式获取完整内容。
            </Text>
          </View>
        )}

        {/* 系统工作流操作按鈕 */}
        {activeTab === "workflows" && !error && (
          <View style={adminStyles.actionRow}>
            <TouchableOpacity
              style={[adminStyles.actionBtn, { backgroundColor: "#6C63FF" }]}
              onPress={() => setEditingWorkflow(null)}
              activeOpacity={0.85}
            >
              <Text style={adminStyles.actionBtnText}>+ 新建工作流</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[adminStyles.actionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => setShowPresets(true)}
              activeOpacity={0.85}
            >
              <Text style={[adminStyles.actionBtnText, { color: colors.foreground }]}>⚡ 使用预置场景</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 系统工作流内容区 */}
        {activeTab === "workflows" && (loading ? (
          <View style={adminStyles.centerBox}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={[adminStyles.loadingText, { color: colors.muted }]}>加载中...</Text>
          </View>
        ) : error ? (
          <View style={[adminStyles.errorBox, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}>
            <Text style={{ fontSize: 32, marginBottom: 12 }}>🚫</Text>
            <Text style={{ color: "#DC2626", fontSize: 16, fontWeight: "700", marginBottom: 8 }}>访问受限</Text>
            <Text style={{ color: "#DC2626", fontSize: 14, textAlign: "center", lineHeight: 22 }}>{error}</Text>
            <TouchableOpacity
              style={[adminStyles.actionBtn, { backgroundColor: "#DC2626", marginTop: 16 }]}
              onPress={() => router.push("/web")}
              activeOpacity={0.85}
            >
              <Text style={adminStyles.actionBtnText}>返回首页</Text>
            </TouchableOpacity>
          </View>
        ) : workflows.length === 0 ? (
          <View style={adminStyles.emptyBox}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🎼</Text>
            <Text style={[adminStyles.emptyTitle, { color: colors.foreground }]}>还没有系统工作流</Text>
            <Text style={[adminStyles.emptySubtitle, { color: colors.muted }]}>
              创建系统工作流，让所有用户都能使用精心设计的 AI 协作模板
            </Text>
            <TouchableOpacity
              style={[adminStyles.actionBtn, { backgroundColor: "#6C63FF", marginTop: 16 }]}
              onPress={() => setShowPresets(true)}
              activeOpacity={0.85}
            >
              <Text style={adminStyles.actionBtnText}>⚡ 从预置场景开始</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={adminStyles.list}>
            {workflows.map((wf) => {
              const expertCount = getExpertCount(wf.config);
              return (
                <View key={wf.id} style={[adminStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={adminStyles.cardHeader}>
                    <View style={adminStyles.cardTitleRow}>
                      <Text style={[adminStyles.cardTitle, { color: colors.foreground }]}>{wf.name}</Text>
                      <View style={adminStyles.systemBadge}>
                        <Text style={adminStyles.systemBadgeText}>系统</Text>
                      </View>
                    </View>
                    {wf.description ? (
                      <Text style={[adminStyles.cardDesc, { color: colors.muted }]} numberOfLines={2}>
                        {wf.description}
                      </Text>
                    ) : null}
                  </View>

                  <View style={adminStyles.cardMeta}>
                    <View style={[adminStyles.metaChip, { backgroundColor: colors.background }]}>
                      <Text style={[adminStyles.metaChipText, { color: colors.muted }]}>
                        👥 {expertCount} 位专家
                      </Text>
                    </View>
                    <View style={[adminStyles.metaChip, { backgroundColor: "#F0FDF4" }]}>
                      <Text style={[adminStyles.metaChipText, { color: "#16A34A" }]}>
                        🔒 Prompt 已保护
                      </Text>
                    </View>
                  </View>

                  <View style={adminStyles.cardActions}>
                    <TouchableOpacity
                      style={[adminStyles.editBtn, { borderColor: colors.border }]}
                      onPress={() => {
                        try {
                          const config = JSON.parse(wf.config) as Partial<WorkflowTemplate>;
                          setEditingWorkflow({ id: wf.id, ...config });
                        } catch {
                          setEditingWorkflow({ id: wf.id, name: wf.name, description: wf.description ?? "" });
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[adminStyles.editBtnText, { color: colors.foreground }]}>编辑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[adminStyles.versionBtn, { borderColor: "#6C63FF30", backgroundColor: "#6C63FF10" }]}
                      onPress={() => openVersionModal(wf)}
                      activeOpacity={0.8}
                    >
                      <Text style={adminStyles.versionBtnText}>版本</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={adminStyles.deleteBtn}
                      onPress={() => handleDelete(wf)}
                      activeOpacity={0.8}
                    >
                      <Text style={adminStyles.deleteBtnText}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {/* 广场管理内容区 */}
        {activeTab === "square" && (
          squareLoading ? (
            <View style={adminStyles.centerBox}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={[adminStyles.loadingText, { color: colors.muted }]}>加载中...</Text>
            </View>
          ) : squareItems.length === 0 ? (
            <View style={adminStyles.emptyBox}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🎼</Text>
              <Text style={[adminStyles.emptyTitle, { color: colors.foreground }]}>广场还没有工作流</Text>
            </View>
          ) : (
            <View style={adminStyles.list}>
              {squareItems.map((item) => (
                <View key={item.id} style={[adminStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={adminStyles.cardHeader}>
                    <View style={adminStyles.cardTitleRow}>
                      <Text style={[adminStyles.cardTitle, { color: colors.foreground }]}>{item.workflowName}</Text>
                      {item.isVerified && (
                        <View style={[adminStyles.systemBadge, { backgroundColor: "#D1FAE5" }]}>
                          <Text style={[adminStyles.systemBadgeText, { color: "#059669" }]}>✔ Verified</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[adminStyles.cardDesc, { color: colors.muted }]}>作者：{item.authorName} · 点赞 {item.likeCount} · 使用 {item.useCount}</Text>
                  </View>
                  <View style={adminStyles.cardActions}>
                    <TouchableOpacity
                      style={[adminStyles.editBtn, { borderColor: item.isVerified ? "#059669" : colors.border, backgroundColor: item.isVerified ? "#D1FAE5" : undefined }]}
                      onPress={() => handleSetVerified(item.id, !item.isVerified)}
                      activeOpacity={0.8}
                    >
                      <Text style={[adminStyles.editBtnText, { color: item.isVerified ? "#059669" : colors.foreground }]}>
                        {item.isVerified ? "取消 Verified" : "设为 Verified"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )
        )}

        {/* 限制配置内容区 */}
        {activeTab === "limits" && (
          limitsLoading ? (
            <View style={adminStyles.centerBox}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={[adminStyles.loadingText, { color: colors.muted }]}>加载中...</Text>
            </View>
          ) : (
            <View>
              {/* 说明卡片 */}
              <View style={[adminStyles.securityBanner, { backgroundColor: "#EDE9FE", borderColor: "#6C63FF", marginBottom: 16 }]}>
                <Text style={{ fontSize: 13, color: "#4C1D95", lineHeight: 20 }}>
                  ⚙️ 修改各等级限制后点击「保存配置」即时生效，无需重启服务。空字符串表示不限制模型（使用用户自带 Key）。
                </Text>
              </View>

              {/* 访客等级 */}
              <LimitSection
                title="👤 访客（未登录）"
                tierKey="visitor"
                values={limitsEdited}
                onChange={(k, v) => setLimitsEdited(prev => ({ ...prev, [k]: v }))}
                onSave={() => handleSaveTier("visitor")}
                isSaving={!!tierSaving["visitor"]}
                colors={colors}
              />

              {/* 注册用户（无 Key） */}
              <LimitSection
                title="👤 注册用户（无 API Key）"
                tierKey="registered_no_key"
                values={limitsEdited}
                onChange={(k, v) => setLimitsEdited(prev => ({ ...prev, [k]: v }))}
                onSave={() => handleSaveTier("registered_no_key")}
                isSaving={!!tierSaving["registered_no_key"]}
                colors={colors}
                extraFields={[{ key: "trialRunsOnRegister", label: "注册赠送试用次数" }]}
              />

              {/* 注册用户（有 Key） */}
              <LimitSection
                title="🔑 注册用户（已绑定 API Key）"
                tierKey="registered_with_key"
                values={limitsEdited}
                onChange={(k, v) => setLimitsEdited(prev => ({ ...prev, [k]: v }))}
                onSave={() => handleSaveTier("registered_with_key")}
                isSaving={!!tierSaving["registered_with_key"]}
                colors={colors}
              />

              {/* Pro 用户 */}
              <LimitSection
                title="⭐ Pro 用户"
                tierKey="pro"
                values={limitsEdited}
                onChange={(k, v) => setLimitsEdited(prev => ({ ...prev, [k]: v }))}
                onSave={() => handleSaveTier("pro")}
                isSaving={!!tierSaving["pro"]}
                colors={colors}
              />
            </View>
          )
        )}

        {/* 用户管理内容区 */}
        {activeTab === "users" && (
          usersLoading ? (
            <View style={adminStyles.centerBox}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={[adminStyles.loadingText, { color: colors.muted }]}>加载中...</Text>
            </View>
          ) : users.length === 0 ? (
            <View style={adminStyles.emptyBox}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>👥</Text>
              <Text style={[adminStyles.emptyTitle, { color: colors.foreground }]}>还没有用户</Text>
            </View>
          ) : (
            <View style={adminStyles.list}>
              {users.map((u) => (
                <View key={u.openId} style={[adminStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={adminStyles.cardHeader}>
                    <View style={adminStyles.cardTitleRow}>
                      <Text style={[adminStyles.cardTitle, { color: colors.foreground }]}>{u.name}</Text>
                      <View style={[adminStyles.systemBadge, { backgroundColor: u.tier === "pro" ? "#FEF3C7" : u.tier === "admin" ? "#EDE9FE" : colors.background }]}>
                        <Text style={[adminStyles.systemBadgeText, { color: u.tier === "pro" ? "#D97706" : u.tier === "admin" ? "#6C63FF" : colors.muted }]}>{u.tier.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={[adminStyles.cardDesc, { color: colors.muted }]}>{u.email ?? u.openId} · 试用次数剩余：{u.trialRunsLeft}</Text>
                  </View>
                  <View style={adminStyles.cardActions}>
                    {(["user", "pro", "admin"] as const).map((tier) => (
                      <TouchableOpacity
                        key={tier}
                        style={[adminStyles.editBtn, { borderColor: u.tier === tier ? "#6C63FF" : colors.border, backgroundColor: u.tier === tier ? "#EDE9FE" : undefined }]}
                        onPress={() => handleSetUserTier(u.openId, tier)}
                        activeOpacity={0.8}
                      >
                        <Text style={[adminStyles.editBtnText, { color: u.tier === tier ? "#6C63FF" : colors.foreground }]}>{tier}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {versionTarget && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVersionTarget(null)}>
          <View style={editorStyles.overlay}>
            <View style={[editorStyles.box, { backgroundColor: colors.background, borderColor: colors.border, maxHeight: 620 }]}>
              <View style={editorStyles.header}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[editorStyles.title, { color: colors.foreground }]}>版本历史 · {versionTarget.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
                    每次创建/更新/回滚都会自动生成版本，可随时回滚。
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setVersionTarget(null)} activeOpacity={0.7}>
                  <Text style={[editorStyles.closeBtn, { color: colors.muted }]}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {versionsLoading ? (
                  <View style={adminStyles.centerBox}>
                    <ActivityIndicator size="small" color="#6C63FF" />
                    <Text style={[adminStyles.loadingText, { color: colors.muted }]}>加载版本中...</Text>
                  </View>
                ) : versions.length === 0 ? (
                  <View style={adminStyles.emptyBox}>
                    <Text style={[adminStyles.emptySubtitle, { color: colors.muted }]}>
                      暂无版本记录。下次保存系统工作流后会自动生成版本。
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {versions.map((v) => (
                      <View key={v.id} style={[adminStyles.versionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={adminStyles.versionMain}>
                          <View style={adminStyles.versionTitleRow}>
                            <Text style={[adminStyles.versionTitle, { color: colors.foreground }]}>v{v.versionNo}</Text>
                            <Text style={[adminStyles.versionTime, { color: colors.muted }]}>{formatAdminTime(v.createdAt)}</Text>
                          </View>
                          <Text style={[adminStyles.versionName, { color: colors.foreground }]} numberOfLines={1}>
                            {v.name}
                          </Text>
                          {v.notes ? (
                            <Text style={[adminStyles.versionNote, { color: colors.muted }]} numberOfLines={2}>
                              备注：{v.notes}
                            </Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          style={[
                            adminStyles.rollbackBtn,
                            {
                              backgroundColor: rollbackingVersionNo === v.versionNo ? "#A78BFA" : "#6C63FF",
                            },
                          ]}
                          onPress={() => handleRollback(versionTarget, v.versionNo)}
                          disabled={rollbackingVersionNo !== null}
                          activeOpacity={0.85}
                        >
                          <Text style={adminStyles.rollbackBtnText}>
                            {rollbackingVersionNo === v.versionNo ? "回滚中..." : "回滚到此版本"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {showPresets && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowPresets(false)}>
          <View style={editorStyles.overlay}>
            <View style={[editorStyles.box, { backgroundColor: colors.background, borderColor: colors.border, maxHeight: 520 }]}>
              <View style={editorStyles.header}>
                <Text style={[editorStyles.title, { color: colors.foreground }]}>选择预置场景</Text>
                <TouchableOpacity onPress={() => setShowPresets(false)} activeOpacity={0.7}>
                  <Text style={[editorStyles.closeBtn, { color: colors.muted }]}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
                {PRESET_SCENARIOS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={[adminStyles.presetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => handleUsePreset(preset)}
                    activeOpacity={0.85}
                  >
                    <View style={[adminStyles.presetIcon, { backgroundColor: preset.color + "20" }]}>
                      <Text style={{ fontSize: 24 }}>{preset.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[adminStyles.presetLabel, { color: colors.foreground }]}>{preset.label}</Text>
                      <Text style={[adminStyles.presetDesc, { color: colors.muted }]}>{preset.description}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* 工作流编辑器 */}
      {editingWorkflow !== undefined && (
        <WorkflowEditor
          workflow={editingWorkflow}
          onSave={handleSave}
          onClose={() => setEditingWorkflow(undefined)}
          colors={colors}
        />
      )}
    </ScreenContainer>
  );
}
// ── LimitSection 组件 ────────────────────────────────────────────────────────────────────────────────

/**
 * 单个等级的限制配置表单组
 * 展示该等级的所有可配置字段，支持内联编辑
 */
function LimitSection({
  title,
  tierKey,
  values,
  onChange,
  onSave,
  isSaving,
  colors,
  extraFields,
}: {
  title: string;
  tierKey: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
  extraFields?: Array<{ key: string; label: string }>;
}) {
  const fields: Array<{ key: string; label: string; placeholder: string }> = [
    { key: "allowedModel", label: "强制模型", placeholder: "空 = 不限制（使用用户自带 Key）" },
    { key: "maxExperts", label: "最大并发专家数", placeholder: "例：2" },
    { key: "dailyIpLimit", label: "IP 日限次数", placeholder: "例：5" },
    { key: "maxInputChars", label: "最大输入字数", placeholder: "例：5000" },
    { key: "timeoutMs", label: "超时（毫秒）", placeholder: "例：30000" },
    ...(extraFields ?? []).map((f) => ({ ...f, placeholder: "填写数字" })),
  ];

  return (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 14 }}>{title}</Text>
      {fields.map((field) => {
        const fullKey = `policy.${tierKey}.${field.key}`;
        const val = values[fullKey] ?? "";
        return (
          <View key={fullKey} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>{field.label}</Text>
            <TextInput
              value={val}
              onChangeText={(text) => onChange(fullKey, text)}
              placeholder={field.placeholder}
              placeholderTextColor={colors.muted}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 14,
                color: colors.foreground,
                backgroundColor: colors.background,
              }}
              returnKeyType="done"
            />
          </View>
        );
      })}
      {/* 独立保存按鈕 */}
      <TouchableOpacity
        style={{
          backgroundColor: isSaving ? colors.muted : "#6C63FF",
          borderRadius: 8,
          paddingVertical: 10,
          alignItems: "center",
          marginTop: 4,
        }}
        onPress={onSave}
        disabled={isSaving}
        activeOpacity={0.85}
      >
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
          {isSaving ? "保存中..." : "保存此等级"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 样式 ──────────────────────────────────────────────────────────────────────────────────

const adminStyles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  backText: { fontSize: 14 },
  topBarCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  topBarTitle: { fontSize: 16, fontWeight: "700" },
  adminBadge: { backgroundColor: "#DC2626", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  adminBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  pageHeader: { marginBottom: 16 },
  pageTitle: { fontSize: 22, fontWeight: "800", marginBottom: 6 },
  pageSubtitle: { fontSize: 13, lineHeight: 20 },
  securityBanner: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  actionBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  centerBox: { alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, fontSize: 14 },
  errorBox: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: "center", marginTop: 20 },
  emptyBox: { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySubtitle: { fontSize: 13, textAlign: "center", lineHeight: 20, maxWidth: 300 },
  list: { gap: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16 },
  cardHeader: { marginBottom: 12 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  systemBadge: { backgroundColor: "#EDE9FE", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  systemBadgeText: { color: "#6C63FF", fontSize: 11, fontWeight: "700" },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  cardMeta: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  metaChip: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  metaChipText: { fontSize: 12 },
  cardActions: { flexDirection: "row", gap: 8 },
  editBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  editBtnText: { fontSize: 14, fontWeight: "600" },
  versionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  versionBtnText: { color: "#6C63FF", fontSize: 14, fontWeight: "700" },
  deleteBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#FEE2E2", alignItems: "center" },
  deleteBtnText: { color: "#DC2626", fontSize: 14, fontWeight: "600" },
  versionCard: { borderRadius: 10, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  versionMain: { flex: 1 },
  versionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  versionTitle: { fontSize: 15, fontWeight: "800" },
  versionTime: { fontSize: 12 },
  versionName: { fontSize: 13, fontWeight: "600", marginTop: 4 },
  versionNote: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  rollbackBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  rollbackBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  presetCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 10, borderWidth: 1, padding: 14, marginBottom: 10 },
  presetIcon: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  presetLabel: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  presetDesc: { fontSize: 12, lineHeight: 18 },
  tabBar: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  tabText: { fontSize: 13, fontWeight: "600" },
});

const editorStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  box: { width: "100%", maxWidth: 640, maxHeight: 680, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingBottom: 0 },
  title: { fontSize: 18, fontWeight: "700" },
  closeBtn: { fontSize: 20, padding: 4 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginTop: 12 },
  tab: { paddingHorizontal: 20, paddingVertical: 10 },
  tabText: { fontSize: 14, fontWeight: "600" },
  formBody: { padding: 20, gap: 4 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 14 },
  jsonInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 12, fontFamily: "monospace", minHeight: 280, textAlignVertical: "top" },
  jsonHint: { borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 4 },
  infoBox: { borderRadius: 8, borderWidth: 1, padding: 12, marginTop: 12 },
  infoText: { fontSize: 13, lineHeight: 20 },
  errorBar: { padding: 12, marginHorizontal: 20, borderRadius: 8, marginBottom: 8 },
  footer: { flexDirection: "row", gap: 10, padding: 20, paddingTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  cancelText: { fontSize: 14, fontWeight: "600" },
  saveBtn: { flex: 2, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
