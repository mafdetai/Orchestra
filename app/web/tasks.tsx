import { ScrollView, Text, View, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { WebLayout } from "@/components/web-layout";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import { WorkflowRun, WorkflowStatus } from "@/shared/workflow-types";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(start: number, end?: number) {
  const ms = (end ?? Date.now()) - start;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function getStatusDisplay(status: WorkflowStatus, run: WorkflowRun): {
  label: string;
  color: string;
  bg: string;
  isRunning: boolean;
  isDone: boolean;
} {
  // 执行完毕的判断：status === "completed" 且有 finalDocument（汇总已反馈）
  const isDone = status === "completed" && !!run.finalDocument;
  const isRunning = !isDone && status !== "error" && status !== "idle";

  if (isDone) return { label: "执行完毕", color: "#22C55E", bg: "#22C55E18", isRunning: false, isDone: true };
  if (status === "error") return { label: "执行出错", color: "#EF4444", bg: "#EF444418", isRunning: false, isDone: false };
  if (isRunning) return { label: "进行中", color: "#6C63FF", bg: "#6C63FF18", isRunning: true, isDone: false };
  return { label: "等待中", color: "#F59E0B", bg: "#F59E0B18", isRunning: false, isDone: false };
}

function getPhaseLabel(status: WorkflowStatus): string {
  switch (status) {
    case "running_role1": return "引导者分析中...";
    case "running_parallel": return "专家并行执行中...";
    case "running_summary": return "汇总者整合中...";
    case "completed": return "已生成综合报告";
    case "error": return "执行出错";
    default: return "等待开始";
  }
}

function TaskRow({ run, onPress, colors }: { run: WorkflowRun; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  const statusDisplay = getStatusDisplay(run.status, run);
  const expertCount = Object.values(run.roleOutputs).filter(o => o.status === "completed").length;
  const totalRoles = Object.keys(run.roleOutputs).length;

  return (
    <TouchableOpacity
      style={[styles.taskRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* 左侧状态指示条 */}
      <View style={[styles.statusBar, { backgroundColor: statusDisplay.color }]} />

      <View style={styles.taskContent}>
        {/* 顶部：任务描述 + 状态徽章 */}
        <View style={styles.taskHeader}>
          <Text style={[styles.taskInput, { color: colors.foreground }]} numberOfLines={2}>
            {run.input}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusDisplay.bg }]}>
            {statusDisplay.isRunning && (
              <ActivityIndicator size="small" color={statusDisplay.color} style={{ marginRight: 4 }} />
            )}
            {statusDisplay.isDone && (
              <Text style={{ color: statusDisplay.color, fontSize: 12, marginRight: 4 }}>✓</Text>
            )}
            {run.status === "error" && (
              <Text style={{ color: statusDisplay.color, fontSize: 12, marginRight: 4 }}>✗</Text>
            )}
            <Text style={[styles.statusText, { color: statusDisplay.color }]}>{statusDisplay.label}</Text>
          </View>
        </View>

        {/* 中部：工作流信息 */}
        <View style={styles.taskMeta}>
          <View style={[styles.metaTag, { backgroundColor: "#6C63FF15" }]}>
            <Text style={[styles.metaTagText, { color: "#6C63FF" }]}>⚡ {run.templateName}</Text>
          </View>
          <Text style={[styles.metaText, { color: colors.muted }]}>
            {formatTime(run.startedAt)}
          </Text>
          {run.completedAt && (
            <Text style={[styles.metaText, { color: colors.muted }]}>
              · 耗时 {formatDuration(run.startedAt, run.completedAt)}
            </Text>
          )}
          {!run.completedAt && statusDisplay.isRunning && (
            <Text style={[styles.metaText, { color: colors.muted }]}>
              · 已运行 {formatDuration(run.startedAt)}
            </Text>
          )}
        </View>

        {/* 底部：执行阶段 + 进度 */}
        <View style={styles.taskProgress}>
          <Text style={[styles.phaseText, { color: statusDisplay.isRunning ? statusDisplay.color : colors.muted }]}>
            {getPhaseLabel(run.status)}
          </Text>
          {totalRoles > 0 && (
            <Text style={[styles.progressText, { color: colors.muted }]}>
              {expertCount}/{totalRoles} 角色完成
            </Text>
          )}
        </View>

        {/* 角色执行进度条（仅进行中时显示） */}
        {statusDisplay.isRunning && totalRoles > 0 && (
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: statusDisplay.color, width: `${(expertCount / totalRoles) * 100}%` as any }
              ]}
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function WebTasksScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, loadData } = useWorkflow();

  // 每次进入页面都刷新数据（确保从数据库加载最新历史）
  useEffect(() => {
    loadData();
  }, []);

  // 合并当前运行和历史记录（去重）
  const allTasks: WorkflowRun[] = [];
  if (state.currentRun) {
    allTasks.push(state.currentRun);
  }
  state.history.forEach(h => {
    if (!allTasks.find(t => t.id === h.id)) {
      allTasks.push(h);
    }
  });

  // 按开始时间倒序
  allTasks.sort((a, b) => b.startedAt - a.startedAt);

  const runningTasks = allTasks.filter(t => {
    const s = getStatusDisplay(t.status, t);
    return s.isRunning;
  });
  const doneTasks = allTasks.filter(t => {
    const s = getStatusDisplay(t.status, t);
    return s.isDone;
  });
  const errorTasks = allTasks.filter(t => t.status === "error");

  const handleTaskPress = (run: WorkflowRun) => {
    const s = getStatusDisplay(run.status, run);
    if (s.isDone) {
      router.push({ pathname: "/web/complete" as any, params: { runId: run.id } });
    } else if (s.isRunning) {
      router.push("/web/run" as any);
    } else {
      router.push({ pathname: "/web/result" as any, params: { runId: run.id } });
    }
  };

  return (
    <WebLayout title="任务状态">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* 统计卡片 */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: "#6C63FF15", borderColor: "#6C63FF30" }]}>
            <Text style={[styles.statNum, { color: "#6C63FF" }]}>{runningTasks.length}</Text>
            <Text style={[styles.statLabel, { color: "#6C63FF" }]}>进行中</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#22C55E15", borderColor: "#22C55E30" }]}>
            <Text style={[styles.statNum, { color: "#22C55E" }]}>{doneTasks.length}</Text>
            <Text style={[styles.statLabel, { color: "#22C55E" }]}>执行完毕</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: "#EF444415", borderColor: "#EF444430" }]}>
            <Text style={[styles.statNum, { color: "#EF4444" }]}>{errorTasks.length}</Text>
            <Text style={[styles.statLabel, { color: "#EF4444" }]}>出错</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{allTasks.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>全部任务</Text>
          </View>
        </View>

        {allTasks.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>暂无任务</Text>
            <Text style={[styles.emptyDesc, { color: colors.muted }]}>在工作流页面输入任务描述并开始执行，任务状态将在此显示</Text>
            <TouchableOpacity
              style={[styles.goBtn, { backgroundColor: "#6C63FF" }]}
              onPress={() => router.push("/web" as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.goBtnText}>前往工作流页面</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 进行中的任务 */}
        {runningTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#6C63FF" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>进行中</Text>
              <ActivityIndicator size="small" color="#6C63FF" style={{ marginLeft: 8 }} />
            </View>
            {runningTasks.map(run => (
              <TaskRow key={run.id} run={run} onPress={() => handleTaskPress(run)} colors={colors} />
            ))}
          </View>
        )}

        {/* 执行完毕的任务 */}
        {doneTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#22C55E" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>执行完毕</Text>
              <Text style={[styles.sectionHint, { color: colors.muted }]}>点击查看报告</Text>
            </View>
            {doneTasks.map(run => (
              <TaskRow key={run.id} run={run} onPress={() => handleTaskPress(run)} colors={colors} />
            ))}
          </View>
        )}

        {/* 出错的任务 */}
        {errorTasks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: "#EF4444" }]} />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>出错</Text>
            </View>
            {errorTasks.map(run => (
              <TaskRow key={run.id} run={run} onPress={() => handleTaskPress(run)} colors={colors} />
            ))}
          </View>
        )}
      </ScrollView>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 24, paddingBottom: 60, gap: 24 },

  // 统计卡片
  statsRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 100, borderRadius: 14, borderWidth: 1, padding: 16, alignItems: "center" },
  statNum: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },

  // 空状态
  emptyBox: { borderRadius: 20, borderWidth: 1, padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 24, maxWidth: 320 },
  goBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  goBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  // 分区
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionHint: { fontSize: 12, marginLeft: "auto" as any },

  // 任务行
  taskRow: { flexDirection: "row", borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  statusBar: { width: 4 },
  taskContent: { flex: 1, padding: 16, gap: 8 },
  taskHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  taskInput: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  statusBadge: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  statusText: { fontSize: 12, fontWeight: "700" },

  // 元信息
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  metaTagText: { fontSize: 11, fontWeight: "600" },
  metaText: { fontSize: 12 },

  // 进度
  taskProgress: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  phaseText: { fontSize: 12, fontWeight: "500" },
  progressText: { fontSize: 12 },
  progressBar: { height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%" as any, borderRadius: 2 },
});
