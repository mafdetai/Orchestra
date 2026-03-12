import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

type WorkflowItem = {
  id: string;
  workflowId: string;
  workflowName: string;
  description: string | null;
  isVerified: boolean;
  isSystem: boolean;
  isPublic: boolean;
  likeCount: number;
  useCount: number;
  copyCount: number;
  expertCount: number;
  hotScore: number;
  publishedAt: Date | string;
};

function TierBadge({ tier }: { tier: string }) {
  if (tier === "pro") {
    return (
      <View style={[badgeStyles.badge, { backgroundColor: "#F59E0B15", borderColor: "#F59E0B40" }]}>
        <IconSymbol name="crown.fill" size={11} color="#F59E0B" />
        <Text style={[badgeStyles.text, { color: "#F59E0B" }]}>Pro</Text>
      </View>
    );
  }
  if (tier === "admin") {
    return (
      <View style={[badgeStyles.badge, { backgroundColor: "#EF444415", borderColor: "#EF444440" }]}>
        <IconSymbol name="shield.fill" size={11} color="#EF4444" />
        <Text style={[badgeStyles.text, { color: "#EF4444" }]}>管理员</Text>
      </View>
    );
  }
  return null;
}

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  text: { fontSize: 11, fontWeight: "700" },
});

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  const colors = useColors();
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  return (
    <View style={[statStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[statStyles.value, { color }]}>{fmt(value)}</Text>
      <Text style={[statStyles.label, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  value: { fontSize: 22, fontWeight: "800" },
  label: { fontSize: 11 },
});

function WorkflowCard({ item, onExecute, onCopy }: { item: WorkflowItem; onExecute: () => void; onCopy: () => void }) {
  const colors = useColors();
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const date = new Date(item.publishedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });

  return (
    <View style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={cardStyles.header}>
        <Text style={[cardStyles.name, { color: colors.foreground }]} numberOfLines={1}>{item.workflowName}</Text>
        <View style={cardStyles.badges}>
          {item.isVerified && (
            <View style={[cardStyles.badge, { backgroundColor: "#6C63FF15", borderColor: "#6C63FF40" }]}>
              <IconSymbol name="checkmark.seal.fill" size={10} color="#6C63FF" />
              <Text style={[cardStyles.badgeText, { color: "#6C63FF" }]}>Verified</Text>
            </View>
          )}
          {!item.isPublic && (
            <View style={[cardStyles.badge, { backgroundColor: "#F59E0B15", borderColor: "#F59E0B40" }]}>
              <IconSymbol name="lock.fill" size={10} color="#F59E0B" />
              <Text style={[cardStyles.badgeText, { color: "#F59E0B" }]}>私密</Text>
            </View>
          )}
        </View>
      </View>

      {item.description ? (
        <Text style={[cardStyles.desc, { color: colors.muted }]} numberOfLines={2}>{item.description}</Text>
      ) : null}

      {/* 节点结构 */}
      <View style={[cardStyles.nodeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[cardStyles.node, { backgroundColor: "#6C63FF20", borderColor: "#6C63FF40" }]}>
          <Text style={[cardStyles.nodeText, { color: "#6C63FF" }]}>指挥官</Text>
        </View>
        <Text style={[cardStyles.arrow, { color: colors.muted }]}>→</Text>
        <View style={[cardStyles.node, { backgroundColor: "#0EA5E920", borderColor: "#0EA5E940" }]}>
          <Text style={[cardStyles.nodeText, { color: "#0EA5E9" }]}>执行专家×{item.expertCount}</Text>
        </View>
        <Text style={[cardStyles.arrow, { color: colors.muted }]}>→</Text>
        <View style={[cardStyles.node, { backgroundColor: "#22C55E20", borderColor: "#22C55E40" }]}>
          <Text style={[cardStyles.nodeText, { color: "#22C55E" }]}>汇总者</Text>
        </View>
      </View>

      <View style={cardStyles.footer}>
        <View style={cardStyles.stats}>
          <View style={cardStyles.stat}>
            <IconSymbol name="heart.fill" size={12} color="#EF4444" />
            <Text style={[cardStyles.statText, { color: colors.muted }]}>{fmt(item.likeCount)}</Text>
          </View>
          <View style={cardStyles.stat}>
            <IconSymbol name="play.fill" size={11} color={colors.muted} />
            <Text style={[cardStyles.statText, { color: colors.muted }]}>{fmt(item.useCount)}</Text>
          </View>
          <Text style={[cardStyles.date, { color: colors.muted }]}>{date}</Text>
        </View>
        <View style={cardStyles.actions}>
          <TouchableOpacity style={[cardStyles.copyBtn, { borderColor: "#6C63FF60", backgroundColor: "#6C63FF10" }]} onPress={onCopy} activeOpacity={0.8}>
            <IconSymbol name="doc.on.doc" size={12} color="#6C63FF" />
            <Text style={[cardStyles.copyText, { color: "#6C63FF" }]}>复制</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[cardStyles.execBtn, { backgroundColor: "#6C63FF" }]} onPress={onExecute} activeOpacity={0.85}>
            <IconSymbol name="play.fill" size={12} color="#FFFFFF" />
            <Text style={cardStyles.execText}>执行</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 14, fontWeight: "700", flex: 1 },
  badges: { flexDirection: "row", gap: 4 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  desc: { fontSize: 12, lineHeight: 17 },
  nodeRow: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 7, padding: 7, borderWidth: 1, flexWrap: "wrap" },
  node: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  nodeText: { fontSize: 10, fontWeight: "600" },
  arrow: { fontSize: 11 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stats: { flexDirection: "row", alignItems: "center", gap: 10 },
  stat: { flexDirection: "row", alignItems: "center", gap: 3 },
  statText: { fontSize: 11 },
  date: { fontSize: 11 },
  actions: { flexDirection: "row", gap: 6 },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1 },
  copyText: { fontSize: 11, fontWeight: "600" },
  execBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7 },
  execText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600" },
});

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const colors = useColors();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user: currentUser } = useAuth();

  const { data: profile, isLoading } = trpc.profile.get.useQuery(
    { openId: userId ?? "" },
    { enabled: !!userId }
  );

  const copyMutation = trpc.square.copy.useMutation();

  const handleExecute = (item: WorkflowItem) => {
    if (item.isSystem) {
      router.push({ pathname: "/web/run" as any, params: { systemWorkflowId: item.workflowId } });
    } else {
      router.push({ pathname: "/web/run" as any, params: { squareWorkflowId: item.workflowId } });
    }
  };

  const handleCopy = (item: WorkflowItem) => {
    if (!currentUser) {
      router.push("/web/square" as any);
      return;
    }
    copyMutation.mutate({ squareId: item.id });
  };

  if (isLoading) {
    return (
      <WebLayout title="作者主页">
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>加载中...</Text>
        </View>
      </WebLayout>
    );
  }

  if (!profile) {
    return (
      <WebLayout title="作者主页">
        <View style={styles.notFoundWrap}>
          <Text style={{ fontSize: 48 }}>👤</Text>
          <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>用户不存在</Text>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: "#6C63FF" }]} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.backBtnText}>返回广场</Text>
          </TouchableOpacity>
        </View>
      </WebLayout>
    );
  }

  const isOwner = profile.isOwner;
  const joinYear = new Date(profile.createdAt).getFullYear();

  return (
    <WebLayout title="作者主页">
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile 头部 */}
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* 头像 */}
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: "#6C63FF" }]}>
              <Text style={styles.avatarText}>
                {(profile.name ?? profile.openId).slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.profileName, { color: colors.foreground }]}>
                  {profile.name ?? "匿名用户"}
                </Text>
                <TierBadge tier={profile.tier} />
                {isOwner && (
                  <View style={[styles.ownerBadge, { backgroundColor: "#22C55E15", borderColor: "#22C55E40" }]}>
                    <Text style={[styles.ownerText, { color: "#22C55E" }]}>你的主页</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.profileId, { color: colors.muted }]}>@{profile.openId.slice(0, 12)}... · 加入于 {joinYear}</Text>
              {profile.bio ? (
                <Text style={[styles.profileBio, { color: colors.muted }]}>{profile.bio}</Text>
              ) : null}
            </View>
          </View>

          {/* 统计数据 */}
          <View style={styles.statsRow}>
            <StatCard value={profile.stats.totalWorkflows} label="工作流" color="#6C63FF" />
            <StatCard value={profile.stats.totalUses} label="总执行次数" color="#0EA5E9" />
            <StatCard value={profile.stats.totalLikes} label="获赞数" color="#EF4444" />
          </View>

          {/* 动态成就徽章 */}
          {(() => {
            const badges: { emoji: string; label: string; color: string; bg: string }[] = [];
            if (profile.stats.totalLikes >= 100) badges.push({ emoji: "🔥", label: "热门创作者", color: "#EF4444", bg: "#EF444415" });
            if (profile.stats.totalUses >= 500) badges.push({ emoji: "⚡", label: "高转化工作流", color: "#F59E0B", bg: "#F59E0B15" });
            if (profile.stats.totalWorkflows >= 5) badges.push({ emoji: "🎤", label: "高产创作者", color: "#6C63FF", bg: "#6C63FF15" });
            if (profile.stats.totalLikes >= 50 && profile.stats.totalUses >= 200) badges.push({ emoji: "🏆", label: "Maestro 认证", color: "#059669", bg: "#05966915" });
            if (badges.length === 0) return null;
            return (
              <View style={styles.achieveRow}>
                {badges.map(b => (
                  <View key={b.label} style={[styles.achieveBadge, { backgroundColor: b.bg, borderColor: b.color + "40" }]}>
                    <Text style={styles.achieveEmoji}>{b.emoji}</Text>
                    <Text style={[styles.achieveText, { color: b.color }]}>{b.label}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>

        {/* 工作流列表 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isOwner ? "我的工作流" : "公开工作流"}
            </Text>
            <Text style={[styles.sectionCount, { color: colors.muted }]}>{profile.workflows.length} 个</Text>
          </View>

          {profile.workflows.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ fontSize: 32 }}>🎼</Text>
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {isOwner ? "你还没有发布工作流，去广场发布吧！" : "该用户暂无公开工作流"}
              </Text>
              {isOwner && (
                <TouchableOpacity
                  style={[styles.publishBtn, { backgroundColor: "#6C63FF" }]}
                  onPress={() => router.push("/web" as any)}
                  activeOpacity={0.85}
                >
                  <IconSymbol name="plus" size={14} color="#FFFFFF" />
                  <Text style={styles.publishBtnText}>发布工作流</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.workflowGrid}>
              {(profile.workflows as WorkflowItem[]).map(item => (
                <WorkflowCard
                  key={item.id}
                  item={item}
                  onExecute={() => handleExecute(item)}
                  onCopy={() => handleCopy(item)}
                />
              ))}
            </View>
          )}
        </View>

        {/* GitHub-style 贡献提示 */}
        <View style={[styles.githubNote, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="globe" size={14} color={colors.muted} />
          <Text style={[styles.githubNoteText, { color: colors.muted }]}>
            工作流广场是开放的创作社区，优质流程将被推荐至热度榜
          </Text>
        </View>
      </ScrollView>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 20 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14 },
  notFoundWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  notFoundTitle: { fontSize: 18, fontWeight: "700" },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  backBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  // Profile card
  profileCard: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
  avatarRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" },
  profileInfo: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  profileName: { fontSize: 20, fontWeight: "800" },
  ownerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  ownerText: { fontSize: 11, fontWeight: "700" },
  profileId: { fontSize: 12 },
  profileBio: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 10 },

  // Section
  section: { gap: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  sectionCount: { fontSize: 13 },
  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 32, alignItems: "center", gap: 12 },
  emptyText: { fontSize: 13, textAlign: "center" },
  publishBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  publishBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  workflowGrid: { gap: 10 },

  // GitHub note
  githubNote: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, padding: 12 },
  githubNoteText: { fontSize: 12, flex: 1 },
  achieveRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  achieveBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  achieveEmoji: { fontSize: 13 },
  achieveText: { fontSize: 11, fontWeight: "700" },
});
