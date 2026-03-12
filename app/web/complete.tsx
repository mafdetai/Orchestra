import {
  ScrollView, Text, View, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Platform
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useEffect } from "react";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useWorkflow } from "@/lib/workflow-context";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { MarkdownRenderer } from "@/components/markdown-renderer";

function formatTime(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

function formatDuration(start: number, end?: number) {
  const ms = (end ?? Date.now()) - start;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

/** 将 Markdown 文本转为简单 HTML（用于 PDF 打印） */
function markdownToHtml(md: string, taskInput: string, templateName: string, completedAt?: number): string {
  const body = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <title>Orchestra 综合报告 · Mafdet.AI</title>
  <style>
    @page { margin: 2cm; }
    body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-size: 14px; line-height: 1.8; color: #1a1a1a; }
    .cover { text-align: center; padding: 40px 0 32px; border-bottom: 2px solid #6C63FF; margin-bottom: 32px; }
    .cover h1 { font-size: 26px; color: #6C63FF; margin: 0 0 12px; }
    .cover .meta { color: #666; font-size: 13px; }
    .task-box { background: #f8f7ff; border-left: 4px solid #6C63FF; padding: 16px 20px; border-radius: 4px; margin-bottom: 32px; }
    .task-box .label { font-size: 11px; color: #6C63FF; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
    h1 { font-size: 22px; color: #1a1a1a; margin: 28px 0 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    h2 { font-size: 18px; color: #333; margin: 24px 0 10px; }
    h3 { font-size: 15px; color: #555; margin: 18px 0 8px; }
    p { margin: 10px 0; }
    ul { padding-left: 20px; }
    li { margin: 4px 0; }
    strong { color: #1a1a1a; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="cover">
    <h1>🎼 Orchestra 综合报告</h1>
    <div class="meta">
      工作流：${templateName} &nbsp;·&nbsp;
      完成时间：${completedAt ? formatTime(completedAt) : "—"}
    </div>
  </div>
  <div class="task-box">
    <div class="label">任务描述</div>
    <div>${taskInput}</div>
  </div>
  ${body}
  <div class="footer">
    由 Orchestra · Mafdet.AI 自动生成 &nbsp;·&nbsp; ${completedAt ? formatTime(completedAt) : ""}
  </div>
</body>
</html>`;
}

export default function WebCompleteScreen() {
  const router = useRouter();
  const colors = useColors();
  const { state, loadData } = useWorkflow();
  const { runId } = useLocalSearchParams<{ runId?: string }>();

  const [email, setEmail] = useState("");
  const [resendKey, setResendKey] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  const sendNotificationMutation = trpc.workflow.sendCompletionNotification.useMutation();

  // 进入页面时刷新数据（确保历史记录已加载）
  useEffect(() => {
    loadData();
  }, []);

  // 找到对应的 run（先查 currentRun，再查 history）
  const run = runId
    ? (state.currentRun?.id === runId ? state.currentRun : state.history.find(h => h.id === runId))
    : state.currentRun;

  const template = run ? state.templates.find(t => t.id === run.templateId) : null;
  const allRoles = template
    ? [template.initiator, ...template.experts, template.summarizer]
    : [];

  const handleDownloadMarkdown = () => {
    if (!run?.finalDocument) return;
    const blob = new Blob([run.finalDocument], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AI工作流报告_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = () => {
    if (!run?.finalDocument) return;
    const html = markdownToHtml(
      run.finalDocument,
      run.input,
      run.templateName,
      run.completedAt
    );
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const handleSendEmail = async () => {
    if (!email.trim() || !run?.finalDocument) return;
    setEmailError("");
    try {
      const result = await sendNotificationMutation.mutateAsync({
        email: email.trim(),
        taskInput: run.input,
        templateName: run.templateName,
        summary: run.finalDocument,
        resendApiKey: resendKey.trim() || "re_demo",
      });
      if (result.success) {
        setEmailSent(true);
        setShowEmailForm(false);
      } else {
        setEmailError(result.message ?? "发送失败");
      }
    } catch (err) {
      setEmailError(String(err));
    }
  };

  const toggleRole = (id: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!run) {
    return (
      <WebLayout title="任务完成">
        <View style={[styles.center, { flex: 1 }]}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>🔍</Text>
          <Text style={[styles.notFoundTitle, { color: colors.foreground }]}>未找到任务记录</Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: "#6C63FF" }]}
            onPress={() => router.push("/web/tasks" as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.backBtnText}>返回任务状态页</Text>
          </TouchableOpacity>
        </View>
      </WebLayout>
    );
  }

  const completedRoleCount = Object.values(run.roleOutputs).filter(o => o.status === "completed").length;

  return (
    <WebLayout title="任务完成">
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── 完成横幅 ── */}
        <View style={[styles.completeBanner, { backgroundColor: "#22C55E12", borderColor: "#22C55E40" }]}>
          <View style={styles.bannerLeft}>
            <View style={[styles.checkCircle, { backgroundColor: "#22C55E" }]}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <View>
              <Text style={[styles.bannerTitle, { color: "#22C55E" }]}>任务执行完毕</Text>
              <Text style={[styles.bannerMeta, { color: colors.muted }]}>
                {run.templateName} · {completedRoleCount} 个角色完成 ·
                {run.completedAt ? ` 耗时 ${formatDuration(run.startedAt, run.completedAt)}` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.bannerActions}>
            {/* 下载 Markdown */}
            {Platform.OS === "web" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#6C63FF18", borderColor: "#6C63FF40" }]}
                onPress={handleDownloadMarkdown}
                activeOpacity={0.8}
              >
                <IconSymbol name="arrow.down.circle.fill" size={16} color="#6C63FF" />
                <Text style={[styles.actionBtnText, { color: "#6C63FF" }]}>Markdown</Text>
              </TouchableOpacity>
            )}
            {/* 打印/保存为 PDF */}
            {Platform.OS === "web" && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#EF444418", borderColor: "#EF444440" }]}
                onPress={handleDownloadPDF}
                activeOpacity={0.8}
              >
                <IconSymbol name="doc.text.fill" size={16} color="#EF4444" />
                <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>保存 PDF</Text>
              </TouchableOpacity>
            )}
            {/* 邮件通知 */}
            <TouchableOpacity
              style={[styles.actionBtn, {
                backgroundColor: emailSent ? "#22C55E18" : "#F59E0B18",
                borderColor: emailSent ? "#22C55E40" : "#F59E0B40"
              }]}
              onPress={() => setShowEmailForm(!showEmailForm)}
              activeOpacity={0.8}
            >
              <IconSymbol name="envelope.fill" size={16} color={emailSent ? "#22C55E" : "#F59E0B"} />
              <Text style={[styles.actionBtnText, { color: emailSent ? "#22C55E" : "#F59E0B" }]}>
                {emailSent ? "已发送" : "邮件通知"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── 邮件表单 ── */}
        {showEmailForm && !emailSent && (
          <View style={[styles.emailForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.emailTitle, { color: colors.foreground }]}>📧 发送完成通知邮件</Text>
            <Text style={[styles.emailDesc, { color: colors.muted }]}>
              填写邮箱地址，系统将发送「你的任务完成了」通知及报告摘要。
            </Text>
            <TextInput
              style={[styles.emailInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor={colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Resend API Key（需要 resend.com 免费账号）</Text>
            <TextInput
              style={[styles.emailInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              value={resendKey}
              onChangeText={setResendKey}
              placeholder="re_xxxxxxxxxxxxxxxxxx"
              placeholderTextColor={colors.muted}
              secureTextEntry
            />
            {emailError ? (
              <Text style={[styles.emailError, { color: colors.error }]}>{emailError}</Text>
            ) : null}
            <View style={styles.emailBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowEmailForm(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: colors.muted }]}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: email.trim() ? "#F59E0B" : colors.border }]}
                onPress={handleSendEmail}
                disabled={!email.trim() || sendNotificationMutation.isPending}
                activeOpacity={0.85}
              >
                {sendNotificationMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.sendBtnText}>发送通知</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 任务信息 ── */}
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.muted }]}>任务描述</Text>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>{run.input}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.infoGrid}>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>工作流</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{run.templateName}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>开始时间</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{formatTime(run.startedAt)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>完成时间</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {run.completedAt ? formatTime(run.completedAt) : "—"}
              </Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={[styles.infoLabel, { color: colors.muted }]}>总耗时</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {run.completedAt ? formatDuration(run.startedAt, run.completedAt) : "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 综合报告预览 ── */}
        {run.finalDocument && (
          <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.reportHeader}>
              <View style={[styles.reportBadge, { backgroundColor: "#22C55E20" }]}>
                <Text style={{ color: "#22C55E", fontSize: 12, fontWeight: "700" }}>📄 综合报告</Text>
              </View>
              <Text style={[styles.reportHint, { color: colors.muted }]}>由汇总者整合所有专家输出产出</Text>
            </View>
            <ScrollView
              style={[styles.reportScroll, { backgroundColor: colors.background, borderColor: colors.border }]}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
            >
              <MarkdownRenderer content={run.finalDocument} fontSize={14} />
            </ScrollView>
          </View>
        )}

        {/* ── 各角色输出 ── */}
        {allRoles.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>各角色执行详情</Text>
            {allRoles.map((role, idx) => {
              const output = run.roleOutputs[role.id];
              const isExpanded = expandedRoles.has(role.id);
              const roleColor = role.type === "initiator" ? "#6C63FF" : role.type === "summarizer" ? "#22C55E" : "#0EA5E9";
              const roleLabel = role.type === "initiator" ? "指挥官" : role.type === "summarizer" ? "汇总者" : `执行专家 ${idx}`;

              return (
                <View key={role.id} style={[styles.roleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.roleHeader}
                    onPress={() => toggleRole(role.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.roleBadge, { backgroundColor: roleColor }]}>
                      <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.roleName, { color: colors.foreground }]}>{role.name}</Text>
                      {output?.status === "completed" && (
                        <Text style={[styles.roleOutputPreview, { color: colors.muted }]} numberOfLines={1}>
                          {output.output.slice(0, 80)}...
                        </Text>
                      )}
                    </View>
                    <View style={styles.roleRight}>
                      {output?.status === "completed" && (
                        <View style={[styles.completedBadge, { backgroundColor: "#22C55E18" }]}>
                          <Text style={{ color: "#22C55E", fontSize: 11, fontWeight: "700" }}>✓ 完成</Text>
                        </View>
                      )}
                      <IconSymbol
                        name={isExpanded ? "chevron.up" : "chevron.down"}
                        size={16}
                        color={colors.muted}
                      />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && output?.output && (
                    <View style={[styles.roleOutput, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
                      <MarkdownRenderer content={output.output} fontSize={13} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── 底部操作 ── */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push("/web/tasks" as any)}
            activeOpacity={0.8}
          >
            <IconSymbol name="list.bullet" size={16} color={colors.muted} />
            <Text style={[styles.bottomBtnText, { color: colors.muted }]}>任务状态</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.bottomBtn, { backgroundColor: "#6C63FF", borderColor: "#6C63FF" }]}
            onPress={() => router.push("/web" as any)}
            activeOpacity={0.85}
          >
            <IconSymbol name="bolt.fill" size={16} color="#FFFFFF" />
            <Text style={[styles.bottomBtnText, { color: "#FFFFFF" }]}>新建任务</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: 24, paddingBottom: 60, gap: 20 },
  center: { alignItems: "center", justifyContent: "center", padding: 40 },
  notFoundTitle: { fontSize: 18, fontWeight: "700", marginBottom: 20 },
  backBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  // 完成横幅
  completeBanner: { borderRadius: 20, borderWidth: 1.5, padding: 20, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
  bannerLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1, minWidth: 200 },
  checkCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
  bannerTitle: { fontSize: 18, fontWeight: "800" },
  bannerMeta: { fontSize: 13, marginTop: 2 },
  bannerActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtnText: { fontSize: 13, fontWeight: "600" },

  // 邮件表单
  emailForm: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  emailTitle: { fontSize: 16, fontWeight: "700" },
  emailDesc: { fontSize: 13, lineHeight: 20 },
  emailInput: { borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 14 },
  fieldLabel: { fontSize: 12, marginTop: 4 },
  emailError: { fontSize: 13 },
  emailBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: "center" },
  cancelBtnText: { fontSize: 14 },
  sendBtn: { flex: 2, borderRadius: 10, padding: 12, alignItems: "center" },
  sendBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  // 信息卡片
  infoCard: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
  infoRow: { gap: 6 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  infoCell: { minWidth: 140, gap: 4 },
  infoLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase" as any, letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontWeight: "500" },
  divider: { height: 1 },

  // 报告卡片
  reportCard: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  reportBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  reportHint: { fontSize: 12 },
  reportScroll: { borderRadius: 10, borderWidth: 1, padding: 16, maxHeight: 400 },
  reportText: { fontSize: 14, lineHeight: 24, fontFamily: "monospace" },

  // 角色卡片
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  roleCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  roleHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  roleName: { fontSize: 14, fontWeight: "600" },
  roleOutputPreview: { fontSize: 12, marginTop: 2 },
  roleRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  completedBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  roleOutput: { borderTopWidth: 1, padding: 14 },
  roleOutputText: { fontSize: 13, lineHeight: 22 },

  // 底部操作
  bottomActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  bottomBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, borderWidth: 1, padding: 14 },
  bottomBtnText: { fontSize: 14, fontWeight: "600" },
});
