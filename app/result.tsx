import {
  ScrollView, Text, View, TouchableOpacity, StyleSheet, Share, Alert, Clipboard
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useWorkflow } from "@/lib/workflow-context";
import { WorkflowRun } from "@/shared/workflow-types";

export default function ResultScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state } = useWorkflow();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

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

  const handleShare = async () => {
    if (!run?.finalDocument) return;
    await Share.share({ message: run.finalDocument, title: "AI工作流文档" });
  };

  const handleCopy = () => {
    if (!run?.finalDocument) return;
    Clipboard.setString(run.finalDocument);
    Alert.alert("已复制", "文档内容已复制到剪贴板");
  };

  if (!run) {
    return (
      <ScreenContainer>
        <View style={styles.loadingState}>
          <Text style={[styles.loadingText, { color: colors.muted }]}>加载中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // 按工作流模板顺序排列输出
  const template = state.templates.find(t => t.id === run.templateId);
  const initiatorOutput = template ? run.roleOutputs[template.initiator.id] : null;
  const expertOutputs = template
    ? template.experts.map(e => run.roleOutputs[e.id]).filter(Boolean)
    : Object.values(run.roleOutputs).filter(o => o.roleId.includes('expert'));
  const summarizerOutput = template ? run.roleOutputs[template.summarizer.id] : null;

  // 构建 roleId -> name 映射（从模板内嵌角色）
  const roleNameMap: Record<string, string> = {};
  if (template) {
    roleNameMap[template.initiator.id] = template.initiator.name;
    template.experts.forEach(e => { roleNameMap[e.id] = e.name; });
    roleNameMap[template.summarizer.id] = template.summarizer.name;
  }
  const getRoleName = (roleId: string) => roleNameMap[roleId] ?? roleId;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <IconSymbol name="chevron.right" size={20} color={colors.muted} style={{ transform: [{ rotate: "180deg" }] }} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>执行结果</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleCopy} activeOpacity={0.7} style={styles.headerBtn}>
              <IconSymbol name="doc.on.doc" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} activeOpacity={0.7} style={styles.headerBtn}>
              <IconSymbol name="square.and.arrow.up" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 任务描述 */}
        <View style={[styles.taskCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
          <Text style={[styles.taskLabel, { color: colors.primary }]}>任务描述</Text>
          <Text style={[styles.taskText, { color: colors.foreground }]}>{run.input}</Text>
          {run.templateName && (
            <Text style={[styles.templateTag, { color: colors.muted }]}>工作流：{run.templateName}</Text>
          )}
        </View>

        {/* 最终文档 */}
        <View style={[styles.docCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.docHeader}>
            <View style={[styles.docIconBadge, { backgroundColor: "#22C55E20" }]}>
              <IconSymbol name="doc.text.fill" size={18} color="#22C55E" />
            </View>
            <Text style={[styles.docTitle, { color: colors.foreground }]}>综合报告</Text>
            {summarizerOutput && (
              <Text style={[styles.docSubtitle, { color: colors.muted }]}>
                由 {getRoleName(summarizerOutput.roleId)} 汇总
              </Text>
            )}
          </View>
          <Text style={[styles.docContent, { color: colors.foreground }]}>
            {run.finalDocument ?? "暂无内容"}
          </Text>
        </View>

        {/* 各角色输出 */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>各角色输出</Text>

        {/* 引导者输出 */}
        {initiatorOutput && (
          <TouchableOpacity
            style={[styles.roleOutputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => toggleRole(initiatorOutput.roleId)}
            activeOpacity={0.7}
          >
            <View style={styles.roleOutputHeader}>
              <View style={[styles.roleNumBadge, { backgroundColor: "#6C63FF" }]}>
                <Text style={styles.roleNumText}>1</Text>
              </View>
              <View style={styles.roleOutputInfo}>
                <Text style={[styles.roleOutputName, { color: colors.foreground }]}>{getRoleName(initiatorOutput.roleId)}</Text>
                <Text style={[styles.roleOutputType, { color: "#6C63FF" }]}>任务分析</Text>
              </View>
              <IconSymbol name={expandedRoles.has(initiatorOutput.roleId) ? "chevron.up" : "chevron.down"} size={16} color={colors.muted} />
            </View>
            {expandedRoles.has(initiatorOutput.roleId) && (
              <Text style={[styles.roleOutputContent, { color: colors.foreground, borderTopColor: colors.border }]}>
                {initiatorOutput.output}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* 专家输出 */}
        {expertOutputs.map((output: typeof expertOutputs[0], idx: number) => output && (
          <TouchableOpacity
            key={output.roleId}
            style={[styles.roleOutputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => toggleRole(output.roleId)}
            activeOpacity={0.7}
          >
            <View style={styles.roleOutputHeader}>
              <View style={[styles.roleNumBadge, { backgroundColor: "#0EA5E9" }]}>
                <Text style={styles.roleNumText}>{idx + 2}</Text>
              </View>
              <View style={styles.roleOutputInfo}>
                <Text style={[styles.roleOutputName, { color: colors.foreground }]}>{getRoleName(output.roleId)}</Text>
                <Text style={[styles.roleOutputType, { color: "#0EA5E9" }]}>并行分析</Text>
              </View>
              <IconSymbol name={expandedRoles.has(output.roleId) ? "chevron.up" : "chevron.down"} size={16} color={colors.muted} />
            </View>
            {expandedRoles.has(output.roleId) && (
              <Text style={[styles.roleOutputContent, { color: colors.foreground, borderTopColor: colors.border }]}>
                {output.output}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 20, paddingBottom: 40 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 18, fontWeight: "700" },
  headerActions: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 4 },
  taskCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 16 },
  taskLabel: { fontSize: 11, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  taskText: { fontSize: 14, lineHeight: 20 },
  templateTag: { fontSize: 11, marginTop: 6 },
  docCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 24 },
  docHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  docIconBadge: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  docSubtitle: { fontSize: 12 },
  docContent: { fontSize: 14, lineHeight: 22 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  roleOutputCard: { borderRadius: 12, borderWidth: 1, marginBottom: 8, overflow: "hidden" },
  roleOutputHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  roleNumBadge: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  roleNumText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  roleOutputInfo: { flex: 1 },
  roleOutputName: { fontSize: 14, fontWeight: "600" },
  roleOutputType: { fontSize: 11, marginTop: 2 },
  roleOutputContent: { padding: 14, paddingTop: 12, fontSize: 13, lineHeight: 20, borderTopWidth: 1 },
});
