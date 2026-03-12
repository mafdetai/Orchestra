import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert
} from "react-native";
import { useState, useCallback } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { RoleOutput, RoleStatus, WorkflowRun } from "@/shared/workflow-types";

type LocalRoleState = { status: RoleStatus; output: string };

export default function RunScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, loadData } = useWorkflow();

  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [roleStates, setRoleStates] = useState<Record<string, LocalRoleState>>({});
  const [workflowPhase, setWorkflowPhase] = useState<"idle" | "role1" | "parallel" | "summary" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const executeRoleMutation = trpc.workflow.executeRole.useMutation();
  const executeParallelMutation = trpc.workflow.executeParallelRole.useMutation();
  const executeSummaryMutation = trpc.workflow.executeSummary.useMutation();

  const updateRoleState = (id: string, patch: Partial<LocalRoleState>) => {
    setRoleStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const runWorkflow = useCallback(async () => {
    if (!input.trim()) { Alert.alert("提示", "请输入任务描述"); return; }
    if (!state.isLoaded) await loadData();

    // 获取当前选中的工作流模板
    const template = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
    if (!template) { Alert.alert("错误", "未找到工作流模板，请先配置工作流"); return; }

    const initiator = template.initiator;
    const experts = template.experts;
    const summarizer = template.summarizer;

    if (!initiator || !summarizer) { Alert.alert("错误", "工作流角色配置不完整"); return; }

    setIsRunning(true);
    setWorkflowPhase("role1");
    setRoleStates({});
    setErrorMsg("");

    const runId = `run_${Date.now()}`;
    const runStartedAt = Date.now();
    const allOutputs: Record<string, RoleOutput> = {};

    try {
      // 阶段1：引导者执行
      updateRoleState(initiator.id, { status: "running", output: "" });
      const role1Result = await executeRoleMutation.mutateAsync({ role: initiator, userInput: input.trim() });
      const role1Output = String(role1Result.output);
      updateRoleState(initiator.id, { status: "completed", output: role1Output });
      allOutputs[initiator.id] = { roleId: initiator.id, output: role1Output, status: "completed" };

      // 阶段2：专家并行执行
      setWorkflowPhase("parallel");
      experts.forEach(r => updateRoleState(r.id, { status: "running", output: "" }));

      await Promise.allSettled(
        experts.map(role =>
          executeParallelMutation.mutateAsync({ role, userInput: input.trim(), role1Output })
            .then(res => {
              const out = String(res.output);
              updateRoleState(role.id, { status: "completed", output: out });
              allOutputs[role.id] = { roleId: role.id, output: out, status: "completed" };
            })
            .catch(err => {
              updateRoleState(role.id, { status: "error", output: "" });
              allOutputs[role.id] = { roleId: role.id, output: "", status: "error", error: String(err) };
            })
        )
      );

      // 阶段3：汇总者执行
      setWorkflowPhase("summary");
      updateRoleState(summarizer.id, { status: "running", output: "" });

      const expertOutputs = experts
        .filter(r => allOutputs[r.id]?.status === "completed")
        .map(r => ({ roleId: r.id, roleName: r.name, output: allOutputs[r.id].output }));

      const summaryResult = await executeSummaryMutation.mutateAsync({
        summarizerRole: summarizer,
        userInput: input.trim(),
        role1Output,
        expertOutputs,
      });
      const summaryOutput = String(summaryResult.output);
      updateRoleState(summarizer.id, { status: "completed", output: summaryOutput });
      allOutputs[summarizer.id] = { roleId: summarizer.id, output: summaryOutput, status: "completed" };

      setWorkflowPhase("done");

      const completedRun: WorkflowRun = {
        id: runId,
        templateId: template.id,
        templateName: template.name,
        input: input.trim(),
        startedAt: runStartedAt,
        completedAt: Date.now(),
        roleOutputs: allOutputs,
        finalDocument: summaryOutput,
        status: "completed",
      };
      // 通过 context 保存历史
      await loadData();
      router.push({ pathname: "/result" as any, params: { runId } });

    } catch (err) {
      setWorkflowPhase("error");
      setErrorMsg(String(err));
    } finally {
      setIsRunning(false);
    }
  }, [input, state]);

  const getStatusColor = (status?: RoleStatus) => {
    if (status === "completed") return colors.success;
    if (status === "running") return colors.primary;
    if (status === "error") return colors.error;
    return colors.border;
  };

  const template = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
  const initiator = template?.initiator ?? null;
  const experts = template?.experts ?? [];
  const summarizer = template?.summarizer ?? null;

  const phaseLabels: Record<string, string> = {
    idle: "",
    role1: `${initiator?.name ?? "引导者"} 正在分析任务...`,
    parallel: `${experts.length} 位专家并行执行中...`,
    summary: `${summarizer?.name ?? "汇总者"} 正在整合文档...`,
    done: "工作流执行完成！",
    error: "执行遇到错误",
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
            <IconSymbol name="chevron.right" size={20} color={colors.muted} style={{ transform: [{ rotate: "180deg" }] }} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>执行工作流</Text>
          <View style={{ width: 20 }} />
        </View>

        {/* 当前工作流信息 */}
        {template && (
          <View style={[styles.templateBadge, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
            <Text style={[styles.templateName, { color: colors.primary }]}>⚡ {template.name}</Text>
            <Text style={[styles.templateDesc, { color: colors.muted }]}>
              1 引导者 → {experts.length} 专家并行 → 1 汇总者
            </Text>
          </View>
        )}

        {/* 输入区 */}
        <View style={[styles.inputCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.foreground }]}>任务描述</Text>
          <TextInput
            style={[styles.textArea, { color: colors.foreground, borderColor: colors.border }]}
            value={input}
            onChangeText={setInput}
            placeholder="描述你想要完成的任务..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!isRunning}
          />
        </View>

        {/* 执行状态 */}
        {workflowPhase !== "idle" && (
          <View style={[styles.statusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.phaseRow}>
              {isRunning && <ActivityIndicator size="small" color={colors.primary} />}
              <Text style={[styles.phaseLabel, { color: workflowPhase === "error" ? colors.error : colors.primary }]}>
                {phaseLabels[workflowPhase]}
              </Text>
            </View>

            {/* 引导者 */}
            {initiator && (
              <View style={styles.roleRow}>
                <View style={[styles.roleBadge, { backgroundColor: getStatusColor(roleStates[initiator.id]?.status) }]}>
                  <Text style={styles.roleBadgeText}>1</Text>
                </View>
                <Text style={[styles.roleName, { color: colors.foreground }]}>{initiator.name}</Text>
                {roleStates[initiator.id]?.status === "running" && <ActivityIndicator size="small" color={colors.primary} />}
                {roleStates[initiator.id]?.status === "completed" && <Text style={{ color: colors.success }}>✓</Text>}
                {roleStates[initiator.id]?.status === "error" && <Text style={{ color: colors.error }}>✗</Text>}
              </View>
            )}

            {/* 并行专家 */}
            <View style={styles.parallelSection}>
              <Text style={[styles.parallelLabel, { color: colors.muted }]}>并行专家</Text>
              <View style={styles.parallelGrid}>
                {experts.map((role, idx) => {
                  if (!role) return null;
                  const status = roleStates[role.id]?.status;
                  return (
                    <View key={role.id} style={[styles.parallelItem, { borderColor: getStatusColor(status) + "60", backgroundColor: getStatusColor(status) + "10" }]}>
                      <View style={[styles.parallelDot, { backgroundColor: getStatusColor(status) }]} />
                      <Text style={[styles.parallelItemText, { color: colors.foreground }]} numberOfLines={1}>{role.name}</Text>
                      {status === "running" && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 2 }} />}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* 汇总者 */}
            {summarizer && (
              <View style={styles.roleRow}>
                <View style={[styles.roleBadge, { backgroundColor: colors.success, opacity: roleStates[summarizer.id]?.status ? 1 : 0.3 }]}>
                  <Text style={styles.roleBadgeText}>∑</Text>
                </View>
                <Text style={[styles.roleName, { color: colors.foreground }]}>{summarizer.name}</Text>
                {roleStates[summarizer.id]?.status === "running" && <ActivityIndicator size="small" color={colors.primary} />}
                {roleStates[summarizer.id]?.status === "completed" && <Text style={{ color: colors.success }}>✓</Text>}
              </View>
            )}

            {errorMsg ? <Text style={[styles.errorMsg, { color: colors.error }]}>{errorMsg}</Text> : null}
          </View>
        )}

        {/* 执行按钮 */}
        <TouchableOpacity
          style={[styles.runButton, { backgroundColor: isRunning ? colors.muted : colors.primary }]}
          onPress={runWorkflow}
          disabled={isRunning}
          activeOpacity={0.8}
        >
          {isRunning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.runButtonText}>▶ 开始执行</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "700" },
  templateBadge: { borderRadius: 12, padding: 12, borderWidth: 1 },
  templateName: { fontSize: 14, fontWeight: "600" },
  templateDesc: { fontSize: 12, marginTop: 2 },
  inputCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  inputLabel: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  textArea: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 100 },
  statusCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 12 },
  phaseRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseLabel: { fontSize: 14, fontWeight: "600" },
  roleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  roleBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  roleBadgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  roleName: { flex: 1, fontSize: 14 },
  parallelSection: { gap: 8 },
  parallelLabel: { fontSize: 12 },
  parallelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  parallelItem: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  parallelDot: { width: 6, height: 6, borderRadius: 3 },
  parallelItemText: { fontSize: 12, maxWidth: 80 },
  errorMsg: { fontSize: 13, marginTop: 4 },
  runButton: { borderRadius: 14, padding: 16, alignItems: "center", justifyContent: "center" },
  runButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
