import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  Modal, StyleSheet, KeyboardAvoidingView, Platform
} from "react-native";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import {
  WorkflowTemplate, Role, RoleType,
  ApiProvider, CapabilityType,
  API_PROVIDER_CONFIG, CAPABILITY_CONFIG,
  RoleApiConfig,
} from "@/shared/workflow-types";

const ROLE_TYPE_CFG: Record<RoleType, { label: string; color: string; bg: string }> = {
  initiator:  { label: "引导者", color: "#6C63FF", bg: "#6C63FF15" },
  expert:     { label: "专家",   color: "#0EA5E9", bg: "#0EA5E915" },
  summarizer: { label: "汇总者", color: "#22C55E", bg: "#22C55E15" },
};

// ── 角色编辑弹窗 ──────────────────────────────────────────────────────────────
function RoleEditModal({
  role, onSave, onClose, colors,
}: {
  role: Role;
  onSave: (updated: Role) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [draft, setDraft] = useState<Role>({ ...role });
  const [tab, setTab] = useState<"basic" | "api">("basic");
  const cfg = ROLE_TYPE_CFG[draft.type];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[mStyles.overlay]}>
          <View style={[mStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {/* 头部 */}
            <View style={mStyles.header}>
              <View style={[mStyles.typeBadge, { backgroundColor: cfg.bg }]}>
                <Text style={[mStyles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <Text style={[mStyles.title, { color: colors.foreground }]}>编辑角色</Text>
              <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                <Text style={[mStyles.closeBtn, { color: colors.muted }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Tab */}
            <View style={[mStyles.tabRow, { borderBottomColor: colors.border }]}>
              {(["basic", "api"] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[mStyles.tab, tab === t && { borderBottomColor: "#6C63FF", borderBottomWidth: 2 }]}
                  onPress={() => setTab(t)}
                  activeOpacity={0.8}
                >
                  <Text style={[mStyles.tabText, { color: tab === t ? "#6C63FF" : colors.muted }]}>
                    {t === "basic" ? "基本信息" : "API 配置"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {tab === "basic" ? (
                <View style={mStyles.formBody}>
                  <Text style={[mStyles.label, { color: colors.foreground }]}>名称</Text>
                  <TextInput
                    style={[mStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    value={draft.name}
                    onChangeText={v => setDraft(d => ({ ...d, name: v }))}
                    placeholder="角色名称"
                    placeholderTextColor={colors.muted}
                  />
                  <Text style={[mStyles.label, { color: colors.foreground }]}>描述</Text>
                  <TextInput
                    style={[mStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    value={draft.description}
                    onChangeText={v => setDraft(d => ({ ...d, description: v }))}
                    placeholder="简述角色职责"
                    placeholderTextColor={colors.muted}
                  />
                  <Text style={[mStyles.label, { color: colors.foreground }]}>系统提示词</Text>
                  <TextInput
                    style={[mStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 100 }]}
                    value={draft.systemPrompt}
                    onChangeText={v => setDraft(d => ({ ...d, systemPrompt: v }))}
                    placeholder="描述角色的分析角度和输出要求..."
                    placeholderTextColor={colors.muted}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              ) : (
                <View style={mStyles.formBody}>
                  <Text style={[mStyles.label, { color: colors.foreground }]}>专项能力</Text>
                  <View style={mStyles.capGrid}>
                    {(Object.keys(CAPABILITY_CONFIG) as CapabilityType[]).map(cap => {
                      const capCfg = CAPABILITY_CONFIG[cap];
                      const isActive = (draft.apiConfig?.capabilityType ?? "general") === cap;
                      return (
                        <TouchableOpacity
                          key={cap}
                          style={[mStyles.capPill, {
                            borderColor: isActive ? capCfg.color : colors.border,
                            backgroundColor: isActive ? capCfg.color + "15" : colors.surface,
                          }]}
                          onPress={() => setDraft(d => ({
                            ...d,
                            apiConfig: { ...(d.apiConfig ?? { provider: "builtin" as ApiProvider, capabilityType: "general" as CapabilityType }), capabilityType: cap },
                          }))}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 12 }}>{capCfg.icon}</Text>
                          <Text style={[mStyles.capPillText, { color: isActive ? capCfg.color : colors.muted }]}>{capCfg.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[mStyles.label, { color: colors.foreground }]}>AI 服务</Text>
                  <View style={mStyles.provRow}>
                    {(["builtin", "openai", "custom"] as ApiProvider[]).map(p => {
                      const provCfg = API_PROVIDER_CONFIG[p];
                      const isActive = (draft.apiConfig?.provider ?? "builtin") === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[mStyles.provPill, {
                            borderColor: isActive ? provCfg.color : colors.border,
                            backgroundColor: isActive ? provCfg.color + "15" : colors.surface,
                          }]}
                          onPress={() => setDraft(d => ({
                            ...d,
                            apiConfig: { ...(d.apiConfig ?? { provider: "builtin" as ApiProvider, capabilityType: "general" as CapabilityType }), provider: p, model: p === "openai" ? "xxxxx" : "default" },
                          }))}
                          activeOpacity={0.8}
                        >
                          <Text style={[mStyles.provPillText, { color: isActive ? provCfg.color : colors.muted }]}>{provCfg.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {draft.apiConfig?.provider === "openai" && (
                    <>
                      <Text style={[mStyles.label, { color: colors.foreground }]}>API Key</Text>
                      <TextInput
                        style={[mStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                        value={draft.apiConfig?.apiKey ?? ""}
                        onChangeText={v => setDraft(d => ({ ...d, apiConfig: { ...(d.apiConfig as RoleApiConfig), apiKey: v } }))}
                        secureTextEntry
                        placeholder="sk-..."
                        placeholderTextColor={colors.muted}
                      />
                    </>
                  )}
                  {draft.apiConfig?.provider === "custom" && (
                    <>
                      <Text style={[mStyles.label, { color: colors.foreground }]}>API Base URL</Text>
                      <TextInput
                        style={[mStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                        value={draft.apiConfig?.baseUrl ?? ""}
                        onChangeText={v => setDraft(d => ({ ...d, apiConfig: { ...(d.apiConfig as RoleApiConfig), baseUrl: v } }))}
                        placeholder="https://api.example.com/v1"
                        placeholderTextColor={colors.muted}
                      />
                      <Text style={[mStyles.label, { color: colors.foreground }]}>API Key</Text>
                      <TextInput
                        style={[mStyles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                        value={draft.apiConfig?.apiKey ?? ""}
                        onChangeText={v => setDraft(d => ({ ...d, apiConfig: { ...(d.apiConfig as RoleApiConfig), apiKey: v } }))}
                        secureTextEntry
                        placeholder="API Key"
                        placeholderTextColor={colors.muted}
                      />
                    </>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={mStyles.footer}>
              <TouchableOpacity style={[mStyles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
                <Text style={[mStyles.cancelBtnText, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[mStyles.saveBtn, { backgroundColor: "#6C63FF" }]}
                onPress={() => { onSave(draft); onClose(); }}
                activeOpacity={0.85}
              >
                <Text style={mStyles.saveBtnText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function RolesScreen() {
  const colors = useColors();
  const { state, updateTemplate } = useWorkflow();

  const [selectedTplId, setSelectedTplId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isAddingExpert, setIsAddingExpert] = useState(false);

  const selectedTpl = state.templates.find(t => t.id === selectedTplId) ?? null;

  const handleSaveRole = async (updated: Role) => {
    if (!selectedTpl) return;
    let newTpl: WorkflowTemplate;
    if (updated.type === "initiator") {
      newTpl = { ...selectedTpl, initiator: updated };
    } else if (updated.type === "summarizer") {
      newTpl = { ...selectedTpl, summarizer: updated };
    } else {
      newTpl = { ...selectedTpl, experts: selectedTpl.experts.map(e => e.id === updated.id ? updated : e) };
    }
    await updateTemplate(newTpl);
  };

  const handleAddExpert = async (newRole: Role) => {
    if (!selectedTpl) return;
    const role: Role = {
      ...newRole,
      id: `role_expert_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: newRole.name || "新专家",
    };
    await updateTemplate({ ...selectedTpl, experts: [...selectedTpl.experts, role] });
  };

  const handleDeleteExpert = async (expertId: string) => {
    if (!selectedTpl) return;
    await updateTemplate({ ...selectedTpl, experts: selectedTpl.experts.filter(e => e.id !== expertId) });
  };

  const blankExpert: Role = {
    id: `role_expert_new_${Date.now()}`,
    name: "",
    description: "",
    type: "expert",
    systemPrompt: "",
    apiConfig: { provider: "builtin", capabilityType: "general" },
  };

  // ── 第一层：工作流列表 ──────────────────────────────────────────────────────
  if (!selectedTplId) {
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[s.pageTitle, { color: colors.foreground }]}>角色配置</Text>
          <Text style={[s.pageSubtitle, { color: colors.muted }]}>选择工作流，独立配置每个工作流的角色</Text>

          {state.templates.map(tpl => (
            <TouchableOpacity
              key={tpl.id}
              style={[s.tplCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setSelectedTplId(tpl.id)}
              activeOpacity={0.85}
            >
              <View style={s.tplCardTop}>
                <View style={{ flex: 1 }}>
                  <View style={s.tplTitleRow}>
                    <Text style={[s.tplName, { color: colors.foreground }]}>{tpl.name}</Text>
                    {tpl.isDefault && (
                      <View style={[s.defaultBadge, { backgroundColor: "#6C63FF20" }]}>
                        <Text style={[s.defaultBadgeText, { color: "#6C63FF" }]}>默认</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.tplDesc, { color: colors.muted }]}>{tpl.description}</Text>
                </View>
                <Text style={[s.chevron, { color: colors.muted }]}>›</Text>
              </View>

              <View style={s.tplFlow}>
                <View style={[s.flowPill, { backgroundColor: "#6C63FF20" }]}>
                  <Text style={[s.flowPillText, { color: "#6C63FF" }]}>{tpl.initiator.name}</Text>
                </View>
                <Text style={[s.flowArrow, { color: colors.muted }]}>→</Text>
                <View style={[s.flowPill, { backgroundColor: "#0EA5E920" }]}>
                  <Text style={[s.flowPillText, { color: "#0EA5E9" }]}>{tpl.experts.length} 位专家</Text>
                </View>
                <Text style={[s.flowArrow, { color: colors.muted }]}>→</Text>
                <View style={[s.flowPill, { backgroundColor: "#22C55E20" }]}>
                  <Text style={[s.flowPillText, { color: "#22C55E" }]}>{tpl.summarizer.name}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── 第二层：角色配置 ────────────────────────────────────────────────────────
  if (!selectedTpl) return null;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backBtn} onPress={() => setSelectedTplId(null)} activeOpacity={0.7}>
          <Text style={[s.backBtnText, { color: "#6C63FF" }]}>← 返回工作流列表</Text>
        </TouchableOpacity>

        <Text style={[s.pageTitle, { color: colors.foreground }]}>{selectedTpl.name}</Text>
        <Text style={[s.pageSubtitle, { color: colors.muted }]}>{selectedTpl.description}</Text>

        {/* 引导者 */}
        <View style={s.section}>
          <View style={[s.sectionBadge, { backgroundColor: "#6C63FF20" }]}>
            <Text style={[s.sectionBadgeText, { color: "#6C63FF" }]}>第 1 步 · 串行 · 固定 1 个</Text>
          </View>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>引导者</Text>
          <MobileRoleCard role={selectedTpl.initiator} colors={colors} onEdit={() => { setIsAddingExpert(false); setEditingRole(selectedTpl.initiator); }} />
        </View>

        {/* 并行专家 */}
        <View style={s.section}>
          <View style={[s.sectionBadge, { backgroundColor: "#0EA5E920" }]}>
            <Text style={[s.sectionBadgeText, { color: "#0EA5E9" }]}>第 2 步 · 并行 · {selectedTpl.experts.length} 位</Text>
          </View>
          <View style={s.sectionTitleRow}>
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>专家组</Text>
            <TouchableOpacity
              style={[s.addBtn, { backgroundColor: "#0EA5E915", borderColor: "#0EA5E940" }]}
              onPress={() => { setIsAddingExpert(true); setEditingRole({ ...blankExpert, id: `role_expert_${Date.now()}` }); }}
              activeOpacity={0.8}
            >
              <Text style={[s.addBtnText, { color: "#0EA5E9" }]}>+ 添加专家</Text>
            </TouchableOpacity>
          </View>
          {selectedTpl.experts.length === 0 && (
            <View style={[s.emptyBox, { borderColor: colors.border }]}>
              <Text style={[s.emptyText, { color: colors.muted }]}>暂无专家，点击"添加专家"创建</Text>
            </View>
          )}
          {selectedTpl.experts.map((expert, idx) => (
            <MobileRoleCard
              key={expert.id}
              role={expert}
              index={idx + 1}
              colors={colors}
              onEdit={() => { setIsAddingExpert(false); setEditingRole(expert); }}
              onDelete={() => handleDeleteExpert(expert.id)}
            />
          ))}
        </View>

        {/* 汇总者 */}
        <View style={s.section}>
          <View style={[s.sectionBadge, { backgroundColor: "#22C55E20" }]}>
            <Text style={[s.sectionBadgeText, { color: "#22C55E" }]}>最后 · 产出文档 · 固定 1 个</Text>
          </View>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>汇总者</Text>
          <MobileRoleCard role={selectedTpl.summarizer} colors={colors} onEdit={() => { setIsAddingExpert(false); setEditingRole(selectedTpl.summarizer); }} />
        </View>
      </ScrollView>

      {editingRole && (
        <RoleEditModal
          role={editingRole}
          onSave={isAddingExpert ? handleAddExpert : handleSaveRole}
          onClose={() => { setEditingRole(null); setIsAddingExpert(false); }}
          colors={colors}
        />
      )}
    </ScreenContainer>
  );
}

// ── 移动端角色卡片 ────────────────────────────────────────────────────────────
function MobileRoleCard({
  role, index, colors, onEdit, onDelete,
}: {
  role: Role;
  index?: number;
  colors: ReturnType<typeof useColors>;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const cfg = ROLE_TYPE_CFG[role.type];
  const capCfg = CAPABILITY_CONFIG[role.apiConfig?.capabilityType ?? "general"];
  const provCfg = API_PROVIDER_CONFIG[role.apiConfig?.provider ?? "builtin"];

  return (
    <View style={[s.roleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.roleCardTop}>
        {index !== undefined && (
          <View style={[s.indexBadge, { backgroundColor: "#0EA5E9" }]}>
            <Text style={s.indexText}>{index}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={s.roleNameRow}>
            <Text style={[s.roleName, { color: colors.foreground }]}>{role.name}</Text>
            <View style={[s.typePill, { backgroundColor: cfg.bg }]}>
              <Text style={[s.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Text style={[s.roleDesc, { color: colors.muted }]} numberOfLines={2}>{role.description}</Text>
          <View style={s.roleTags}>
            <View style={[s.roleTag, { backgroundColor: capCfg.color + "15" }]}>
              <Text style={[s.roleTagText, { color: capCfg.color }]}>{capCfg.icon} {capCfg.label}</Text>
            </View>
            <View style={[s.roleTag, { backgroundColor: provCfg.color + "15" }]}>
              <Text style={[s.roleTagText, { color: provCfg.color }]}>{provCfg.label}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={s.roleCardActions}>
        <TouchableOpacity style={[s.editBtn, { borderColor: "#6C63FF40", backgroundColor: "#6C63FF10" }]} onPress={onEdit} activeOpacity={0.8}>
          <Text style={[s.editBtnText, { color: "#6C63FF" }]}>编辑</Text>
        </TouchableOpacity>
        {onDelete && (
          <TouchableOpacity style={[s.deleteBtn, { borderColor: "#EF444440", backgroundColor: "#EF444410" }]} onPress={onDelete} activeOpacity={0.8}>
            <Text style={[s.deleteBtnText, { color: "#EF4444" }]}>删除</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── 样式 ──────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 60, gap: 16 },
  pageTitle: { fontSize: 22, fontWeight: "700" },
  pageSubtitle: { fontSize: 13, marginTop: -8 },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 14, fontWeight: "600" },

  tplCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  tplCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tplTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  tplName: { fontSize: 15, fontWeight: "700" },
  tplDesc: { fontSize: 12 },
  defaultBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 10, fontWeight: "600" },
  chevron: { fontSize: 20, lineHeight: 24 },
  tplFlow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  flowPill: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  flowPillText: { fontSize: 11, fontWeight: "500" },
  flowArrow: { fontSize: 11 },

  section: { gap: 8 },
  sectionBadge: { alignSelf: "flex-start", borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  sectionBadgeText: { fontSize: 10, fontWeight: "700" },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  addBtn: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnText: { fontSize: 12, fontWeight: "600" },
  emptyBox: { borderRadius: 8, borderWidth: 1, borderStyle: "dashed", padding: 14, alignItems: "center" },
  emptyText: { fontSize: 12 },

  roleCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  roleCardTop: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  indexBadge: { width: 24, height: 24, borderRadius: 7, alignItems: "center", justifyContent: "center", marginTop: 1 },
  indexText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  roleNameRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  roleName: { fontSize: 14, fontWeight: "600" },
  typePill: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  typePillText: { fontSize: 10, fontWeight: "600" },
  roleDesc: { fontSize: 12, marginBottom: 5 },
  roleTags: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  roleTag: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  roleTagText: { fontSize: 10, fontWeight: "500" },
  roleCardActions: { flexDirection: "row", gap: 8 },
  editBtn: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 12, fontWeight: "600" },
  deleteBtn: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  deleteBtnText: { fontSize: 12, fontWeight: "600" },
});

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, maxHeight: "90%" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  typeBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  typeBadgeText: { fontSize: 11, fontWeight: "600" },
  title: { flex: 1, fontSize: 16, fontWeight: "700" },
  closeBtn: { fontSize: 17, padding: 4 },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center" },
  tabText: { fontSize: 13, fontWeight: "600" },
  formBody: { gap: 8 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 6 },
  input: { borderRadius: 9, borderWidth: 1, padding: 11, fontSize: 13 },
  capGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  capPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 5, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 4 },
  capPillText: { fontSize: 11 },
  provRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  provPill: { borderRadius: 5, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  provPillText: { fontSize: 12 },
  footer: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderRadius: 9, borderWidth: 1, padding: 11, alignItems: "center" },
  cancelBtnText: { fontSize: 13 },
  saveBtn: { flex: 2, borderRadius: 9, padding: 11, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
