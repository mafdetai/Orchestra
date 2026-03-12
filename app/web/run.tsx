import {
  ScrollView, Text, View, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { TasksTab } from "@/components/tasks-tab";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import { WorkflowRun, RoleOutput, Role } from "@/shared/workflow-types";
import { trpc } from "@/lib/trpc";

type WorkflowPhase = "idle" | "role1" | "parallel" | "summary" | "done" | "error";
type RoleState = { status: "idle" | "running" | "completed" | "error"; output: string };

// ── Sub-component ─────────────────────────────────────────────────────────────

function RoleStatusCard({ role, state, color, colors, compact }: {
  role: Role | undefined;
  state?: RoleState;
  color: string;
  colors: ReturnType<typeof useColors>;
  compact?: boolean;
}) {
  if (!role) return null;
  const status = state?.status ?? "idle";
  const statusColor = status === "completed" ? colors.success : status === "running" ? color : status === "error" ? colors.error : colors.border;

  if (compact) {
    return (
      <View style={[compactStyles.card, { backgroundColor: colors.surface, borderColor: statusColor + "60" }]}>
        <View style={[compactStyles.dot, { backgroundColor: statusColor }]} />
        <Text style={[compactStyles.name, { color: colors.foreground }]} numberOfLines={1}>{role.name}</Text>
        {status === "running" && <ActivityIndicator size="small" color={color} />}
        {status === "completed" && <Text style={{ color: colors.success, fontSize: 12 }}>✓</Text>}
        {status === "error" && <Text style={{ color: colors.error, fontSize: 12 }}>✗</Text>}
      </View>
    );
  }

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: statusColor + "60" }]}>
      <View style={[cardStyles.badge, { backgroundColor: color }]}>
        <Text style={cardStyles.badgeText}>{role.type === "initiator" ? "1" : role.type === "summarizer" ? "∑" : "E"}</Text>
      </View>
      <View style={cardStyles.info}>
        <Text style={[cardStyles.name, { color: colors.foreground }]}>{role.name}</Text>
        <Text style={[cardStyles.desc, { color: colors.muted }]} numberOfLines={1}>{role.description}</Text>
      </View>
      {status === "running" && <ActivityIndicator size="small" color={color} />}
      {status === "completed" && <Text style={{ color: colors.success }}>✓</Text>}
      {status === "error" && <Text style={{ color: colors.error }}>✗</Text>}
    </View>
  );
}

const compactStyles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, borderWidth: 1, padding: 8, flex: 1, minWidth: 120 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  name: { flex: 1, fontSize: 12 },
});

const cardStyles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  badge: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: "600" },
  desc: { fontSize: 12, marginTop: 2 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function WebRunScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, loadData, finishRun, startRun, updateRoleOutput } = useWorkflow();

  const { prefill, autoStart, systemWorkflowId, squareWorkflowId, squareId } = useLocalSearchParams<{
    prefill?: string;
    autoStart?: string;
    systemWorkflowId?: string;
    squareWorkflowId?: string; // 广场用户工作流 ID
    squareId?: string;         // 广场记录 ID，用于更新使用计数
  }>();
  const [input, setInput] = useState(prefill ?? "");
  const [email, setEmail] = useState("");
  const [showEmailInput, setShowEmailInput] = useState(false);

  const autoStartTriggered = useRef(false);

  useEffect(() => {
    if (prefill) setInput(prefill);
  }, [prefill]);

  useEffect(() => {
    if (!state.isLoaded) loadData();
  }, []);

  // 自动执行：当 autoStart=1 且数据已加载时自动触发
  useEffect(() => {
    if (
      autoStart === "1" &&
      state.isLoaded &&
      !autoStartTriggered.current &&
      prefill?.trim()
    ) {
      autoStartTriggered.current = true;
      // 延迟一帧确保组件已挂载
      setTimeout(() => {
        runWorkflowWithInput(prefill.trim());
      }, 100);
    }
  }, [state.isLoaded, autoStart]);

  const [phase, setPhase] = useState<WorkflowPhase>("idle");
  const [roleStates, setRoleStates] = useState<Record<string, RoleState>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const [completedRunId, setCompletedRunId] = useState<string | null>(null);

  const executeRoleMutation = trpc.workflow.executeRole.useMutation();
  const executeParallelMutation = trpc.workflow.executeParallelRole.useMutation();
  const executeSummaryMutation = trpc.workflow.executeSummary.useMutation();
  const executeSystemWorkflowMutation = trpc.workflow.executeSystemWorkflow.useMutation();
  const sendNotificationMutation = trpc.workflow.sendCompletionNotification.useMutation();
  const createRunMutation = trpc.runs.create.useMutation();
  const updateRunMutation = trpc.runs.update.useMutation();
  const incrementSquareUseMutation = trpc.workflow.incrementSquareUse.useMutation();

  // 广场工作流配置加载（仅当 squareWorkflowId 存在时）
  const { data: squareTemplate } = trpc.templates.getPublic.useQuery(
    { workflowId: squareWorkflowId ?? "" },
    { enabled: !!squareWorkflowId }
  );

  const updateRoleState = (id: string, update: Partial<RoleState>) => {
    setRoleStates(prev => ({ ...prev, [id]: { ...prev[id], ...update } }));
  };

  const runWorkflowWithInput = async (taskInput: string) => {
    if (!taskInput.trim() || phase !== "idle") return;

    const sysId = systemWorkflowId ?? undefined;
    const runId = `run_${Date.now()}`;
    const runStartedAt = Date.now();

    // 系统工作流：直接调用后端一次性执行接口，Prompt 完全不经过前端
    if (sysId) {
      const template = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
      const templateName = template?.name ?? "系统工作流";

      // 初始化占位符状态（显示进度动画）
      const placeholderInitiatorId = "sys_initiator";
      const placeholderSummarizerId = "sys_summarizer";
      setRoleStates({
        [placeholderInitiatorId]: { status: "idle", output: "" },
        [placeholderSummarizerId]: { status: "idle", output: "" },
      });
      setErrorMsg("");
      setCompletedRunId(null);

      startRun({
        id: runId,
        templateId: sysId,
        templateName,
        input: taskInput.trim(),
        startedAt: runStartedAt,
        roleOutputs: {},
        status: "running_role1",
      });

      createRunMutation.mutate({
        id: runId,
        templateId: sysId,
        templateName,
        task: taskInput.trim(),
        expertCount: 0, // 将在执行完成后更新
        notificationEmail: email.trim() || undefined,
      });

      try {
        setPhase("role1");
        updateRoleState(placeholderInitiatorId, { status: "running" });
        setPhase("parallel");
        // 调用后端一次性执行接口
        const result = await executeSystemWorkflowMutation.mutateAsync({
          systemWorkflowId: sysId,
          userInput: taskInput.trim(),
        });
        updateRoleState(placeholderInitiatorId, { status: "completed", output: result.role1Output });
        setPhase("summary");
        updateRoleState(placeholderSummarizerId, { status: "running" });
        updateRoleState(placeholderSummarizerId, { status: "completed", output: result.summaryOutput });

        setPhase("done");
        setCompletedRunId(runId);
        await finishRun(result.summaryOutput, "completed");

        updateRunMutation.mutate({
          id: runId,
          initiatorOutput: result.role1Output,
          expertOutputs: JSON.stringify(result.expertOutputs),
          completedExperts: result.expertCount,
          summaryOutput: result.summaryOutput,
          status: "completed",
        });

        const userEmail = email.trim();
        if (userEmail) {
          sendNotificationMutation.mutate({
            email: userEmail,
            taskInput: taskInput.trim(),
            templateName,
            summary: result.summaryOutput,
            resendApiKey: "re_demo",
          });
        }

        setTimeout(() => {
          router.push({ pathname: "/web/complete" as any, params: { runId } });
        }, 1500);
      } catch (err) {
        setPhase("error");
        setErrorMsg(String(err));
      }
      return;
    }

    // 广场工作流：使用加载的广场模板配置执行
    if (squareWorkflowId && squareTemplate) {
      const sqConfig = JSON.parse(squareTemplate.config) as import("@/shared/workflow-types").WorkflowTemplate;
      const sqInitiator = sqConfig.initiator;
      const sqExperts = sqConfig.experts ?? [];
      const sqSummarizer = sqConfig.summarizer;
      if (!sqInitiator || !sqSummarizer) {
        setPhase("error");
        setErrorMsg("广场工作流配置加载失败");
        return;
      }

      const allOutputs: Record<string, import("@/shared/workflow-types").RoleOutput> = {};
      const initStates: Record<string, RoleState> = {};
      [sqInitiator, ...sqExperts, sqSummarizer].forEach(r => { initStates[r.id] = { status: "idle", output: "" }; });
      setRoleStates(initStates);
      setErrorMsg("");
      setCompletedRunId(null);

      startRun({
        id: runId,
        templateId: squareTemplate.id,
        templateName: squareTemplate.name ?? "广场工作流",
        input: taskInput.trim(),
        startedAt: runStartedAt,
        roleOutputs: {},
        status: "running_role1",
      });

      createRunMutation.mutate({
        id: runId,
        templateId: squareTemplate.id,
        templateName: squareTemplate.name ?? "广场工作流",
        task: taskInput.trim(),
        expertCount: sqExperts.length,
        notificationEmail: email.trim() || undefined,
      });

      try {
        setPhase("role1");
        updateRoleState(sqInitiator.id, { status: "running" });
        const role1Result = await executeRoleMutation.mutateAsync({ role: sqInitiator, userInput: taskInput.trim() });
        const role1Output = String(role1Result.output);
        updateRoleState(sqInitiator.id, { status: "completed", output: role1Output });
        allOutputs[sqInitiator.id] = { roleId: sqInitiator.id, output: role1Output, status: "completed" };
        updateRunMutation.mutate({ id: runId, initiatorOutput: role1Output });

        setPhase("parallel");
        sqExperts.forEach(r => updateRoleState(r.id, { status: "running" }));
        await Promise.allSettled(
          sqExperts.map(role =>
            executeParallelMutation.mutateAsync({ role, userInput: taskInput.trim(), role1Output })
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

        const expertOutputs = sqExperts
          .filter(r => allOutputs[r.id]?.status === "completed")
          .map(r => ({ roleId: r.id, roleName: r.name, output: allOutputs[r.id].output }));
        updateRunMutation.mutate({ id: runId, expertOutputs: JSON.stringify(expertOutputs), completedExperts: expertOutputs.length });

        setPhase("summary");
        updateRoleState(sqSummarizer.id, { status: "running" });
        const summaryResult = await executeSummaryMutation.mutateAsync({
          summarizerRole: sqSummarizer,
          userInput: taskInput.trim(),
          role1Output,
          expertOutputs,
        });
        const summaryOutput = String(summaryResult.output);
        updateRoleState(sqSummarizer.id, { status: "completed", output: summaryOutput });

        setPhase("done");
        setCompletedRunId(runId);
        await finishRun(summaryOutput, "completed");
        updateRunMutation.mutate({ id: runId, summaryOutput, status: "completed" });

        // 更新广场使用计数
        if (squareId) {
          incrementSquareUseMutation.mutate({ squareId });
        }

        setTimeout(() => {
          router.push({ pathname: "/web/complete" as any, params: { runId } });
        }, 1500);
      } catch (err) {
        setPhase("error");
        setErrorMsg(String(err));
      }
      return;
    }

    // 用户自定义工作流：使用现有逐步执行逻辑
    const template = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
    if (!template) return;

    const initiator = template.initiator;
    const experts = template.experts;
    const summarizer = template.summarizer;
    if (!initiator || !summarizer) return;

    const allOutputs: Record<string, RoleOutput> = {};

    // Reset
    const initStates: Record<string, RoleState> = {};
    [initiator, ...experts, summarizer].forEach(r => { initStates[r.id] = { status: "idle", output: "" }; });
    setRoleStates(initStates);
    setErrorMsg("");
    setCompletedRunId(null);

    // Start run in context
    startRun({
      id: runId,
      templateId: template.id,
      templateName: template.name,
      input: taskInput.trim(),
      startedAt: runStartedAt,
      roleOutputs: {},
      status: "running_role1",
    });

    // 持久化到数据库（异步，不阻塞执行）
    createRunMutation.mutate({
      id: runId,
      templateId: template.id,
      templateName: template.name,
      task: taskInput.trim(),
      expertCount: experts.length,
      notificationEmail: email.trim() || undefined,
    });

    try {
      // Phase 1: initiator
      setPhase("role1");
      updateRoleState(initiator.id, { status: "running" });
      const role1Result = await executeRoleMutation.mutateAsync({ role: initiator, userInput: taskInput.trim() });
      const role1Output = String(role1Result.output);
      updateRoleState(initiator.id, { status: "completed", output: role1Output });
      allOutputs[initiator.id] = { roleId: initiator.id, output: role1Output, status: "completed" };

      // 更新引导者输出到数据库
      updateRunMutation.mutate({ id: runId, initiatorOutput: role1Output });

      // Phase 2: parallel experts
      setPhase("parallel");
      experts.forEach(r => updateRoleState(r.id, { status: "running" }));

      await Promise.allSettled(
        experts.map(role =>
          executeParallelMutation.mutateAsync({ role, userInput: taskInput.trim(), role1Output })
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

      const expertOutputs = experts
        .filter(r => allOutputs[r.id]?.status === "completed")
        .map(r => ({ roleId: r.id, roleName: r.name, output: allOutputs[r.id].output }));

      // 更新专家输出到数据库
      updateRunMutation.mutate({
        id: runId,
        expertOutputs: JSON.stringify(expertOutputs),
        completedExperts: expertOutputs.length,
      });

      // Phase 3: summarizer
      setPhase("summary");
      updateRoleState(summarizer.id, { status: "running" });
      const summaryResult = await executeSummaryMutation.mutateAsync({
        summarizerRole: summarizer,
        userInput: taskInput.trim(),
        role1Output,
        expertOutputs,
      });
      const summaryOutput = String(summaryResult.output);
      updateRoleState(summarizer.id, { status: "completed", output: summaryOutput });
      allOutputs[summarizer.id] = { roleId: summarizer.id, output: summaryOutput, status: "completed" };

      setPhase("done");
      setCompletedRunId(runId);
      await finishRun(summaryOutput, "completed");

      // 更新最终报告到数据库
      updateRunMutation.mutate({
        id: runId,
        summaryOutput,
        status: "completed",
      });

      // 发送邮件通知（如果用户填写了邮筱）
      const userEmail = email.trim();
      if (userEmail) {
        sendNotificationMutation.mutate({
          email: userEmail,
          taskInput: taskInput.trim(),
          templateName: template.name,
          summary: summaryOutput,
          resendApiKey: "re_demo",
        });
      }

      // 自动跳转到任务完成页
      setTimeout(() => {
        router.push({ pathname: "/web/complete" as any, params: { runId } });
      }, 1500);

    } catch (err) {
      setPhase("error");
      setErrorMsg(String(err));
    }
  };

  const runWorkflow = () => runWorkflowWithInput(input);

  const reset = () => {
    setPhase("idle");
    setRoleStates({});
    setErrorMsg("");
    setCompletedRunId(null);
    autoStartTriggered.current = false;
  };

  const template = state.templates.find(t => t.id === state.selectedTemplateId) ?? state.templates[0];
  const initiator = template?.initiator;
  const experts = template?.experts ?? [];
  const summarizer = template?.summarizer;

  // 广场工作流配置解析
  const sqConfig = squareTemplate ? (() => {
    try { return JSON.parse(squareTemplate.config) as import("@/shared/workflow-types").WorkflowTemplate; } catch { return null; }
  })() : null;

  // 系统工作流占位符角色
  const isSysWorkflow = !!systemWorkflowId;
  const isSqWorkflow = !!squareWorkflowId;
  const sysInitiatorRole = isSysWorkflow ? { id: "sys_initiator", name: "指挥官", description: "系统工作流指挥官", type: "initiator" as const, systemPrompt: "" } : undefined;
  const sysSummarizerRole = isSysWorkflow ? { id: "sys_summarizer", name: "汇总者", description: "系统工作流汇总者", type: "summarizer" as const, systemPrompt: "" } : undefined;

  const displayInitiator = isSysWorkflow ? sysInitiatorRole : (isSqWorkflow ? sqConfig?.initiator : initiator);
  const displaySummarizer = isSysWorkflow ? sysSummarizerRole : (isSqWorkflow ? sqConfig?.summarizer : summarizer);
  const displayExperts = isSysWorkflow ? [] : (isSqWorkflow ? (sqConfig?.experts ?? []) : experts);

  const phaseLabels: Record<WorkflowPhase, string> = {
    idle: "等待输入",
    role1: "指挥官分析中...",
    parallel: isSysWorkflow ? "内置执行专家并行执行中..." : `${experts.length} 位执行专家并行执行中...`,
    summary: "汇总者整合中...",
    done: "执行完成！正在跳转...",
    error: "执行出错",
  };

  const phaseColor = phase === "done" ? colors.success : phase === "error" ? colors.error : "#6C63FF";
  const isRunning = phase === "role1" || phase === "parallel" || phase === "summary";

  const [activeTab, setActiveTab] = useState<'run' | 'tasks'>('run');

  return (
    <WebLayout title="执行">
      {/* Tab 切换栏 */}
      <View style={runTabStyles.tabBar}>
        <TouchableOpacity
          style={[runTabStyles.tabBtn, activeTab === 'run' && { borderBottomColor: '#6C63FF', borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('run')}
          activeOpacity={0.8}
        >
          <Text style={[runTabStyles.tabText, { color: activeTab === 'run' ? '#6C63FF' : colors.muted }]}>执行</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[runTabStyles.tabBtn, activeTab === 'tasks' && { borderBottomColor: '#6C63FF', borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('tasks')}
          activeOpacity={0.8}
        >
          <Text style={[runTabStyles.tabText, { color: activeTab === 'tasks' ? '#6C63FF' : colors.muted }]}>任务状态</Text>
        </TouchableOpacity>
      </View>
      {activeTab === 'tasks' ? (
        <TasksTab />
      ) : (
      <View style={styles.container}>
        {/* 左侧：输入区 */}
        <View style={[styles.leftPanel, { borderRightColor: colors.border }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.panelTitle, { color: colors.foreground }]}>描述你的任务</Text>
            {template && (
              <View style={[styles.templateBadge, { backgroundColor: "#6C63FF15", borderColor: "#6C63FF40" }]}>
                <Text style={[styles.templateName, { color: "#6C63FF" }]}>⚡ {template.name}</Text>
                <Text style={[styles.templateDesc, { color: colors.muted }]}>
                  1 指挥官 → {experts.length} 执行专家并行 → 1 汇总者
                </Text>
              </View>
            )}
            <TextInput
              style={[styles.taskInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={input}
              onChangeText={setInput}
              placeholder={"例如：\n\n分析人工智能对未来教育的影响，从技术、教学方法、学生体验等多个维度深入探讨..."}
              placeholderTextColor={colors.muted}
              multiline
              textAlignVertical="top"
              editable={phase === "idle"}
            />

            {/* 邮件通知输入 */}
            <TouchableOpacity
              style={[styles.emailToggle, { borderColor: colors.border, backgroundColor: showEmailInput ? "#F59E0B10" : colors.surface }]}
              onPress={() => setShowEmailInput(!showEmailInput)}
              activeOpacity={0.8}
            >
              <IconSymbol name="envelope.fill" size={14} color={showEmailInput ? "#F59E0B" : colors.muted} />
              <Text style={[styles.emailToggleText, { color: showEmailInput ? "#F59E0B" : colors.muted }]}>
                {email.trim() ? `通知邮箱：${email}` : "任务完成后发送邮件通知（可选）"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{showEmailInput ? "▲" : "▼"}</Text>
            </TouchableOpacity>

            {showEmailInput && (
              <TextInput
                style={[styles.emailInput, { backgroundColor: colors.surface, borderColor: "#F59E0B60", color: colors.foreground }]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={phase === "idle"}
              />
            )}

            {phase === "idle" && (
              <TouchableOpacity
                style={[styles.runBtn, { backgroundColor: input.trim() ? "#6C63FF" : colors.border }]}
                onPress={runWorkflow}
                disabled={!input.trim()}
                activeOpacity={0.85}
              >
                <IconSymbol name="play.fill" size={18} color="#FFFFFF" />
                <Text style={styles.runBtnText}>开始执行</Text>
              </TouchableOpacity>
            )}

            {isRunning && (
              <View style={[styles.runningBanner, { backgroundColor: "#6C63FF12", borderColor: "#6C63FF30" }]}>
                <ActivityIndicator size="small" color="#6C63FF" />
                <Text style={[styles.runningText, { color: "#6C63FF" }]}>工作流执行中，请勿关闭页面...</Text>
              </View>
            )}

            {phase === "done" && (
              <View style={[styles.doneBanner, { backgroundColor: "#22C55E12", borderColor: "#22C55E30" }]}>
                <Text style={{ color: "#22C55E", fontSize: 18 }}>✓</Text>
                <Text style={[styles.doneText, { color: "#22C55E" }]}>执行完成！正在跳转到报告页...</Text>
              </View>
            )}

            {phase === "error" && (
              <View style={styles.doneActions}>
                {completedRunId && (
                  <TouchableOpacity
                    style={[styles.viewResultBtn, { backgroundColor: "#6C63FF" }]}
                    onPress={() => router.push({ pathname: "/web/complete" as any, params: { runId: completedRunId } })}
                    activeOpacity={0.85}
                  >
                    <IconSymbol name="doc.text.fill" size={16} color="#FFFFFF" />
                    <Text style={styles.runBtnText}>查看完整报告</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.resetBtn, { borderColor: colors.border }]}
                  onPress={reset}
                  activeOpacity={0.7}
                >
                  <IconSymbol name="arrow.clockwise" size={16} color={colors.muted} />
                  <Text style={[styles.resetBtnText, { color: colors.muted }]}>重新执行</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.infoTitle, { color: colors.foreground }]}>工作流说明</Text>
              <Text style={[styles.infoText, { color: colors.muted }]}>
                1. <Text style={{ fontWeight: "600", color: colors.foreground }}>{initiator?.name ?? "指挥官"}</Text> 首先分析你的任务{"\n"}
                2. <Text style={{ fontWeight: "600", color: colors.foreground }}>{experts.length} 位执行专家</Text> 同时并行处理各自专项{"\n"}
                3. <Text style={{ fontWeight: "600", color: colors.foreground }}>{summarizer?.name ?? "汇总者"}</Text> 整合所有输出产出文档{"\n"}
                4. 完成后自动跳转到任务完成页，可下载 PDF 报告
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* 右侧：实时状态 */}
        <View style={styles.rightPanel}>
          <View style={[styles.statusHeader, { backgroundColor: phaseColor + "15", borderBottomColor: colors.border }]}>
            <View style={[styles.statusDot, { backgroundColor: phaseColor }]} />
            <Text style={[styles.statusLabel, { color: phaseColor }]}>{phaseLabels[phase]}</Text>
            {isRunning && (
              <ActivityIndicator size="small" color={phaseColor} style={{ marginLeft: 8 }} />
            )}
          </View>

          <ScrollView style={styles.stateScroll} showsVerticalScrollIndicator={false}>
            <RoleStatusCard role={displayInitiator} state={roleStates[displayInitiator?.id ?? ""]} color="#6C63FF" colors={colors} />

            <View style={styles.divider}>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.divText, { color: colors.muted }]}>
                {isSysWorkflow ? "内置执行专家组（内容受保护）" : `并行执行专家组（${experts.length}位）`}
              </Text>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            </View>

            {isSysWorkflow ? (
              <View style={[{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" }]}>
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
                  内置执行专家 Prompt 已加密保护，并行执行中...
                </Text>
                {(phase === "parallel" || phase === "summary" || phase === "done") && (
                  <ActivityIndicator size="small" color="#0EA5E9" style={{ marginTop: 8 }} />
                )}
              </View>
            ) : (
              <View style={styles.expertGrid}>
                {displayExperts.map(role => (
                  <RoleStatusCard key={role.id} role={role} state={roleStates[role.id]} color="#0EA5E9" colors={colors} compact />
                ))}
              </View>
            )}

            <View style={styles.divider}>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.divText, { color: colors.muted }]}>汇总</Text>
              <View style={[styles.divLine, { backgroundColor: colors.border }]} />
            </View>

            <RoleStatusCard role={displaySummarizer} state={roleStates[displaySummarizer?.id ?? ""]} color="#22C55E" colors={colors} />

            {phase === "error" && errorMsg && (
              <View style={[styles.errorBox, { backgroundColor: colors.error + "15", borderColor: colors.error + "40" }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{errorMsg}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
      )}
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row" },
  leftPanel: { width: 380, borderRightWidth: 1, padding: 24 },
  rightPanel: { flex: 1, overflow: "hidden" },
  panelTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  templateBadge: { borderRadius: 10, padding: 10, borderWidth: 1, marginBottom: 12 },
  templateName: { fontSize: 13, fontWeight: "600" },
  templateDesc: { fontSize: 12, marginTop: 2 },
  taskInput: { borderRadius: 12, borderWidth: 1, padding: 16, fontSize: 14, minHeight: 180, marginBottom: 12 },
  emailToggle: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 8 },
  emailToggleText: { flex: 1, fontSize: 13 },
  emailInput: { borderRadius: 10, borderWidth: 1.5, padding: 12, fontSize: 14, marginBottom: 12 },
  runBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14, marginBottom: 12 },
  runBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  runningBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12 },
  runningText: { fontSize: 13, fontWeight: "500" },
  doneBanner: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 12 },
  doneText: { fontSize: 13, fontWeight: "600" },
  doneActions: { gap: 8, marginBottom: 12 },
  viewResultBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 14 },
  resetBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  resetBtnText: { fontSize: 14 },
  infoBox: { borderRadius: 12, borderWidth: 1, padding: 16 },
  infoTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  infoText: { fontSize: 13, lineHeight: 22 },
  statusHeader: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusLabel: { fontSize: 14, fontWeight: "600", flex: 1 },
  stateScroll: { flex: 1, padding: 16 },
  divider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 },
  divLine: { flex: 1, height: 1 },
  divText: { fontSize: 12 },
  expertGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  errorBox: { borderRadius: 10, borderWidth: 1, padding: 12, marginTop: 8 },
  errorText: { fontSize: 13, lineHeight: 20 },
});

const runTabStyles = StyleSheet.create({
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tabBtn: { paddingHorizontal: 24, paddingVertical: 12 },
  tabText: { fontSize: 14, fontWeight: '600' },
});
