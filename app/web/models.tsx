import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "expo-router";
import { WebLayout } from "@/components/web-layout";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface AiModelConfig {
  id: string;
  name: string;
  provider?: string;
  apiUrl: string;
  apiKey: string;       // 列表中为脱敏值（...xxxx），编辑时回填完整值
  modelName: string;
  isDefault: number;
  createdAt?: string;
  updatedAt?: string;
}

// 常用服务商快捷配置
const PRESET_PROVIDERS = [
  { label: "OpenAI",     apiUrl: "https://api.openai.com/v1",         modelName: "gpt-4o",           color: "#10A37F" },
  { label: "DeepSeek",   apiUrl: "https://api.deepseek.com/v1",       modelName: "deepseek-chat",    color: "#4D6BFE" },
  { label: "Anthropic",  apiUrl: "https://api.anthropic.com/v1",      modelName: "claude-3-5-sonnet-20241022", color: "#D97706" },
  { label: "Groq",       apiUrl: "https://api.groq.com/openai/v1",    modelName: "llama-3.3-70b-versatile", color: "#F97316" },
  { label: "Moonshot",   apiUrl: "https://api.moonshot.cn/v1",        modelName: "moonshot-v1-8k",   color: "#8B5CF6" },
  { label: "自定义",     apiUrl: "",                                   modelName: "",                 color: "#6B7280" },
];

// ── tRPC 调用工具函数 ─────────────────────────────────────────────────────────

// tRPC with superjson wraps data in result.data.json
function extractTrpcData(json: { result?: { data?: unknown } }): unknown {
  const dataObj = json.result?.data;
  if (dataObj && typeof dataObj === 'object' && 'json' in (dataObj as object)) {
    return (dataObj as { json: unknown }).json;
  }
  return dataObj;
}

async function trpcQuery(procedure: string) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/trpc/${procedure}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { result?: { data?: unknown } };
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { result?: { data?: unknown } };
  return extractTrpcData(json);
}

// ── 新增/编辑弹窗 ─────────────────────────────────────────────────────────────

function ModelFormModal({
  model,
  onSave,
  onClose,
  colors,
}: {
  model: Partial<AiModelConfig> | null;
  onSave: (data: Omit<AiModelConfig, "createdAt" | "updatedAt">) => Promise<void>;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const isEdit = !!model?.id;
  const [name, setName] = useState(model?.name ?? "");
  const [provider, setProvider] = useState(model?.provider ?? "");
  const [apiUrl, setApiUrl] = useState(model?.apiUrl ?? "");
  const [apiKey, setApiKey] = useState("");   // 编辑时不预填脱敏值
  const [modelName, setModelName] = useState(model?.modelName ?? "");
  const [isDefault, setIsDefault] = useState((model?.isDefault ?? 0) === 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const applyPreset = (preset: typeof PRESET_PROVIDERS[0]) => {
    if (preset.apiUrl) setApiUrl(preset.apiUrl);
    if (preset.modelName) setModelName(preset.modelName);
    setProvider(preset.label === "自定义" ? "" : preset.label);
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("请填写模型名称"); return; }
    if (!apiUrl.trim()) { setError("请填写 API 地址"); return; }
    if (!isEdit && !apiKey.trim()) { setError("请填写 API Key"); return; }
    if (!modelName.trim()) { setError("请填写模型标识符"); return; }
    setError("");
    setSaving(true);
    try {
      await onSave({
        id: model?.id ?? `model_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        provider: provider.trim() || undefined,
        apiUrl: apiUrl.trim(),
        apiKey: apiKey.trim(),
        modelName: modelName.trim(),
        isDefault: isDefault ? 1 : 0,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {/* 头部 */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {isEdit ? "编辑模型" : "添加模型"}
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.closeBtn, { color: colors.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
            <View style={styles.formBody}>
              {/* 快捷选择服务商 */}
              <Text style={[styles.label, { color: colors.foreground }]}>快捷选择服务商</Text>
              <View style={styles.presetRow}>
                {PRESET_PROVIDERS.map(p => (
                  <TouchableOpacity
                    key={p.label}
                    style={[styles.presetPill, { borderColor: provider === p.label ? p.color : colors.border, backgroundColor: provider === p.label ? p.color + "15" : colors.surface }]}
                    onPress={() => applyPreset(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.presetPillText, { color: provider === p.label ? p.color : colors.muted }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 模型名称 */}
              <Text style={[styles.label, { color: colors.foreground }]}>显示名称 *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={name}
                onChangeText={setName}
                placeholder="例如：DeepSeek Chat"
                placeholderTextColor={colors.muted}
              />

              {/* API 地址 */}
              <Text style={[styles.label, { color: colors.foreground }]}>API Base URL *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={apiUrl}
                onChangeText={setApiUrl}
                placeholder="https://api.openai.com/v1"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* API Key */}
              <Text style={[styles.label, { color: colors.foreground }]}>
                API Key {isEdit ? "（留空则不修改）" : "*"}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry
                placeholder={isEdit ? "输入新 Key 以替换，留空保持不变" : "sk-..."}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={[styles.securityNote, { backgroundColor: "#16A34A10", borderColor: "#16A34A30" }]}>
                <Text style={[styles.securityNoteText, { color: "#166534" }]}>
                  API Key 保存后会加密处理，任何人都看不到完整内容（页面仅显示脱敏片段）。
                </Text>
              </View>

              {/* 模型标识符 */}
              <Text style={[styles.label, { color: colors.foreground }]}>模型标识符 *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={modelName}
                onChangeText={setModelName}
                placeholder="例如：gpt-4o / deepseek-chat"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* 设为默认 */}
              <TouchableOpacity
                style={[styles.checkRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setIsDefault(v => !v)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, { borderColor: isDefault ? "#6C63FF" : colors.border, backgroundColor: isDefault ? "#6C63FF" : "transparent" }]}>
                  {isDefault && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
                </View>
                <Text style={[styles.checkLabel, { color: colors.foreground }]}>设为我的默认模型</Text>
              </TouchableOpacity>

              {error ? (
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              ) : null}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.cancelBtnText, { color: colors.muted }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : "#6C63FF" }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.saveBtnText}>{saving ? "保存中..." : "保存"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ModelsScreen() {
  const colors = useColors();
  const router = useRouter();
  const [models, setModels] = useState<AiModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingModel, setEditingModel] = useState<Partial<AiModelConfig> | null | undefined>(undefined);
  // undefined = 弹窗关闭, null = 新增, AiModelConfig = 编辑

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await trpcQuery("models.list");
      if (Array.isArray(data)) {
        setModels(data as AiModelConfig[]);
      }
    } catch {
      // 未登录或网络错误，静默处理
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleSave = async (data: Omit<AiModelConfig, "createdAt" | "updatedAt">) => {
    const isEdit = models.some(m => m.id === data.id);
    if (isEdit) {
      await trpcMutation("models.update", data);
    } else {
      await trpcMutation("models.create", data);
    }
    await loadModels();
  };

  const handleDelete = (model: AiModelConfig) => {
    Alert.alert(
      "删除模型",
      `确定要删除「${model.name}」吗？已配置此模型的专家将无法正常调用 AI。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await trpcMutation("models.delete", { id: model.id });
              await loadModels();
            } catch (e) {
              Alert.alert("删除失败", String(e));
            }
          },
        },
      ]
    );
  };

  return (
    <WebLayout title="我的 · AI模型">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* 页头 */}
        <View style={styles.pageHeader}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>我的 AI 模型</Text>
          <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
            「我的」下的子功能：统一管理你的 API 配置，供工作流专家直接选择
          </Text>
        </View>

        <View style={[styles.privacyBanner, { backgroundColor: "#22C55E10", borderColor: "#22C55E40" }]}>
          <Text style={[styles.privacyBannerTitle, { color: "#15803D" }]}>隐私保护</Text>
          <Text style={[styles.privacyBannerText, { color: "#166534" }]}>
            你的 API Key 会加密保存，任何人都看不到完整内容；系统仅用于执行你发起的任务调用。
          </Text>
        </View>

        {/* 添加按钮 */}
        <TouchableOpacity
          style={[styles.addModelBtn, { borderColor: "#6C63FF", backgroundColor: "#6C63FF15" }]}
          onPress={() => setEditingModel(null)}
          activeOpacity={0.8}
        >
          <Text style={[styles.addModelBtnText, { color: "#6C63FF" }]}>+ 添加模型</Text>
        </TouchableOpacity>

        {/* 模型列表 */}
        {loading ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.muted }]}>加载中...</Text>
          </View>
        ) : models.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🤖</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>还没有添加任何模型</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              点击上方「添加模型」，配置你的 API Key 后，专家就可以使用了
            </Text>
          </View>
        ) : (
          <View style={styles.modelList}>
            {models.map(model => (
              <View
                key={model.id}
                style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: model.isDefault === 1 ? "#6C63FF" : colors.border }]}
              >
                <View style={styles.modelCardTop}>
                  <View style={styles.modelInfo}>
                    <View style={styles.modelNameRow}>
                      <Text style={[styles.modelName, { color: colors.foreground }]}>{model.name}</Text>
                      {model.isDefault === 1 && (
                        <View style={[styles.defaultBadge, { backgroundColor: "#6C63FF15" }]}>
                          <Text style={[styles.defaultBadgeText, { color: "#6C63FF" }]}>默认</Text>
                        </View>
                      )}
                    </View>
                    {model.provider ? (
                      <Text style={[styles.modelProvider, { color: colors.muted }]}>{model.provider}</Text>
                    ) : null}
                  </View>
                  <View style={styles.modelActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.border }]}
                      onPress={() => setEditingModel(model)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.foreground }]}>编辑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.error + "60" }]}
                      onPress={() => handleDelete(model)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.actionBtnText, { color: colors.error }]}>删除</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 详情行 */}
                <View style={[styles.modelDetails, { borderTopColor: colors.border }]}>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>模型</Text>
                    <Text style={[styles.detailValue, { color: colors.foreground }]}>{model.modelName}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>API Key（已脱敏）</Text>
                    <Text style={[styles.detailValue, { color: colors.muted }]}>{model.apiKey || "—"}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: colors.muted }]}>地址</Text>
                    <Text style={[styles.detailValue, { color: colors.muted }]} numberOfLines={1}>{model.apiUrl}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* 提示：去专家配置页使用 */}
        {models.length > 0 && (
          <TouchableOpacity
            style={[styles.hintBox, { backgroundColor: "#6C63FF10", borderColor: "#6C63FF30" }]}
            onPress={() => router.push("/web" as any)}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#6C63FF", fontSize: 13, fontWeight: "600" }}>
              ✅ 模型已配置，前往工作流页面新建工作流时即可选择 →
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* 新增/编辑弹窗 */}
      {editingModel !== undefined && (
        <ModelFormModal
          model={editingModel}
          onSave={handleSave}
          onClose={() => setEditingModel(undefined)}
          colors={colors}
        />
      )}
    </WebLayout>
  );
}

// ── 样式 ──────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: { padding: 24, paddingBottom: 60, gap: 20 },

  pageHeader: { gap: 6 },
  pageTitle: { fontSize: 24, fontWeight: "700" },
  pageSubtitle: { fontSize: 14, lineHeight: 20 },
  privacyBanner: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  privacyBannerTitle: { fontSize: 13, fontWeight: "700" },
  privacyBannerText: { fontSize: 12, lineHeight: 18 },

  addModelBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: "center" },
  addModelBtnText: { fontSize: 15, fontWeight: "600" },

  emptyBox: { borderRadius: 12, borderWidth: 1, borderStyle: "dashed", padding: 32, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "600" },
  emptyText: { fontSize: 13, textAlign: "center", lineHeight: 20 },

  modelList: { gap: 12 },
  modelCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  modelCardTop: { flexDirection: "row", alignItems: "flex-start", padding: 16, gap: 12 },
  modelInfo: { flex: 1, gap: 4 },
  modelNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modelName: { fontSize: 15, fontWeight: "700" },
  modelProvider: { fontSize: 12 },
  defaultBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 11, fontWeight: "600" },
  modelActions: { flexDirection: "row", gap: 6 },
  actionBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  actionBtnText: { fontSize: 12, fontWeight: "500" },

  modelDetails: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  detailItem: { flexDirection: "row", gap: 8, alignItems: "center" },
  detailLabel: { fontSize: 11, fontWeight: "600", width: 92 },
  detailValue: { fontSize: 12, flex: 1 },

  hintBox: { borderRadius: 10, borderWidth: 1, padding: 14, alignItems: "center" },

  // 弹窗
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", maxWidth: 520, borderRadius: 20, borderWidth: 1, padding: 24, maxHeight: "90%" as any },
  modalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "700" },
  closeBtn: { fontSize: 18, padding: 4 },

  formBody: { gap: 8 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 8 },
  input: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  securityNote: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  securityNoteText: { fontSize: 12, lineHeight: 17 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetPill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  presetPillText: { fontSize: 12, fontWeight: "500" },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  checkLabel: { fontSize: 14 },

  errorText: { fontSize: 13, marginTop: 4 },

  modalFooter: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: "center" },
  cancelBtnText: { fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 10, padding: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
