import { ScrollView, Text, View, TouchableOpacity, StyleSheet, Clipboard, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useWorkflow } from "@/lib/workflow-context";
import { WorkflowRun } from "@/shared/workflow-types";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export default function WebResultScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state } = useWorkflow();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"document" | "roles">("document");

  useEffect(() => {
    if (!runId) return;
    const found = state.history.find(r => r.id === runId);
    if (found) setRun(found);
  }, [runId, state.history]);

  const toggleRole = (id: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCopy = () => {
    if (!run?.finalDocument) return;
    Clipboard.setString(run.finalDocument);
    Alert.alert("已复制", "文档内容已复制到剪贴板");
  };

  if (!run) {
    return (
      <WebLayout title="执行结果">
        <View style={styles.loading}>
          <Text style={[styles.loadingText, { color: colors.muted }]}>加载中...</Text>
        </View>
      </WebLayout>
    );
  }

  // 按工作流模板顺序排列输出
  const template = state.templates.find(t => t.id === run.templateId);
  const initiatorOutput = template ? run.roleOutputs[template.initiator.id] : null;
  const expertOutputs = template
    ? template.experts.map(e => run.roleOutputs[e.id]).filter(Boolean)
    : Object.values(run.roleOutputs).filter(o => o.roleId.includes('expert'));
  const summarizerOutput = template ? run.roleOutputs[template.summarizer.id] : null;

  // 构建 roleId -> 角色信息映射（从模板内嵌角色）
  const roleMap: Record<string, { name: string; type: string }> = {};
  if (template) {
    roleMap[template.initiator.id] = { name: template.initiator.name, type: 'initiator' };
    template.experts.forEach(e => { roleMap[e.id] = { name: e.name, type: 'expert' }; });
    roleMap[template.summarizer.id] = { name: template.summarizer.name, type: 'summarizer' };
  }
  const getRoleName = (roleId: string) => roleMap[roleId]?.name ?? roleId;
  const getRoleType = (roleId: string) => roleMap[roleId]?.type ?? 'expert';

  const completedCount = Object.values(run.roleOutputs).filter(o => o.status === "completed").length;
  const totalCount = Object.keys(run.roleOutputs).length;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const duration = run.completedAt ? Math.round((run.completedAt - run.startedAt) / 1000) : null;

  const allOutputs = [initiatorOutput, ...expertOutputs, summarizerOutput].filter(Boolean);

  return (
    <WebLayout
      title="执行结果"
      actions={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: colors.border }]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <IconSymbol name="doc.on.doc" size={16} color={colors.muted} />
            <Text style={[styles.actionBtnText, { color: colors.muted }]}>复制文档</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#6C63FF", borderColor: "#6C63FF" }]}
            onPress={() => router.push("/web/run" as any)}
            activeOpacity={0.8}
          >
            <IconSymbol name="play.fill" size={16} color="#FFFFFF" />
            <Text style={[styles.actionBtnText, { color: "#FFFFFF" }]}>新建执行</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.container}>
        {/* 左侧：文档 + 角色输出 */}
        <View style={[styles.leftPanel, { borderRightColor: colors.border }]}>
          {/* 任务信息 */}
          <View style={[styles.taskBanner, { backgroundColor: "#6C63FF12", borderColor: "#6C63FF30" }]}>
            <View style={styles.taskBannerRow}>
              <Text style={[styles.taskLabel, { color: "#6C63FF" }]}>任务描述</Text>
              <View style={styles.taskMeta}>
                {duration != null && <Text style={[styles.metaText, { color: colors.muted }]}>耗时 {duration}s</Text>}
                <Text style={[styles.metaText, { color: colors.muted }]}>{formatTime(run.startedAt)}</Text>
                {run.templateName && <Text style={[styles.metaText, { color: colors.muted }]}>{run.templateName}</Text>}
                <View style={[styles.completedBadge, { backgroundColor: colors.success + "20" }]}>
                  <Text style={[styles.completedText, { color: colors.success }]}>{completedCount}/{totalCount} 完成</Text>
                </View>
              </View>
            </View>
            <Text style={[styles.taskText, { color: colors.foreground }]}>{run.input}</Text>
          </View>

          {/* Tab 切换 */}
          <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
            {(["document", "roles"] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && { borderBottomColor: "#6C63FF" }]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, { color: activeTab === tab ? "#6C63FF" : colors.muted, fontWeight: activeTab === tab ? "600" : "400" }]}>
                  {tab === "document" ? "综合报告" : "各角色输出"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
            {activeTab === "document" ? (
              <View style={styles.docArea}>
                <View style={[styles.docHeader, { backgroundColor: "#22C55E12", borderColor: "#22C55E30" }]}>
                  <View style={[styles.docIconBadge, { backgroundColor: "#22C55E20" }]}>
                    <IconSymbol name="doc.text.fill" size={18} color="#22C55E" />
                  </View>
                  <View>
                    <Text style={[styles.docTitle, { color: colors.foreground }]}>综合报告</Text>
                    {summarizerOutput && (
                      <Text style={[styles.docSubtitle, { color: colors.muted }]}>
                        由 {getRoleName(summarizerOutput.roleId)} 汇总生成
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.docContent}>
                  <MarkdownRenderer content={run.finalDocument ?? "暂无内容"} fontSize={14} />
                </View>
              </View>
            ) : (
              <View style={styles.rolesArea}>
                {allOutputs.map((output, idx) => {
                  if (!output) return null;
                  const isExpanded = expandedRoles.has(output.roleId);
                  const roleType = getRoleType(output.roleId);
                  const color = roleType === "initiator" ? "#6C63FF" : roleType === "summarizer" ? "#22C55E" : "#0EA5E9";
                  return (
                    <TouchableOpacity
                      key={output.roleId}
                      style={[styles.roleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => toggleRole(output.roleId)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.roleRowHeader}>
                        <View style={[styles.roleRowNum, { backgroundColor: color }]}>
                          <Text style={styles.roleRowNumText}>{idx + 1}</Text>
                        </View>
                        <Text style={[styles.roleRowName, { color: colors.foreground }]}>{getRoleName(output.roleId)}</Text>
                        <View style={[styles.completedDot, { backgroundColor: output.status === "completed" ? colors.success : colors.error }]} />
                        <IconSymbol name={isExpanded ? "chevron.up" : "chevron.down"} size={16} color={colors.muted} />
                      </View>
                      {isExpanded && (
                        <View style={[styles.roleRowContent, { borderTopColor: colors.border }]}>
                          <MarkdownRenderer content={output.output} fontSize={13} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>

        {/* 右侧：统计面板 */}
        <View style={styles.rightPanel}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.rightTitle, { color: colors.foreground }]}>执行概览</Text>

            <View style={styles.statsGrid}>
              {[
                { label: "完成角色", value: `${completedCount}/${totalCount}`, color: colors.success },
                { label: "耗时", value: duration != null ? `${duration}s` : "-", color: "#6C63FF" },
                { label: "专家输出", value: `${expertOutputs.length}`, color: "#0EA5E9" },
                { label: "状态", value: run.status === "completed" ? "成功" : "失败", color: run.status === "completed" ? colors.success : colors.error },
              ].map(stat => (
                <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
                </View>
              ))}
            </View>

            {/* 角色执行列表 */}
            <Text style={[styles.rightSubTitle, { color: colors.foreground }]}>角色执行状态</Text>
            {allOutputs.map((output, idx) => {
              if (!output) return null;
              const roleType = getRoleType(output.roleId);
              const color = roleType === "initiator" ? "#6C63FF" : roleType === "summarizer" ? "#22C55E" : "#0EA5E9";
              return (
                <View key={output.roleId} style={[styles.miniRoleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.miniRoleDot, { backgroundColor: color }]} />
                  <Text style={[styles.miniRoleName, { color: colors.foreground }]} numberOfLines={1}>{getRoleName(output.roleId)}</Text>
                  <View style={[styles.miniStatusBadge, { backgroundColor: output.status === "completed" ? colors.success + "20" : colors.error + "20" }]}>
                    <Text style={[styles.miniStatusText, { color: output.status === "completed" ? colors.success : colors.error }]}>
                      {output.status === "completed" ? "✓" : "✗"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 16 },
  container: { flex: 1, flexDirection: "row" },
  leftPanel: { flex: 1, borderRightWidth: 1, overflow: "hidden" },
  rightPanel: { width: 260, padding: 20 },
  taskBanner: { borderRadius: 12, padding: 14, borderWidth: 1, margin: 16, marginBottom: 0 },
  taskBannerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 },
  taskLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  taskMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  metaText: { fontSize: 12 },
  completedBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  completedText: { fontSize: 12, fontWeight: "600" },
  taskText: { fontSize: 14, lineHeight: 20 },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, marginHorizontal: 16, marginTop: 16 },
  tab: { paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 14 },
  tabContent: { flex: 1, paddingHorizontal: 16 },
  docArea: { paddingTop: 16, paddingBottom: 40 },
  docHeader: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
  docIconBadge: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 16, fontWeight: "700" },
  docSubtitle: { fontSize: 12, marginTop: 2 },
  docContent: { paddingBottom: 8 },
  rolesArea: { paddingTop: 16, paddingBottom: 40, gap: 8 },
  roleRow: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  roleRowHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  roleRowNum: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  roleRowNumText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  roleRowName: { flex: 1, fontSize: 14, fontWeight: "500" },
  completedDot: { width: 8, height: 8, borderRadius: 4 },
  roleRowContent: { padding: 12, paddingTop: 10, borderTopWidth: 1 },
  rightTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  statCard: { borderRadius: 10, borderWidth: 1, padding: 12, width: "47%" },
  statValue: { fontSize: 20, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },
  rightSubTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  miniRoleRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, padding: 10, marginBottom: 6 },
  miniRoleDot: { width: 6, height: 6, borderRadius: 3 },
  miniRoleName: { flex: 1, fontSize: 12 },
  miniStatusBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  miniStatusText: { fontSize: 11, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtnText: { fontSize: 13, fontWeight: "500" },
});
