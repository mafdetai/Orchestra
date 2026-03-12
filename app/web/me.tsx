import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { getApiBaseUrl } from "@/constants/oauth";

type AuthProfile = {
  trialRunsLeft: number;
  tier: string;
  role: string;
};

function extractTrpcData(json: { result?: { data?: unknown } }): unknown {
  const dataObj = json.result?.data;
  if (dataObj && typeof dataObj === "object" && "json" in (dataObj as object)) {
    return (dataObj as { json: unknown }).json;
  }
  return dataObj;
}

async function trpcQuery(procedure: string): Promise<unknown> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/trpc/${procedure}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { result?: { data?: unknown } };
  return extractTrpcData(json);
}

export default function MeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [modelCount, setModelCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.openId) {
      setProfile(null);
      setModelCount(0);
      return;
    }
    setRefreshing(true);
    try {
      const [profileData, modelData] = await Promise.all([
        trpcQuery("auth.getProfile").catch(() => null),
        trpcQuery("models.list").catch(() => []),
      ]);

      if (profileData && typeof profileData === "object") {
        setProfile(profileData as AuthProfile);
      } else {
        setProfile(null);
      }

      if (Array.isArray(modelData)) {
        setModelCount(modelData.length);
      } else {
        setModelCount(0);
      }
    } finally {
      setRefreshing(false);
    }
  }, [user?.openId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const joinDateText = useMemo(() => {
    if (!user?.lastSignedIn) return "—";
    const d = user.lastSignedIn instanceof Date ? user.lastSignedIn : new Date(String(user.lastSignedIn));
    return d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }, [user?.lastSignedIn]);

  if (loading) {
    return (
      <WebLayout title="我的">
        <View style={styles.centerBox}>
          <Text style={{ color: colors.muted }}>加载中...</Text>
        </View>
      </WebLayout>
    );
  }

  if (!user) {
    return (
      <WebLayout title="我的">
        <View style={[styles.loginBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.loginTitle, { color: colors.foreground }]}>请先登录</Text>
          <Text style={[styles.loginDesc, { color: colors.muted }]}>
            登录后可查看你的账号信息，并管理仅本人可见的 AI 模型与 API Key。
          </Text>
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: "#6C63FF" }]}
            onPress={() => router.push("/web/login" as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.loginBtnText}>去登录</Text>
          </TouchableOpacity>
        </View>
      </WebLayout>
    );
  }

  return (
    <WebLayout
      title="我的"
      actions={(
        <TouchableOpacity
          style={[styles.refreshBtn, { borderColor: colors.border }]}
          onPress={loadData}
          activeOpacity={0.75}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>{refreshing ? "刷新中..." : "刷新"}</Text>
        </TouchableOpacity>
      )}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.profileCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.profileTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user.name ?? user.openId).slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.nameText, { color: colors.foreground }]}>{user.name ?? "未设置昵称"}</Text>
              <Text style={[styles.subText, { color: colors.muted }]}>{user.email ?? "未绑定邮箱"}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={[styles.infoItem, { borderColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>OpenID</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]} numberOfLines={1}>
                {user.openId}
              </Text>
            </View>
            <View style={[styles.infoItem, { borderColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>登录方式</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{user.loginMethod ?? "未知"}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>用户等级</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{profile?.tier ?? "user"}</Text>
            </View>
            <View style={[styles.infoItem, { borderColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>试用次数</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{profile?.trialRunsLeft ?? 0}</Text>
            </View>
          </View>

          <Text style={[styles.lastSignText, { color: colors.muted }]}>最近登录：{joinDateText}</Text>
        </View>

        <View style={[styles.privacyBox, { borderColor: "#22C55E55", backgroundColor: "#22C55E10" }]}>
          <View style={styles.privacyTitleRow}>
            <IconSymbol name="shield.fill" size={16} color="#16A34A" />
            <Text style={[styles.privacyTitle, { color: "#15803D" }]}>API Key 隐私保护</Text>
          </View>
          <Text style={[styles.privacyText, { color: "#166534" }]}>
            你的 API Key 会加密保存，任何人都看不到完整内容（页面仅显示脱敏片段）。
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>我的功能</Text>

          <TouchableOpacity
            style={[styles.entryCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => router.push("/web/models" as any)}
            activeOpacity={0.8}
          >
            <View style={[styles.entryIcon, { backgroundColor: "#6C63FF15" }]}>
              <IconSymbol name="cpu" size={18} color="#6C63FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.entryTitle, { color: colors.foreground }]}>我的AI模型</Text>
              <Text style={[styles.entryDesc, { color: colors.muted }]}>
                已配置 {modelCount} 个模型，仅你可管理
              </Text>
            </View>
            <IconSymbol name="arrow.up.right" size={16} color={colors.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.entryCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => router.push({ pathname: "/web/profile/[userId]" as any, params: { userId: user.openId } })}
            activeOpacity={0.8}
          >
            <View style={[styles.entryIcon, { backgroundColor: "#0EA5E915" }]}>
              <IconSymbol name="person.fill" size={18} color="#0EA5E9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.entryTitle, { color: colors.foreground }]}>我的主页</Text>
              <Text style={[styles.entryDesc, { color: colors.muted }]}>查看你的公开创作者主页与发布工作流</Text>
            </View>
            <IconSymbol name="arrow.up.right" size={16} color={colors.muted} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 24, gap: 16 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  loginBox: {
    margin: 24,
    padding: 24,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  loginTitle: { fontSize: 18, fontWeight: "700" },
  loginDesc: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  loginBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  loginBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6C63FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  nameText: { fontSize: 17, fontWeight: "700" },
  subText: { fontSize: 12, marginTop: 2 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  infoItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 180,
    flexGrow: 1,
  },
  infoLabel: { fontSize: 11 },
  infoValue: { fontSize: 13, fontWeight: "600", marginTop: 3 },
  lastSignText: { fontSize: 12 },
  privacyBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  privacyTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  privacyTitle: { fontSize: 13, fontWeight: "700" },
  privacyText: { fontSize: 12, lineHeight: 19 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  entryCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  entryIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  entryTitle: { fontSize: 14, fontWeight: "700" },
  entryDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
});
