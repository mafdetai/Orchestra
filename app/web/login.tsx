import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

type Mode = "login" | "register";

export default function LoginPage() {
  const colors = useColors();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const showError = (msg: string) => {
    setError(msg);
    if (Platform.OS !== "web") Alert.alert("提示", msg);
  };

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password.trim()) {
      showError("邮箱和密码不能为空");
      return;
    }
    if (mode === "register" && password.length < 6) {
      showError("密码至少 6 位");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body: Record<string, string> = { email: email.trim(), password };
      if (mode === "register" && name.trim()) body.name = name.trim();

      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data.error || "操作失败，请重试");
        return;
      }

      // 登录/注册成功，跳回首页
      router.replace("/");
    } catch (e) {
      showError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer className="flex-1">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          {/* 返回按钮 */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={[styles.backText, { color: colors.muted }]}>← 返回</Text>
          </TouchableOpacity>

          {/* Logo 区域 */}
          <View style={styles.hero}>
            <View style={[styles.logoWrap, { backgroundColor: "#6C63FF15" }]}>
              <Text style={styles.logoEmoji}>🎼</Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>欢迎使用 Orchestra</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              由 Mafdet.AI 维护的 AI 多角色工作流平台
            </Text>
          </View>

          {/* Tab 切换：登录 / 注册 */}
          <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(["login", "register"] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[
                  styles.tabBtn,
                  mode === m && { backgroundColor: "#6C63FF" },
                ]}
                onPress={() => { setMode(m); setError(""); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, { color: mode === m ? "#fff" : colors.muted }]}>
                  {m === "login" ? "登录" : "注册"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 表单 */}
          <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {mode === "register" && (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>昵称（可选）</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="你的名字"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>邮箱</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>密码{mode === "register" ? "（至少 6 位）" : ""}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {/* 错误提示 */}
            {!!error && (
              <View style={[styles.errorBox, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}>
                <Text style={{ color: "#DC2626", fontSize: 13 }}>{error}</Text>
              </View>
            )}
          </View>

          {/* 提交按钮 */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: "#6C63FF", opacity: loading ? 0.7 : 1 }]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === "login" ? "登录" : "注册并登录"}
              </Text>
            )}
          </TouchableOpacity>

          {/* 切换提示 */}
          <TouchableOpacity
            onPress={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.switchText, { color: colors.muted }]}>
              {mode === "login" ? "还没有账号？立即注册 →" : "已有账号？直接登录 →"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 8,
  },
  backText: {
    fontSize: 14,
  },
  hero: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  logoEmoji: {
    fontSize: 36,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  form: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 20,
    gap: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  switchText: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 8,
  },
});
