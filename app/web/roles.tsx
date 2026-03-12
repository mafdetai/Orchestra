import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  StyleSheet, Modal
} from "react-native";
import { useState } from "react";
import { WebLayout } from "@/components/web-layout";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import {
  WorkflowTemplate, Role, RoleType,
  CapabilityType, ApiProvider,
  CAPABILITY_CONFIG, API_PROVIDER_CONFIG, RoleApiConfig,
} from "@/shared/workflow-types";

// ── 类型标签配置 ──────────────────────────────────────────────────────────────
const ROLE_TYPE_CFG: Record<RoleType, { label: string; color: string; bg: string }> = {
  initiator:  { label: '指挥官', color: '#6C63FF', bg: '#6C63FF15' },
  expert:     { label: '执行专家', color: '#0EA5E9', bg: '#0EA5E915' },
  summarizer: { label: '汇总者', color: '#22C55E', bg: '#22C55E15' },
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
  const [tab, setTab] = useState<'basic' | 'api'>('basic');
  const cfg = ROLE_TYPE_CFG[draft.type];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {/* 头部 */}
          <View style={styles.modalHeader}>
            <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>编辑角色</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.closeBtn, { color: colors.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tab */}
          <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
            {(['basic', 'api'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && { borderBottomColor: '#6C63FF', borderBottomWidth: 2 }]}
                onPress={() => setTab(t)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: tab === t ? '#6C63FF' : colors.muted }]}>
                  {t === 'basic' ? '基本信息' : 'API 配置'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {tab === 'basic' ? (
              <View style={styles.formBody}>
                <Text style={[styles.label, { color: colors.foreground }]}>名称</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={draft.name}
                  onChangeText={v => setDraft(d => ({ ...d, name: v }))}
                  placeholder="角色名称"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.label, { color: colors.foreground }]}>描述</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={draft.description}
                  onChangeText={v => setDraft(d => ({ ...d, description: v }))}
                  placeholder="简述角色职责"
                  placeholderTextColor={colors.muted}
                />
                <Text style={[styles.label, { color: colors.foreground }]}>系统提示词</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, minHeight: 120 }]}
                  value={draft.systemPrompt}
                  onChangeText={v => setDraft(d => ({ ...d, systemPrompt: v }))}
                  placeholder="描述角色的分析角度和输出要求..."
                  placeholderTextColor={colors.muted}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ) : (
              <View style={styles.formBody}>
                <Text style={[styles.label, { color: colors.foreground }]}>专项能力</Text>
                <View style={styles.capGrid}>
                  {(Object.keys(CAPABILITY_CONFIG) as CapabilityType[]).map(cap => {
                    const capCfg = CAPABILITY_CONFIG[cap];
                    const isActive = (draft.apiConfig?.capabilityType ?? 'general') === cap;
                    return (
                      <TouchableOpacity
                        key={cap}
                        style={[styles.capPill, {
                          borderColor: isActive ? capCfg.color : colors.border,
                          backgroundColor: isActive ? capCfg.color + '15' : colors.surface,
                        }]}
                        onPress={() => setDraft(d => ({
                          ...d,
                          apiConfig: { ...(d.apiConfig ?? { provider: 'builtin' as ApiProvider, capabilityType: 'general' as CapabilityType }), capabilityType: cap },
                        }))}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 13 }}>{capCfg.icon}</Text>
                        <Text style={[styles.capPillText, { color: isActive ? capCfg.color : colors.muted }]}>{capCfg.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.label, { color: colors.foreground }]}>AI 服务</Text>
                <View style={styles.provRow}>
                  {(['builtin', 'openai', 'custom'] as ApiProvider[]).map(p => {
                    const provCfg = API_PROVIDER_CONFIG[p];
                    const isActive = (draft.apiConfig?.provider ?? 'builtin') === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.provPill, {
                          borderColor: isActive ? provCfg.color : colors.border,
                          backgroundColor: isActive ? provCfg.color + '15' : colors.surface,
                        }]}
                        onPress={() => setDraft(d => ({
                          ...d,
                          apiConfig: { ...(d.apiConfig ?? { provider: 'builtin' as ApiProvider, capabilityType: 'general' as CapabilityType }), provider: p, model: p === 'openai' ? 'gpt-4o' : 'default' },
                        }))}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.provPillText, { color: isActive ? provCfg.color : colors.muted }]}>{provCfg.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {draft.apiConfig?.provider === 'openai' && (
                  <>
                    <Text style={[styles.label, { color: colors.foreground }]}>模型</Text>
                    <View style={styles.provRow}>
                      {API_PROVIDER_CONFIG.openai.models.map(m => {
                        const isActive = draft.apiConfig?.model === m;
                        return (
                          <TouchableOpacity
                            key={m}
                            style={[styles.provPill, {
                              borderColor: isActive ? '#10A37F' : colors.border,
                              backgroundColor: isActive ? '#10A37F15' : colors.surface,
                            }]}
                            onPress={() => setDraft(d => ({ ...d, apiConfig: { ...(d.apiConfig as RoleApiConfig), model: m } }))}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.provPillText, { color: isActive ? '#10A37F' : colors.muted }]}>{m}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.label, { color: colors.foreground }]}>API Key</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                      value={draft.apiConfig?.apiKey ?? ''}
                      onChangeText={v => setDraft(d => ({ ...d, apiConfig: { ...(d.apiConfig as RoleApiConfig), apiKey: v } }))}
                      secureTextEntry
                      placeholder="sk-..."
                      placeholderTextColor={colors.muted}
                    />
                  </>
                )}

                {draft.apiConfig?.provider === 'custom' && (
                  <>
                    <Text style={[styles.label, { color: colors.foreground }]}>API Base URL</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                      value={draft.apiConfig?.baseUrl ?? ''}
                      onChangeText={v => setDraft(d => ({ ...d, apiConfig: { ...(d.apiConfig as RoleApiConfig), baseUrl: v } }))}
                      placeholder="https://api.example.com/v1"
                      placeholderTextColor={colors.muted}
                    />
                    <Text style={[styles.label, { color: colors.foreground }]}>API Key</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                      value={draft.apiConfig?.apiKey ?? ''}
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

          <View style={styles.modalFooter}>
            <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.cancelBtnText, { color: colors.muted }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#6C63FF' }]}
              onPress={() => { onSave(draft); onClose(); }}
              activeOpacity={0.85}
            >
              <Text style={styles.saveBtnText}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 角色卡片 ──────────────────────────────────────────────────────────────────
function RoleCard({
  role, index, colors, onEdit, onDelete,
}: {
  role: Role;
  index?: number;
  colors: ReturnType<typeof useColors>;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const cfg = ROLE_TYPE_CFG[role.type];
  const capCfg = CAPABILITY_CONFIG[role.apiConfig?.capabilityType ?? 'general'];
  const provCfg = API_PROVIDER_CONFIG[role.apiConfig?.provider ?? 'builtin'];

  return (
    <View style={[styles.roleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.roleCardLeft}>
        {index !== undefined && (
          <View style={[styles.indexBadge, { backgroundColor: '#0EA5E9' }]}>
            <Text style={styles.indexText}>{index}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.roleNameRow}>
            <Text style={[styles.roleName, { color: colors.foreground }]}>{role.name}</Text>
            <View style={[styles.typePill, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Text style={[styles.roleDesc, { color: colors.muted }]} numberOfLines={2}>{role.description}</Text>
          <View style={styles.roleTags}>
            <View style={[styles.roleTag, { backgroundColor: capCfg.color + '15' }]}>
              <Text style={[styles.roleTagText, { color: capCfg.color }]}>{capCfg.icon} {capCfg.label}</Text>
            </View>
            <View style={[styles.roleTag, { backgroundColor: provCfg.color + '15' }]}>
              <Text style={[styles.roleTagText, { color: provCfg.color }]}>{provCfg.label}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.roleCardActions}>
        <TouchableOpacity
          style={[styles.editBtn, { borderColor: '#6C63FF40', backgroundColor: '#6C63FF10' }]}
          onPress={onEdit}
          activeOpacity={0.8}
        >
          <Text style={[styles.editBtnText, { color: '#6C63FF' }]}>编辑</Text>
        </TouchableOpacity>
        {onDelete && (
          <TouchableOpacity
            style={[styles.deleteBtn, { borderColor: '#EF444440', backgroundColor: '#EF444410' }]}
            onPress={onDelete}
            activeOpacity={0.8}
          >
            <Text style={[styles.deleteBtnText, { color: '#EF4444' }]}>删除</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function WebRolesScreen() {
  const colors = useColors();
  const { state, updateTemplate } = useWorkflow();

  // 第一层：选中的工作流 ID
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null);
  // 第二层：编辑中的角色
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isAddingExpert, setIsAddingExpert] = useState(false);

  const selectedTpl = state.templates.find(t => t.id === selectedTplId) ?? null;

  const handleSaveRole = async (updated: Role) => {
    if (!selectedTpl) return;
    let newTpl: WorkflowTemplate;
    if (updated.type === 'initiator') {
      newTpl = { ...selectedTpl, initiator: updated };
    } else if (updated.type === 'summarizer') {
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
      name: newRole.name || '新专家',
    };
    await updateTemplate({ ...selectedTpl, experts: [...selectedTpl.experts, role] });
  };

  const handleDeleteExpert = async (expertId: string) => {
    if (!selectedTpl) return;
    await updateTemplate({ ...selectedTpl, experts: selectedTpl.experts.filter(e => e.id !== expertId) });
  };

  const blankExpert: Role = {
    id: `role_expert_new`,
    name: '',
    description: '',
    type: 'expert',
    systemPrompt: '',
    apiConfig: { provider: 'builtin', capabilityType: 'general' },
  };

  // ── 第一层：工作流列表 ──────────────────────────────────────────────────────
  if (!selectedTplId) {
    return (
      <WebLayout title="角色配置">
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeader}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>选择工作流</Text>
            <Text style={[styles.pageSubtitle, { color: colors.muted }]}>
              每个工作流拥有独立的角色配置，点击进入角色编辑
            </Text>
          </View>

          <View style={styles.tplList}>
            {state.templates.map(tpl => (
              <TouchableOpacity
                key={tpl.id}
                style={[styles.tplCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setSelectedTplId(tpl.id)}
                activeOpacity={0.85}
              >
                <View style={styles.tplCardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.tplCardTitleRow}>
                      <Text style={[styles.tplCardName, { color: colors.foreground }]}>{tpl.name}</Text>
                      {tpl.isDefault && (
                        <View style={[styles.defaultBadge, { backgroundColor: '#6C63FF20' }]}>
                          <Text style={[styles.defaultBadgeText, { color: '#6C63FF' }]}>默认</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.tplCardDesc, { color: colors.muted }]}>{tpl.description}</Text>
                  </View>
                  <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
                </View>

                {/* 流程预览 */}
                <View style={styles.tplFlow}>
                  <View style={[styles.flowPill, { backgroundColor: '#6C63FF20' }]}>
                    <Text style={[styles.flowPillText, { color: '#6C63FF' }]}>{tpl.initiator.name}</Text>
                  </View>
                  <Text style={[styles.flowArrow, { color: colors.muted }]}>→</Text>
                  <View style={[styles.flowPill, { backgroundColor: '#0EA5E920' }]}>
                    <Text style={[styles.flowPillText, { color: '#0EA5E9' }]}>{tpl.experts.length} 位专家并行</Text>
                  </View>
                  <Text style={[styles.flowArrow, { color: colors.muted }]}>→</Text>
                  <View style={[styles.flowPill, { backgroundColor: '#22C55E20' }]}>
                    <Text style={[styles.flowPillText, { color: '#22C55E' }]}>{tpl.summarizer.name}</Text>
                  </View>
                </View>

                {/* 专家标签 */}
                {tpl.experts.length > 0 && (
                  <View style={styles.expertTags}>
                    {tpl.experts.map(e => {
                      const capCfg = CAPABILITY_CONFIG[e.apiConfig?.capabilityType ?? 'general'];
                      return (
                        <View key={e.id} style={[styles.expertTag, { backgroundColor: capCfg.color + '15' }]}>
                          <Text style={[styles.expertTagText, { color: capCfg.color }]}>
                            {capCfg.icon} {e.name}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </WebLayout>
    );
  }

  // ── 第二层：角色配置 ────────────────────────────────────────────────────────
  if (!selectedTpl) return null;

  return (
    <WebLayout title="角色配置">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 返回 */}
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedTplId(null)} activeOpacity={0.7}>
          <Text style={[styles.backBtnText, { color: '#6C63FF' }]}>← 返回工作流列表</Text>
        </TouchableOpacity>

        {/* 工作流标题 */}
        <View style={styles.tplDetailHeader}>
          <Text style={[styles.tplDetailName, { color: colors.foreground }]}>{selectedTpl.name}</Text>
          <Text style={[styles.tplDetailDesc, { color: colors.muted }]}>{selectedTpl.description}</Text>
        </View>

        {/* 引导者 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionBadge, { backgroundColor: '#6C63FF20' }]}>
              <Text style={[styles.sectionBadgeText, { color: '#6C63FF' }]}>第 1 步 · 串行执行</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>引导者（固定 1 个）</Text>
          </View>
          <RoleCard
            role={selectedTpl.initiator}
            colors={colors}
            onEdit={() => setEditingRole(selectedTpl.initiator)}
          />
        </View>

        {/* 并行专家 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionBadge, { backgroundColor: '#0EA5E920' }]}>
              <Text style={[styles.sectionBadgeText, { color: '#0EA5E9' }]}>第 2 步 · 并行执行</Text>
            </View>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                专家组（{selectedTpl.experts.length} 位）
              </Text>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: '#0EA5E915', borderColor: '#0EA5E940' }]}
                onPress={() => { setIsAddingExpert(true); setEditingRole({ ...blankExpert, id: `role_expert_${Date.now()}` }); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.addBtnText, { color: '#0EA5E9' }]}>+ 添加专家</Text>
              </TouchableOpacity>
            </View>
          </View>

          {selectedTpl.experts.length === 0 && (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.muted }]}>暂无专家，点击"添加专家"创建</Text>
            </View>
          )}

          {selectedTpl.experts.map((expert, idx) => (
            <RoleCard
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
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionBadge, { backgroundColor: '#22C55E20' }]}>
              <Text style={[styles.sectionBadgeText, { color: '#22C55E' }]}>最后 · 产出文档</Text>
            </View>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>汇总者（固定 1 个）</Text>
          </View>
          <RoleCard
            role={selectedTpl.summarizer}
            colors={colors}
            onEdit={() => { setIsAddingExpert(false); setEditingRole(selectedTpl.summarizer); }}
          />
        </View>
      </ScrollView>

      {/* 编辑/添加弹窗 */}
      {editingRole && (
        <RoleEditModal
          role={editingRole}
          onSave={isAddingExpert ? handleAddExpert : handleSaveRole}
          onClose={() => { setEditingRole(null); setIsAddingExpert(false); }}
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
  pageTitle: { fontSize: 24, fontWeight: '700' },
  pageSubtitle: { fontSize: 14 },

  tplList: { gap: 12 },
  tplCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 12 },
  tplCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tplCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  tplCardName: { fontSize: 16, fontWeight: '700' },
  tplCardDesc: { fontSize: 13 },
  defaultBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { fontSize: 11, fontWeight: '600' },
  chevron: { fontSize: 22, lineHeight: 28 },

  tplFlow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flowPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  flowPillText: { fontSize: 12, fontWeight: '500' },
  flowArrow: { fontSize: 12 },

  expertTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  expertTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  expertTagText: { fontSize: 11, fontWeight: '500' },

  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 14, fontWeight: '600' },
  tplDetailHeader: { gap: 4, paddingBottom: 4 },
  tplDetailName: { fontSize: 22, fontWeight: '700' },
  tplDetailDesc: { fontSize: 14 },

  section: { gap: 10 },
  sectionHeader: { gap: 4 },
  sectionBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sectionBadgeText: { fontSize: 11, fontWeight: '700' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { fontSize: 13, fontWeight: '600' },

  emptyBox: { borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', padding: 16, alignItems: 'center' },
  emptyText: { fontSize: 13 },

  roleCard: { borderRadius: 12, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  roleCardLeft: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  indexBadge: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  indexText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  roleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  roleName: { fontSize: 15, fontWeight: '600' },
  typePill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typePillText: { fontSize: 11, fontWeight: '600' },
  roleDesc: { fontSize: 13, marginBottom: 6 },
  roleTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  roleTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  roleTagText: { fontSize: 11, fontWeight: '500' },
  roleCardActions: { gap: 6 },
  editBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  deleteBtnText: { fontSize: 12, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { width: '100%', maxWidth: 560, borderRadius: 20, borderWidth: 1, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 12, fontWeight: '600' },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  closeBtn: { fontSize: 18, padding: 4 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  formBody: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  input: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  capGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  capPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  capPillText: { fontSize: 12 },
  provRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  provPill: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  provPillText: { fontSize: 13 },
  modalFooter: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 10, padding: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
