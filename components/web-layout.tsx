import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";

interface NavItem {
  path: string;
  label: string;
  icon: any;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/web", label: "工作流", icon: "bolt.fill" as const },
  { path: "/web/square", label: "广场", icon: "square.grid.2x2.fill" as const },
  { path: "/web/run", label: "执行", icon: "play.fill" as const },
  { path: "/web/history", label: "历史", icon: "clock.fill" as const },
  { path: "/web/me", label: "我的", icon: "person.fill" as const },
];

interface WebLayoutProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

export function WebLayout({ children, title, actions }: WebLayoutProps) {
  const colors = useColors();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const isAdmin = (user as { role?: string } | null)?.role === "admin";

  // 宽屏（>= 768px）显示侧边栏，窄屏显示顶部导航栏
  const isWide = width >= 768;
  const isNavActive = (itemPath: string) => {
    if (itemPath === "/web") {
      return pathname === "/web" || pathname === "/web/index";
    }
    if (itemPath === "/web/me") {
      return pathname === "/web/me" || pathname.startsWith("/web/models");
    }
    return pathname === itemPath || (itemPath !== "/web" && pathname.startsWith(itemPath));
  };

  if (Platform.OS !== "web") return <>{children}</>;

  if (isWide) {
    // ── 宽屏：左侧边栏 + 右侧内容 ──────────────────────────────
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {/* Sidebar */}
        <View style={[styles.sidebar, { backgroundColor: colors.surface, borderRightColor: colors.border }]}>
          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={[styles.logoIcon, { backgroundColor: "#6C63FF" }]}>
              <IconSymbol name="sparkles" size={20} color="#FFFFFF" />
            </View>
            <View>
              <Text style={[styles.logoTitle, { color: colors.foreground }]}>Orchestra</Text>
              <Text style={[styles.logoSub, { color: colors.muted }]}>by Mafdet.AI</Text>
            </View>
          </View>

          {/* Nav */}
          <View style={styles.nav}>
            {NAV_ITEMS.map((item) => {
              const isActive = isNavActive(item.path);
              return (
                <TouchableOpacity
                  key={item.path}
                  style={[styles.navItem, isActive && { backgroundColor: "#6C63FF18" }]}
                  onPress={() => router.push(item.path as any)}
                  activeOpacity={0.7}
                >
                  <IconSymbol name={item.icon} size={18} color={isActive ? "#6C63FF" : colors.muted} />
                  <Text style={[styles.navLabel, { color: isActive ? "#6C63FF" : colors.muted, fontWeight: isActive ? "600" : "400" }]}>
                    {item.label}
                  </Text>
                  {isActive && <View style={[styles.activeBar, { backgroundColor: "#6C63FF" }]} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Admin 入口（仅管理员可见） */}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.adminEntry, { backgroundColor: "#FEF3C7", borderColor: "#F59E0B" }]}
              onPress={() => router.push("/admin" as any)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 13 }}>⚙️</Text>
              <Text style={{ color: "#92400E", fontSize: 12, fontWeight: "700" }}>管理员后台</Text>
            </TouchableOpacity>
          )}

          {/* Footer */}
          <View style={styles.sidebarFooter}>
            <View style={[styles.workflowBadge, { backgroundColor: "#6C63FF15", borderColor: "#6C63FF30" }]}>
              <Text style={{ color: "#6C63FF", fontSize: 11, fontWeight: "600" }}>by Mafdet.AI</Text>
            </View>
          </View>
        </View>

        {/* Main */}
        <View style={[styles.main, { backgroundColor: colors.background }]}>
          {(title || actions) && (
            <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              {title && <Text style={[styles.pageTitle, { color: colors.foreground }]}>{title}</Text>}
              {actions && <View style={styles.topBarActions}>{actions}</View>}
            </View>
          )}
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    );
  }

  // ── 窄屏：顶部标题栏 + 内容 + 底部导航 ────────────────────────
  return (
    <View style={[styles.narrowRoot, { backgroundColor: colors.background }]}>
      {/* Top bar */}
      <View style={[styles.narrowTopBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.narrowLogo, { backgroundColor: "#6C63FF" }]}>
          <IconSymbol name="sparkles" size={14} color="#FFFFFF" />
        </View>
        {title ? (
          <Text style={[styles.narrowTitle, { color: colors.foreground }]}>{title}</Text>
        ) : (
          <Text style={[styles.narrowTitle, { color: colors.foreground }]}>Orchestra</Text>
        )}
        {actions && <View style={styles.narrowActions}>{actions}</View>}
      </View>

      {/* Content */}
      <View style={styles.narrowContent}>{children}</View>

      {/* Bottom nav */}
      <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        {NAV_ITEMS.map((item) => {
          const isActive = isNavActive(item.path);
          return (
            <TouchableOpacity
              key={item.path}
              style={styles.bottomNavItem}
              onPress={() => router.push(item.path as any)}
              activeOpacity={0.7}
            >
              <IconSymbol name={item.icon} size={22} color={isActive ? "#6C63FF" : colors.muted} />
              <Text style={[styles.bottomNavLabel, { color: isActive ? "#6C63FF" : colors.muted, fontWeight: isActive ? "600" : "400" }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wide layout
  root: { flex: 1, flexDirection: "row", height: "100%" as any },
  sidebar: {
    width: 220,
    borderRightWidth: 1,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  logoArea: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 32, paddingHorizontal: 4 },
  logoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  logoTitle: { fontSize: 15, fontWeight: "700" },
  logoSub: { fontSize: 11, marginTop: 1 },
  nav: { gap: 4 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    position: "relative",
  },
  navLabel: { fontSize: 14 },
  activeBar: { position: "absolute", right: 0, top: 8, bottom: 8, width: 3, borderRadius: 2 },
  sidebarFooter: { paddingHorizontal: 4 },
  workflowBadge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center" },
  adminEntry: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, marginBottom: 8 },
  main: { flex: 1, flexDirection: "column" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pageTitle: { fontSize: 20, fontWeight: "700" },
  topBarActions: { flexDirection: "row", gap: 8 },
  content: { flex: 1 },

  // Narrow layout
  narrowRoot: { flex: 1, flexDirection: "column", height: "100%" as any },
  narrowTopBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  narrowLogo: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  narrowTitle: { flex: 1, fontSize: 16, fontWeight: "700" },
  narrowActions: { flexDirection: "row", gap: 6 },
  narrowContent: { flex: 1 },
  bottomNav: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingBottom: 8,
  },
  bottomNavItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    gap: 3,
  },
  bottomNavLabel: { fontSize: 10 },
});
