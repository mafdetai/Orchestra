import { FlatList, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import { WorkflowRun } from "@/shared/workflow-types";

export default function HistoryScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, loadData } = useWorkflow();

  useEffect(() => {
    if (!state.isLoaded) loadData();
  }, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const getDuration = (run: WorkflowRun) => {
    if (!run.completedAt) return "—";
    const secs = Math.round((run.completedAt - run.startedAt) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const getStatusInfo = (run: WorkflowRun) => {
    if (run.status === "completed") return { label: "已完成", color: colors.success };
    if (run.status === "error") return { label: "失败", color: colors.error };
    return { label: "进行中", color: colors.warning };
  };

  const renderItem = ({ item: run }: { item: WorkflowRun }) => {
    const statusInfo = getStatusInfo(run);
    const completedCount = Object.values(run.roleOutputs || {}).filter((o: any) => o.status === "completed").length;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: "/result" as any, params: { runId: run.id } })}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.cardInput, { color: colors.foreground }]} numberOfLines={2}>
            {run.input}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.metaText, { color: colors.muted }]}>{formatTime(run.startedAt)}</Text>
          <Text style={[styles.metaText, { color: colors.muted }]}>耗时 {getDuration(run)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "20" }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
          </View>
        </View>
        {run.status === "completed" && (
          <View style={styles.cardBottom}>
            <IconSymbol name="checkmark.circle.fill" size={14} color={colors.success} />
            <Text style={[styles.completedText, { color: colors.muted }]}>
              {completedCount} 个角色完成
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>执行历史</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>共 {state.history.length} 条记录</Text>
      </View>

      {state.history.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="clock.fill" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>暂无执行记录</Text>
          <Text style={[styles.emptySubtext, { color: colors.muted }]}>执行工作流后，记录将显示在这里</Text>
        </View>
      ) : (
        <FlatList
          data={state.history}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14 },
  listContent: { padding: 20, paddingTop: 4, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 12 },
  cardTop: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  cardInput: { flex: 1, fontSize: 15, fontWeight: "500", lineHeight: 22 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaText: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: "600" },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  completedText: { fontSize: 12 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyText: { fontSize: 16, fontWeight: "500" },
  emptySubtext: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
});
