import { ScrollView, Text, View, TouchableOpacity, StyleSheet, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import { WorkflowRun } from "@/shared/workflow-types";

export default function WebHistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, loadData } = useWorkflow();

  useEffect(() => {
    loadData();
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const getStatusInfo = (run: WorkflowRun) => {
    if (run.status === "completed") return { label: "已完成", color: colors.success };
    if (run.status === "error") return { label: "失败", color: colors.error };
    return { label: "进行中", color: colors.warning };
  };

  const completedCount = state.history.filter(r => r.status === "completed").length;
  const errorCount = state.history.filter(r => r.status === "error").length;

  const renderItem = ({ item: run }: { item: WorkflowRun }) => {
    const statusInfo = getStatusInfo(run);
    const roleCount = Object.values(run.roleOutputs || {}).filter((o: any) => o.status === "completed").length;
    const duration = run.completedAt ? Math.round((run.completedAt - run.startedAt) / 1000) : null;

    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => router.push({ pathname: "/web/result" as any, params: { runId: run.id } })}
        activeOpacity={0.7}
      >
        <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
        <View style={styles.rowMain}>
          <Text style={[styles.rowInput, { color: colors.foreground }]} numberOfLines={1}>{run.input}</Text>
          <Text style={[styles.rowTime, { color: colors.muted }]}>{formatTime(run.startedAt)}</Text>
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.rowRoles, { color: colors.muted }]}>{roleCount}/10 角色</Text>
          {duration && <Text style={[styles.rowDuration, { color: colors.muted }]}>{duration}s</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "20" }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
        </View>
        <IconSymbol name="chevron.right" size={16} color={colors.border} />
      </TouchableOpacity>
    );
  };

  return (
    <WebLayout title="历史记录">
      <View style={styles.container}>
        {/* 统计栏 */}
        <View style={[styles.statsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          {[
            { label: "总执行次数", value: state.history.length, color: "#6C63FF" },
            { label: "成功", value: completedCount, color: colors.success },
            { label: "失败", value: errorCount, color: colors.error },
          ].map(stat => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.newRunBtn, { backgroundColor: "#6C63FF" }]}
            onPress={() => router.push("/web/run" as any)}
            activeOpacity={0.85}
          >
            <IconSymbol name="play.fill" size={14} color="#FFFFFF" />
            <Text style={styles.newRunText}>新建执行</Text>
          </TouchableOpacity>
        </View>

        {/* 表头 */}
        <View style={[styles.tableHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={{ width: 12 }} />
          <Text style={[styles.colHeader, { flex: 1, color: colors.muted }]}>任务描述</Text>
          <Text style={[styles.colHeader, { width: 140, color: colors.muted }]}>执行时间</Text>
          <Text style={[styles.colHeader, { width: 80, color: colors.muted }]}>角色</Text>
          <Text style={[styles.colHeader, { width: 60, color: colors.muted }]}>耗时</Text>
          <Text style={[styles.colHeader, { width: 70, color: colors.muted }]}>状态</Text>
          <View style={{ width: 20 }} />
        </View>

        {/* 列表 */}
        {state.history.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="clock.fill" size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>暂无执行记录</Text>
            <Text style={[styles.emptySub, { color: colors.muted }]}>点击"新建执行"开始你的第一次工作流</Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: "#6C63FF" }]}
              onPress={() => router.push("/web/run" as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.emptyBtnText}>立即开始</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={state.history}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 16, borderBottomWidth: 1, gap: 32 },
  statItem: { alignItems: "center", gap: 2 },
  statValue: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 11 },
  newRunBtn: { marginLeft: "auto" as any, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  newRunText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  tableHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 10, borderBottomWidth: 1, gap: 12 },
  colHeader: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32, paddingVertical: 16, borderBottomWidth: 1, gap: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1, gap: 3 },
  rowInput: { fontSize: 14, fontWeight: "500" },
  rowTime: { fontSize: 12, width: 140 },
  rowMeta: { width: 80, alignItems: "center" },
  rowRoles: { fontSize: 12 },
  rowDuration: { fontSize: 11, width: 60, textAlign: "center" },
  statusBadge: { width: 70, alignItems: "center", paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "600" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: "600" },
  emptySub: { fontSize: 14 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  emptyBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
