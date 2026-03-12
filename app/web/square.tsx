import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { WebLayout } from "@/components/web-layout";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import type { WorkflowTemplate as SharedWorkflowTemplate, Role as SharedRole } from "@/shared/workflow-types";


type SortBy = "hot" | "latest" | "verified" | "trending7d";

type SquareItem = {
  id: string;
  workflowId: string;
  workflowName: string;
  description: string | null;
  authorId: string;
  authorName: string | null;
  isVerified: boolean;
  isSystem: boolean;
  likeCount: number;
  useCount: number;
  copyCount: number;
  expertCount: number;
  hotScore: number;
  publishedAt: Date | string;
  isLiked?: boolean;
  discussionCount?: number;
  discussionPreviews?: Array<{ userName: string | null; content: string; createdAt: Date | string }>;
  // 扩展字段
  tags?: string[];           // 分类标签（宏观/加密/研报/量化等）
  visibility?: "public" | "private" | "unlisted"; // 可见性状态
  modelCostLevel?: "low" | "medium" | "high";     // 模型成本级别
};

type SquareDetail = {
  squareId: string;
  workflowId: string;
  workflowName: string;
  description: string | null;
  authorId: string;
  authorName: string | null;
  isVerified: boolean;
  isSystem: boolean;
  expertCount: number;
  discussionCount?: number;
  publishedAt: Date | string;
  canViewPrompt: boolean;
  promptNotice: string;
  config: string;
};

type DiscussionRow = {
  id: number;
  squareId: string;
  userId: string;
  userName: string | null;
  content: string;
  createdAt: Date | string;
};

function formatCompact(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── 访客注册引导 Modal ────────────────────────────────────────────────────────
function GuestModal({ visible, onClose, action }: { visible: boolean; onClose: () => void; action: "copy" | "like" | "execute" }) {
  const colors = useColors();
  const router = useRouter();

  const messages = {
    copy: { title: "乐谱已就绪 🎼", sub: "注册 Orchestra（Mafdet.AI），将此工作流复制到你的 DIY 列表，随时修改和使用。" },
    like: { title: "为好作品点赞 ❤️", sub: "注册 Orchestra（Mafdet.AI），支持优秀的工作流创作者，参与热度排行。" },
    execute: { title: "立即执行工作流 ⚡", sub: "注册 Orchestra（Mafdet.AI），解锁完整执行能力，享受 AI 多角色协作分析。" },
  };

  const msg = messages[action];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={1}>
          {/* 装饰图标 */}
          <View style={[styles.modalIconWrap, { backgroundColor: "#6C63FF15" }]}>
            <Text style={{ fontSize: 36 }}>🎼</Text>
          </View>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>{msg.title}</Text>
          <Text style={[styles.modalSub, { color: colors.muted }]}>{msg.sub}</Text>

          <View style={styles.modalBenefits}>
            {["免费注册，永久使用基础功能", "访问工作流广场，复制优质流程", "创建并分享你的专属工作流"].map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <Text style={{ color: "#22C55E", fontSize: 14 }}>✓</Text>
                <Text style={[styles.benefitText, { color: colors.foreground }]}>{b}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.modalCta, { backgroundColor: "#6C63FF" }]}
            onPress={() => { onClose(); router.push("/web/login" as any); }}
            activeOpacity={0.85}
          >
            <Text style={styles.modalCtaText}>注册 Orchestra — 免费</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 12 }}>
            <Text style={[styles.modalSkip, { color: colors.muted }]}>稍后再说</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function RoleDetailCard({
  stepLabel,
  accent,
  role,
  canViewPrompt,
  isSystem,
}: {
  stepLabel: string;
  accent: string;
  role?: SharedRole;
  canViewPrompt: boolean;
  isSystem: boolean;
}) {
  const colors = useColors();
  if (!role) return null;

  return (
    <View style={[styles.detailRoleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.detailRoleHeader}>
        <View style={[styles.detailRoleStep, { backgroundColor: `${accent}22`, borderColor: `${accent}55` }]}>
          <Text style={[styles.detailRoleStepText, { color: accent }]}>{stepLabel}</Text>
        </View>
        <Text style={[styles.detailRoleName, { color: colors.foreground }]}>{role.name}</Text>
      </View>
      <Text style={[styles.detailRoleDesc, { color: colors.muted }]}>{role.description || "暂无描述"}</Text>
      <Text style={[styles.detailPromptLabel, { color: colors.foreground }]}>Prompt 设计</Text>
      <View style={[styles.detailPromptBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {canViewPrompt ? (
          <Text style={[styles.detailPromptText, { color: colors.foreground }]}>{role.systemPrompt || "暂无 Prompt"}</Text>
        ) : (
          <View style={styles.detailPromptLocked}>
            <IconSymbol name="lock.fill" size={12} color="#F59E0B" />
            <Text style={[styles.detailPromptLockedText, { color: colors.muted }]}>
              {isSystem ? "官方工作流 Prompt 受保护" : "仅注册用户可查看完整 Prompt 设计"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function WorkflowDetailModal({
  visible,
  item,
  detail,
  loading,
  error,
  userLoggedIn,
  discussions,
  discussionsLoading,
  discussionDraft,
  submitLoading,
  onChangeDiscussionDraft,
  onSubmitDiscussion,
  onClose,
  onRegister,
}: {
  visible: boolean;
  item: SquareItem | null;
  detail: SquareDetail | undefined;
  loading: boolean;
  error: Error | null;
  userLoggedIn: boolean;
  discussions: DiscussionRow[];
  discussionsLoading: boolean;
  discussionDraft: string;
  submitLoading: boolean;
  onChangeDiscussionDraft: (text: string) => void;
  onSubmitDiscussion: () => void;
  onClose: () => void;
  onRegister: () => void;
}) {
  const colors = useColors();

  const config = useMemo(() => {
    if (!detail?.config) return null;
    try {
      return JSON.parse(detail.config) as SharedWorkflowTemplate;
    } catch {
      return null;
    }
  }, [detail?.config]);

  const publishedDate = detail?.publishedAt ?? item?.publishedAt;
  const publishedText = publishedDate
    ? new Date(publishedDate).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" })
    : "";

  const title = detail?.workflowName ?? item?.workflowName ?? "工作流";
  const description = detail?.description ?? item?.description ?? "";
  const author = detail?.authorName ?? item?.authorName ?? "匿名";
  const canViewPrompt = detail?.canViewPrompt ?? false;
  const isSystem = detail?.isSystem ?? item?.isSystem ?? false;
  const discussionCount = detail?.discussionCount ?? item?.discussionCount ?? discussions.length ?? 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.detailModalBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={styles.detailModalHeader}>
            <Text style={[styles.detailModalTitle, { color: colors.foreground }]}>工作流设计详情</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={[styles.modalClose, { color: colors.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.detailLoadingWrap}>
              <ActivityIndicator size="large" color="#6C63FF" />
              <Text style={[styles.detailLoadingText, { color: colors.muted }]}>加载设计详情...</Text>
            </View>
          ) : error || !detail || !config ? (
            <View style={styles.detailErrorWrap}>
              <Text style={{ fontSize: 30 }}>⚠️</Text>
              <Text style={[styles.detailErrorTitle, { color: colors.foreground }]}>详情加载失败</Text>
              <Text style={[styles.detailErrorDesc, { color: colors.muted }]}>
                {error?.message || "工作流配置解析失败，请稍后重试"}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 620 }}>
              <View style={[styles.detailIntroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailWorkflowName, { color: colors.foreground }]}>{title}</Text>
                <Text style={[styles.detailMetaText, { color: colors.muted }]}>
                  by {author} {publishedText ? `· 发布于 ${publishedText}` : ""}
                </Text>
                <Text style={[styles.detailMetaText, { color: "#0EA5E9" }]}>💬 讨论 {discussionCount}</Text>
                {!!description && <Text style={[styles.detailDescText, { color: colors.muted }]}>{description}</Text>}

                <View style={[styles.detailPromptNotice, {
                  backgroundColor: canViewPrompt ? "#22C55E10" : "#F59E0B12",
                  borderColor: canViewPrompt ? "#22C55E40" : "#F59E0B40",
                }]}>
                  <IconSymbol name={canViewPrompt ? "checkmark.shield.fill" : "exclamationmark.triangle.fill"} size={13} color={canViewPrompt ? "#22C55E" : "#F59E0B"} />
                  <Text style={[styles.detailPromptNoticeText, { color: canViewPrompt ? "#15803D" : "#B45309" }]}>{detail.promptNotice}</Text>
                </View>

                {!userLoggedIn && !isSystem && (
                  <TouchableOpacity style={[styles.detailRegisterBtn, { backgroundColor: "#6C63FF" }]} onPress={onRegister} activeOpacity={0.85}>
                    <IconSymbol name="person.badge.plus" size={13} color="#FFFFFF" />
                    <Text style={styles.detailRegisterBtnText}>注册后查看完整 Prompt</Text>
                  </TouchableOpacity>
                )}

                <View style={[styles.detailFlowRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={[styles.detailFlowPill, { backgroundColor: "#6C63FF20" }]}>
                    <Text style={[styles.detailFlowPillText, { color: "#6C63FF" }]}>1 指挥官</Text>
                  </View>
                  <Text style={[styles.detailFlowArrow, { color: colors.muted }]}>→</Text>
                  <View style={[styles.detailFlowPill, { backgroundColor: "#0EA5E920" }]}>
                    <Text style={[styles.detailFlowPillText, { color: "#0EA5E9" }]}>{config.experts?.length ?? 0} 位执行专家并行</Text>
                  </View>
                  <Text style={[styles.detailFlowArrow, { color: colors.muted }]}>→</Text>
                  <View style={[styles.detailFlowPill, { backgroundColor: "#22C55E20" }]}>
                    <Text style={[styles.detailFlowPillText, { color: "#22C55E" }]}>1 汇总者</Text>
                  </View>
                </View>
              </View>

              <RoleDetailCard stepLabel="第 1 步 · 指挥官" accent="#6C63FF" role={config.initiator} canViewPrompt={canViewPrompt} isSystem={isSystem} />
              <View style={styles.detailExpertsSection}>
                <Text style={[styles.detailExpertsTitle, { color: colors.foreground }]}>并行执行专家（{config.experts?.length ?? 0} 位）</Text>
                {(config.experts ?? []).map((expert, idx) => (
                  <RoleDetailCard
                    key={expert.id || `expert_${idx}`}
                    stepLabel={`并行专家 #${idx + 1}`}
                    accent="#0EA5E9"
                    role={expert}
                    canViewPrompt={canViewPrompt}
                    isSystem={isSystem}
                  />
                ))}
              </View>
              <RoleDetailCard stepLabel="最后一步 · 汇总者" accent="#22C55E" role={config.summarizer} canViewPrompt={canViewPrompt} isSystem={isSystem} />

              <View style={[styles.detailDiscussionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.detailDiscussionTitle, { color: colors.foreground }]}>讨论区（{discussionCount}）</Text>
                {!userLoggedIn ? (
                  <View style={[styles.detailDiscussionGuest, { backgroundColor: "#6C63FF0E", borderColor: "#6C63FF33" }]}>
                    <Text style={[styles.detailDiscussionGuestText, { color: colors.muted }]}>注册后可参与讨论并查看完整交流记录</Text>
                    <TouchableOpacity style={[styles.detailDiscussionRegisterBtn, { backgroundColor: "#6C63FF" }]} onPress={onRegister} activeOpacity={0.85}>
                      <Text style={styles.detailDiscussionRegisterBtnText}>立即注册</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={[styles.detailDiscussionInputWrap, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <TextInput
                        value={discussionDraft}
                        onChangeText={onChangeDiscussionDraft}
                        placeholder="写下你的建议、改进思路或问题..."
                        placeholderTextColor={colors.muted}
                        style={[styles.detailDiscussionInput, { color: colors.foreground }]}
                        multiline
                        textAlignVertical="top"
                        editable={!submitLoading}
                      />
                      <TouchableOpacity
                        style={[styles.detailDiscussionSubmit, { backgroundColor: discussionDraft.trim() ? "#6C63FF" : colors.border }]}
                        onPress={onSubmitDiscussion}
                        disabled={!discussionDraft.trim() || submitLoading}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.detailDiscussionSubmitText}>{submitLoading ? "发布中..." : "发布讨论"}</Text>
                      </TouchableOpacity>
                    </View>

                    {discussionsLoading ? (
                      <View style={styles.detailDiscussionLoading}>
                        <ActivityIndicator size="small" color="#6C63FF" />
                        <Text style={[styles.detailDiscussionLoadingText, { color: colors.muted }]}>加载讨论中...</Text>
                      </View>
                    ) : discussions.length === 0 ? (
                      <View style={[styles.detailDiscussionEmpty, { borderColor: colors.border }]}>
                        <Text style={[styles.detailDiscussionEmptyText, { color: colors.muted }]}>还没有讨论，来发布第一条观点吧</Text>
                      </View>
                    ) : (
                      <View style={styles.detailDiscussionList}>
                        {discussions.map((d) => (
                          <View key={d.id} style={[styles.detailDiscussionItem, { borderColor: colors.border }]}>
                            <View style={styles.detailDiscussionItemHead}>
                              <Text style={[styles.detailDiscussionUser, { color: colors.foreground }]}>{d.userName || "匿名用户"}</Text>
                              <Text style={[styles.detailDiscussionTime, { color: colors.muted }]}>
                                {new Date(d.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              </Text>
                            </View>
                            <Text style={[styles.detailDiscussionContent, { color: colors.muted }]}>{d.content}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── 工作流卡片 ────────────────────────────────────────────────────────────────
function SquareCard({
  item,
  tickerStep,
  onExecute,
  onCopy,
  onLike,
  onViewDesign,
  onAuthorPress,
}: {
  item: SquareItem;
  tickerStep: number;
  onExecute: (item: SquareItem) => void;
  onCopy: (item: SquareItem) => void;
  onLike: (item: SquareItem) => void;
  onViewDesign: (item: SquareItem) => void;
  onAuthorPress: (authorId: string) => void;
}) {
  const colors = useColors();

  const publishedDate = new Date(item.publishedAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  const accentColor = item.isVerified ? "#6C63FF" : item.isSystem ? "#0EA5E9" : "#22C55E";
  const previews = item.discussionPreviews ?? [];
  const preview = previews.length > 0 ? previews[tickerStep % previews.length] : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.cardAccent, { backgroundColor: accentColor }]} />
      {/* 顶部：名称 + 徽章 */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.workflowName}</Text>
          {item.isVerified && (
            <View style={[styles.verifiedBadge, { backgroundColor: "#6C63FF15", borderColor: "#6C63FF40" }]}>
              <IconSymbol name="checkmark.seal.fill" size={11} color="#6C63FF" />
              <Text style={[styles.verifiedText, { color: "#6C63FF" }]}>Verified</Text>
            </View>
          )}
          {item.isSystem && (
            <View style={[styles.systemBadge, { backgroundColor: "#0EA5E915", borderColor: "#0EA5E940" }]}>
              <IconSymbol name="shield.fill" size={11} color="#0EA5E9" />
              <Text style={[styles.systemText, { color: "#0EA5E9" }]}>官方</Text>
            </View>
          )}
          <View style={[styles.hotBadge, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <IconSymbol name="flame.fill" size={10} color="#F59E0B" />
            <Text style={[styles.hotBadgeText, { color: "#F59E0B" }]}>{item.hotScore.toFixed(1)}</Text>
          </View>
        </View>
        {/* 作者 */}
        <TouchableOpacity onPress={() => onAuthorPress(item.authorId)} activeOpacity={0.7}>
          <Text style={[styles.cardAuthor, { color: colors.muted }]}>
            by {item.authorName ?? "匿名"} · {publishedDate}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 描述 */}
      {item.description ? (
        <Text style={[styles.cardDesc, { color: colors.muted }]} numberOfLines={2}>{item.description}</Text>
      ) : null}

      {/* 节点结构可视化 */}
      <View style={[styles.nodeRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={[styles.nodeChip, { backgroundColor: "#6C63FF20", borderColor: "#6C63FF40" }]}>
          <Text style={[styles.nodeChipText, { color: "#6C63FF" }]}>指挥官</Text>
        </View>
        <Text style={[styles.nodeArrow, { color: colors.muted }]}>→</Text>
        <View style={[styles.nodeChip, { backgroundColor: "#0EA5E920", borderColor: "#0EA5E940" }]}>
          <Text style={[styles.nodeChipText, { color: "#0EA5E9" }]}>
            {item.isSystem ? "执行专家×?" : `执行专家×${item.expertCount}`}
          </Text>
        </View>
        <Text style={[styles.nodeArrow, { color: colors.muted }]}>→</Text>
        <View style={[styles.nodeChip, { backgroundColor: "#22C55E20", borderColor: "#22C55E40" }]}>
          <Text style={[styles.nodeChipText, { color: "#22C55E" }]}>汇总者</Text>
        </View>
        {item.isSystem && (
          <View style={[styles.lockChip, { backgroundColor: "#F59E0B15", borderColor: "#F59E0B40" }]}>
            <IconSymbol name="lock.fill" size={10} color="#F59E0B" />
            <Text style={[styles.lockText, { color: "#F59E0B" }]}>Prompt 加密</Text>
          </View>
        )}
      </View>

      {/* 标签行：tags + 可见性 + 模型成本 */}
      {((item.tags && item.tags.length > 0) || item.modelCostLevel) && (
        <View style={styles.tagsRow}>
          {item.tags?.map((tag) => (
            <View key={tag} style={[styles.tagChip, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.tagText, { color: colors.muted }]}>{tag}</Text>
            </View>
          ))}
          {item.modelCostLevel && (
            <View style={[styles.tagChip, {
              backgroundColor: item.modelCostLevel === "high" ? "#EF444415" : item.modelCostLevel === "medium" ? "#F59E0B15" : "#22C55E15",
              borderColor: item.modelCostLevel === "high" ? "#EF444440" : item.modelCostLevel === "medium" ? "#F59E0B40" : "#22C55E40",
            }]}>
              <Text style={[styles.tagText, {
                color: item.modelCostLevel === "high" ? "#EF4444" : item.modelCostLevel === "medium" ? "#F59E0B" : "#22C55E",
              }]}>
                {item.modelCostLevel === "high" ? "高模型成本" : item.modelCostLevel === "medium" ? "中模型成本" : "低模型成本"}
              </Text>
            </View>
          )}
          {item.visibility === "private" && (
            <View style={[styles.tagChip, { backgroundColor: "#64748B15", borderColor: "#64748B40" }]}>
              <IconSymbol name="lock.fill" size={9} color="#64748B" />
              <Text style={[styles.tagText, { color: "#64748B" }]}>私密</Text>
            </View>
          )}
        </View>
      )}

      {/* 数据统计 + 操作按鈕 */}
      <View style={styles.cardFooter}>
        {/* 统计 */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statItem} onPress={() => onLike(item)} activeOpacity={0.7}>
            <IconSymbol name="heart.fill" size={14} color={item.isLiked ? "#EF4444" : colors.muted} />
            <Text style={[styles.statText, { color: item.isLiked ? "#EF4444" : colors.muted }]}>{formatCompact(item.likeCount)}</Text>
          </TouchableOpacity>
          <View style={styles.statItem}>
            <IconSymbol name="play.fill" size={13} color={colors.muted} />
            <Text style={[styles.statText, { color: colors.muted }]}>{formatCompact(item.useCount)}</Text>
          </View>
          <View style={styles.statItem}>
            <IconSymbol name="doc.on.doc" size={13} color={colors.muted} />
            <Text style={[styles.statText, { color: colors.muted }]}>{formatCompact(item.copyCount)}</Text>
          </View>
          <View style={styles.statItem}>
            <IconSymbol name="bubble.left.fill" size={13} color={colors.muted} />
            <Text style={[styles.statText, { color: colors.muted }]}>{formatCompact(item.discussionCount ?? 0)}</Text>
          </View>
        </View>

        {/* 双功能按钮 */}
        <View style={styles.actionBtns}>
          {preview && (
            <View style={[styles.discussionTicker, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <IconSymbol name="bubble.left.fill" size={11} color="#0EA5E9" />
              <Text style={[styles.discussionTickerText, { color: colors.muted }]} numberOfLines={1}>
                {(preview.userName ?? "匿名")}：{preview.content}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.viewBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => onViewDesign(item)}
            activeOpacity={0.8}
          >
            <IconSymbol name="eye.fill" size={13} color={colors.muted} />
            <Text style={[styles.viewBtnText, { color: colors.muted }]}>查看设计</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.copyBtn, { borderColor: "#6C63FF60", backgroundColor: "#6C63FF10" }]}
            onPress={() => onCopy(item)}
            activeOpacity={0.8}
          >
            <IconSymbol name="doc.on.doc" size={13} color="#6C63FF" />
            <Text style={[styles.copyBtnText, { color: "#6C63FF" }]}>复制</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.executeBtn, { backgroundColor: "#6C63FF" }]}
            onPress={() => onExecute(item)}
            activeOpacity={0.85}
          >
            <IconSymbol name="play.fill" size={13} color="#FFFFFF" />
            <Text style={styles.executeBtnText}>执行</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────────────────
export default function SquarePage() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ publishTemplateId?: string; publishTemplateName?: string }>();
  const [sortBy, setSortBy] = useState<SortBy>("hot");
  const [searchText, setSearchText] = useState("");
  const [publishModal, setPublishModal] = useState<{ visible: boolean; templateId: string; name: string } | null>(null);
  const [guestModal, setGuestModal] = useState<{ visible: boolean; action: "copy" | "like" | "execute" }>({
    visible: false,
    action: "copy",
  });
  const [detailModal, setDetailModal] = useState<{ visible: boolean; item: SquareItem | null }>({ visible: false, item: null });
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [copySuccessType, setCopySuccessType] = useState<"success" | "error">("success");
  const [tickerStep, setTickerStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTickerStep((prev) => prev + 1), 3000);
    return () => clearInterval(timer);
  }, []);

  const detailSquareId = detailModal.visible && detailModal.item ? detailModal.item.id : "";
  const { data: detailData, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = trpc.square.detail.useQuery(
    { squareId: detailSquareId || "__none__" },
    { enabled: !!detailSquareId }
  );
  const {
    data: discussions = [],
    isLoading: discussionsLoading,
    refetch: refetchDiscussions,
  } = trpc.square.discussions.list.useQuery(
    { squareId: detailSquareId || "__none__", limit: 30 },
    { enabled: !!detailSquareId }
  );
  const detailQueryError = detailError
    ? (detailError instanceof Error ? detailError : new Error((detailError as { message?: string }).message ?? "加载失败"))
    : null;

  // 发布到广场的 mutation
  const publishMutation = trpc.square.publish.useMutation({
    onSuccess: (data) => {
      setCopySuccessType("success");
      setCopySuccess(data.mode === "updated" ? "已更新广场中的该工作流版本" : "工作流已成功发布到广场！");
      setTimeout(() => setCopySuccess(null), 3000);
      setPublishModal(null);
      // 切换到「最新」Tab，让用户立即看到刚发布的工作流
      setSortBy("latest");
      refetch();
    },
    onError: (err) => {
      setCopySuccessType("error");
      setCopySuccess(`发布失败：${err.message}`);
      setTimeout(() => setCopySuccess(null), 4000);
    },
  });

  // 如果带有 publishTemplateId 参数，自动弹出发布 Modal
  useEffect(() => {
    if (params.publishTemplateId && user) {
      setPublishModal({
        visible: true,
        templateId: params.publishTemplateId,
        name: params.publishTemplateName ?? "我的工作流",
      });
    }
  }, [params.publishTemplateId, params.publishTemplateName, user]);

  const { data: rawItems = [], isLoading, refetch } = trpc.square.list.useQuery({ sortBy, limit: 30, offset: 0 });
  // 将后端数据映射为 SquareItem（解析 tags JSON 字符串）
  const items: SquareItem[] = rawItems.map((r: any) => ({
    ...r,
    discussionCount: Number(r.discussionCount ?? 0),
    discussionPreviews: Array.isArray(r.discussionPreviews) ? r.discussionPreviews : [],
    tags: r.tags ? ((): string[] => { try { return JSON.parse(r.tags); } catch { return []; } })() : [],
    visibility: r.isPublic ? "public" : "private",
    modelCostLevel: (r.expertCount ?? 0) >= 5 ? "high" : (r.expertCount ?? 0) >= 3 ? "medium" : "low",
  }));
  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const text = [
        item.workflowName,
        item.description ?? "",
        item.authorName ?? "",
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [items, searchText]);

  const featuredItems = sortBy === "hot" ? filteredItems.slice(0, 3) : [];
  const remainingItems = sortBy === "hot" ? filteredItems.slice(3) : filteredItems;
  const columnCount = width >= 1280 ? 3 : width >= 860 ? 2 : 1;
  const gridItemWidth = columnCount === 1 ? "100%" : columnCount === 2 ? "49%" : "32%";

  const stats = useMemo(() => ({
    workflowCount: filteredItems.length,
    likeCount: filteredItems.reduce((sum, item) => sum + item.likeCount, 0),
    runCount: filteredItems.reduce((sum, item) => sum + item.useCount, 0),
  }), [filteredItems]);

  const sortHint = sortBy === "hot"
    ? "按综合热度排序，优先看到社区最受欢迎的流程"
    : sortBy === "trending7d"
      ? "近 7 天活跃趋势，适合快速发现新爆款"
      : sortBy === "verified"
        ? "官方与认证精选，质量优先"
        : "按发布时间排序，第一时间查看新流程";

  const likeMutation = trpc.square.like.useMutation({ onSuccess: () => refetch() });
  const copyMutation = trpc.square.copy.useMutation({
    onSuccess: (data) => {
      setCopySuccessType("success");
      setCopySuccess(data.message ?? "已复制");
      setTimeout(() => setCopySuccess(null), 3000);
      refetch();
    },
    onError: (err) => {
      setCopySuccessType("error");
      setCopySuccess(`复制失败：${err.message}`);
      setTimeout(() => setCopySuccess(null), 4000);
    },
  });
  const addDiscussionMutation = trpc.square.discussions.add.useMutation({
    onSuccess: () => {
      setCopySuccessType("success");
      setCopySuccess("讨论已发布");
      setTimeout(() => setCopySuccess(null), 3000);
      setDiscussionDraft("");
      refetchDiscussions();
      refetchDetail();
      refetch();
    },
    onError: (err) => {
      setCopySuccessType("error");
      setCopySuccess(`发布讨论失败：${err.message}`);
      setTimeout(() => setCopySuccess(null), 4000);
    },
  });

  const handleExecute = (item: SquareItem) => {
    // 访客点击执行：弹出注册引导 Modal
    if (!user) {
      setGuestModal({ visible: true, action: "execute" });
      return;
    }
    if (item.isSystem) {
      router.push({ pathname: "/web/run" as any, params: { systemWorkflowId: item.workflowId } });
    } else {
      // 传递 squareWorkflowId 和 squareId，让 run.tsx 能加载配置并记录使用数
      router.push({ pathname: "/web/run" as any, params: { squareWorkflowId: item.workflowId, squareId: item.id } });
    }
  };

  const handleCopy = (item: SquareItem) => {
    if (!user) {
      setGuestModal({ visible: true, action: "copy" });
      return;
    }
    copyMutation.mutate({ squareId: item.id });
  };

  const handleLike = (item: SquareItem) => {
    if (!user) {
      setGuestModal({ visible: true, action: "like" });
      return;
    }
    likeMutation.mutate({ squareId: item.id });
  };

  const handleViewDesign = (item: SquareItem) => {
    setDiscussionDraft("");
    setDetailModal({ visible: true, item });
  };

  const handleSubmitDiscussion = () => {
    if (!detailSquareId) return;
    if (!user) {
      setGuestModal({ visible: true, action: "copy" });
      return;
    }
    addDiscussionMutation.mutate({ squareId: detailSquareId, content: discussionDraft.trim() });
  };

  const handleAuthorPress = (authorId: string) => {
    router.push({ pathname: "/web/profile/[userId]" as any, params: { userId: authorId } });
  };

  const TABS: { key: SortBy; label: string; icon: any }[] = [
    { key: "hot", label: "热度榜", icon: "chart.bar.fill" },
    { key: "trending7d", label: "7天趋势", icon: "flame.fill" },
    { key: "latest", label: "最新", icon: "clock.fill" },
    { key: "verified", label: "官方精选", icon: "checkmark.seal.fill" },
  ];

  return (
    <WebLayout title="工作流广场">
      <View style={styles.container}>
        {/* Tab 切换 */}
        <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={styles.tabGroup}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, sortBy === tab.key && styles.tabActive, sortBy === tab.key && { borderColor: "#6C63FF50" }]}
                onPress={() => setSortBy(tab.key)}
                activeOpacity={0.7}
              >
                <IconSymbol name={tab.icon} size={14} color={sortBy === tab.key ? "#6C63FF" : colors.muted} />
                <Text style={[styles.tabText, { color: sortBy === tab.key ? "#6C63FF" : colors.muted, fontWeight: sortBy === tab.key ? "600" : "400" }]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.verifiedNote, { backgroundColor: "#6C63FF08", borderColor: "#6C63FF20" }]}>
            <IconSymbol name={sortBy === "verified" ? "shield.fill" : "sparkles"} size={12} color="#6C63FF" />
            <Text style={[styles.verifiedNoteText, { color: "#6C63FF" }]}>
              {sortHint}
            </Text>
          </View>
        </View>

        {/* 复制成功提示 */}
        {copySuccess && (
          <View style={[styles.successBanner, {
            backgroundColor: copySuccessType === "success" ? "#22C55E15" : "#EF444415",
            borderColor: copySuccessType === "success" ? "#22C55E40" : "#EF444440",
          }]}>
            <IconSymbol name={copySuccessType === "success" ? "checkmark.circle.fill" : "xmark.circle.fill"} size={16} color={copySuccessType === "success" ? "#22C55E" : "#EF4444"} />
            <Text style={[styles.successText, { color: copySuccessType === "success" ? "#22C55E" : "#EF4444" }]}>{copySuccess}</Text>
          </View>
        )}

        {/* 头图与搜索 */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroGlowA} />
          <View style={styles.heroGlowB} />
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, { color: colors.foreground }]}>发现优质工作流乐谱</Text>
              <Text style={[styles.heroSub, { color: colors.muted }]}>
                复制、执行、分享你的 1-N-1 多专家协作流程
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.heroAction, { backgroundColor: "#6C63FF" }]}
              onPress={() => (user ? router.push("/web" as any) : router.push("/web/login" as any))}
              activeOpacity={0.85}
            >
              <IconSymbol name={user ? "plus" : "person.badge.plus"} size={14} color="#FFFFFF" />
              <Text style={styles.heroActionText}>{user ? "发布工作流" : "免费注册"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.metricValue, { color: colors.foreground }]}>{formatCompact(stats.workflowCount)}</Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>在架流程</Text>
            </View>
            <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.metricValue, { color: "#EF4444" }]}>{formatCompact(stats.likeCount)}</Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>社区点赞</Text>
            </View>
            <View style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <Text style={[styles.metricValue, { color: "#0EA5E9" }]}>{formatCompact(stats.runCount)}</Text>
              <Text style={[styles.metricLabel, { color: colors.muted }]}>累计执行</Text>
            </View>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <IconSymbol name="magnifyingglass" size={15} color={colors.muted} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="搜索工作流 / 作者 / 标签"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {!!searchText && (
              <TouchableOpacity onPress={() => setSearchText("")} activeOpacity={0.7} style={styles.clearBtn}>
                <IconSymbol name="xmark.circle.fill" size={15} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 列表 */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={[styles.loadingText, { color: colors.muted }]}>加载广场内容...</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={{ fontSize: 48 }}>🎼</Text>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {items.length === 0 ? "广场还没有内容" : "没有匹配结果"}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.muted }]}>
              {items.length === 0
                ? (sortBy === "verified" ? "官方精选内容即将上线，敬请期待" : "成为第一个发布工作流的用户！")
                : "试试更短的关键词，或者切换一个榜单"}
            </Text>
            {items.length > 0 && (
              <TouchableOpacity
                style={[styles.publishBtn, { backgroundColor: "#111827" }]}
                onPress={() => setSearchText("")}
                activeOpacity={0.85}
              >
                <IconSymbol name="arrow.uturn.backward" size={16} color="#FFFFFF" />
                <Text style={styles.publishBtnText}>清空搜索</Text>
              </TouchableOpacity>
            )}
            {items.length === 0 && user && sortBy !== "verified" && (
              <TouchableOpacity
                style={[styles.publishBtn, { backgroundColor: "#6C63FF" }]}
                onPress={() => router.push("/web" as any)}
                activeOpacity={0.85}
              >
                <IconSymbol name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.publishBtnText}>发布我的工作流</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {/* 热度榜 Top 3 高亮 */}
              {sortBy === "hot" && featuredItems.length > 0 && (
                <View style={[styles.topSection, { borderColor: colors.border }]}>
                  <View style={styles.topSectionHeader}>
                    <Text style={{ fontSize: 16 }}>🏆</Text>
                    <Text style={[styles.topSectionTitle, { color: colors.foreground }]}>本周热榜 Top 3</Text>
                  </View>
                  {featuredItems.map((item, idx) => (
                    <View key={item.id} style={styles.topItemRow}>
                      <Text style={[styles.topRank, { color: idx === 0 ? "#F59E0B" : idx === 1 ? "#9CA3AF" : "#CD7C2F" }]}>
                        #{idx + 1}
                      </Text>
                      <SquareCard
                      item={item}
                      tickerStep={tickerStep}
                      onExecute={handleExecute}
                      onCopy={handleCopy}
                      onLike={handleLike}
                      onViewDesign={handleViewDesign}
                      onAuthorPress={handleAuthorPress}
                      />
                    </View>
                  ))}
                  {filteredItems.length > 3 && (
                    <View style={[styles.divider, { borderColor: colors.border }]}>
                      <Text style={[styles.dividerText, { color: colors.muted }]}>更多工作流</Text>
                    </View>
                  )}
                </View>
              )}

              {/* 剩余列表 */}
              <View style={styles.grid}>
                {remainingItems.map(item => (
                  <View key={item.id} style={[styles.gridItem, { width: gridItemWidth }]}>
                    <SquareCard
                      item={item}
                      tickerStep={tickerStep}
                      onExecute={handleExecute}
                      onCopy={handleCopy}
                      onLike={handleLike}
                      onViewDesign={handleViewDesign}
                      onAuthorPress={handleAuthorPress}
                    />
                  </View>
                ))}
              </View>

            {/* 未登录引导 */}
            {!user && (
              <View style={[styles.guestBanner, { backgroundColor: "#6C63FF08", borderColor: "#6C63FF20" }]}>
                <Text style={{ fontSize: 24 }}>🎼</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.guestBannerTitle, { color: colors.foreground }]}>注册 Orchestra</Text>
                  <Text style={[styles.guestBannerSub, { color: colors.muted }]}>复制工作流、点赞、发布你的专属流程</Text>
                </View>
                <TouchableOpacity
                  style={[styles.guestCta, { backgroundColor: "#6C63FF" }]}
                  onPress={() => setGuestModal({ visible: true, action: "copy" })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.guestCtaText}>免费注册</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* 访客注册引导 Modal */}
      <GuestModal
        visible={guestModal.visible}
        onClose={() => setGuestModal(prev => ({ ...prev, visible: false }))}
        action={guestModal.action}
      />

      <WorkflowDetailModal
        visible={detailModal.visible}
        item={detailModal.item}
        detail={detailData as SquareDetail | undefined}
        loading={detailLoading}
        error={detailQueryError}
        userLoggedIn={!!user}
        discussions={discussions as DiscussionRow[]}
        discussionsLoading={discussionsLoading}
        discussionDraft={discussionDraft}
        submitLoading={addDiscussionMutation.isPending}
        onChangeDiscussionDraft={setDiscussionDraft}
        onSubmitDiscussion={handleSubmitDiscussion}
        onClose={() => setDetailModal({ visible: false, item: null })}
        onRegister={() => {
          setDetailModal({ visible: false, item: null });
          router.push("/web/login" as any);
        }}
      />

      {/* 发布到广场确认 Modal */}
      <Modal visible={!!publishModal?.visible} transparent animationType="fade" onRequestClose={() => setPublishModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: "#6C63FF15" }]}>
              <Text style={{ fontSize: 32 }}>🎼</Text>
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>发布到广场</Text>
            <Text style={[styles.modalSub, { color: colors.muted }]}>
              将「{publishModal?.name}」公开发布，广场用户可以执行和复制你的工作流。
            </Text>
            <View style={styles.modalBenefits}>
              <View style={styles.benefitRow}>
                <Text style={{ color: "#22C55E" }}>✔</Text>
                <Text style={[styles.benefitText, { color: colors.foreground }]}>展示在广场热度榜，获得暴光机会</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={{ color: "#22C55E" }}>✔</Text>
                <Text style={[styles.benefitText, { color: colors.foreground }]}>其他用户可复制你的工作流模板</Text>
              </View>
              <View style={styles.benefitRow}>
                <Text style={{ color: "#22C55E" }}>✔</Text>
                <Text style={[styles.benefitText, { color: colors.foreground }]}>建立作者主页，展示个人品牌</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.modalCta, { backgroundColor: "#6C63FF" }]}
              onPress={() => {
                if (publishModal) {
                  publishMutation.mutate({
                    workflowId: publishModal.templateId,
                    isPublic: true,
                  });
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.modalCtaText}>确认发布</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPublishModal(null)} activeOpacity={0.7}>
              <Text style={[styles.modalSkip, { color: colors.muted }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { flexDirection: "column", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  tabGroup: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "transparent", backgroundColor: "transparent" },
  tabActive: { backgroundColor: "#6C63FF14" },
  tabText: { fontSize: 13 },
  verifiedNote: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start" },
  verifiedNoteText: { fontSize: 12 },
  successBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 24, marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  successText: { fontSize: 13, fontWeight: "500" },
  heroCard: { marginHorizontal: 24, marginTop: 12, borderRadius: 18, borderWidth: 1, padding: 16, gap: 14, overflow: "hidden" },
  heroGlowA: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "#6C63FF14", right: -40, top: -50 },
  heroGlowB: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "#0EA5E910", left: -40, bottom: -40 },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroTitle: { fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  heroSub: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  heroAction: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  heroActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  metricsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metricCard: { minWidth: 110, flexGrow: 1, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9 },
  metricValue: { fontSize: 16, fontWeight: "800" },
  metricLabel: { fontSize: 11, marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  clearBtn: { padding: 2 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 48 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyDesc: { fontSize: 14, textAlign: "center" },
  publishBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  publishBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  list: { flex: 1 },
  listContent: { padding: 24, gap: 16 },
  topSection: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 8, gap: 12 },
  topSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  topSectionTitle: { fontSize: 15, fontWeight: "700" },
  topItemRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  topRank: { fontSize: 20, fontWeight: "800", width: 32, textAlign: "center", marginTop: 16 },
  divider: { borderTopWidth: 1, paddingTop: 12, marginTop: 4, alignItems: "center" },
  dividerText: { fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  gridItem: {},

  // Card styles
  card: { position: "relative", overflow: "hidden", borderRadius: 14, borderWidth: 1, padding: 16, gap: 10, flex: 1, minHeight: 210 },
  cardAccent: { position: "absolute", left: 0, right: 0, top: 0, height: 3 },
  cardHeader: { gap: 4 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardTitle: { fontSize: 15, fontWeight: "700", flex: 1 },
  verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  verifiedText: { fontSize: 10, fontWeight: "700" },
  systemBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  systemText: { fontSize: 10, fontWeight: "700" },
  hotBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  hotBadgeText: { fontSize: 10, fontWeight: "700" },
  cardAuthor: { fontSize: 12 },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  nodeRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, padding: 8, borderWidth: 1, flexWrap: "wrap" },
  nodeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  nodeChipText: { fontSize: 11, fontWeight: "600" },
  nodeArrow: { fontSize: 12 },
  lockChip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, marginLeft: 4 },
  lockText: { fontSize: 10, fontWeight: "600" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statsRow: { flexDirection: "row", gap: 12 },
  statItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 12 },
  actionBtns: { flexDirection: "row", gap: 8 },
  discussionTicker: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 170, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  discussionTickerText: { fontSize: 11, flexShrink: 1 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  viewBtnText: { fontSize: 12, fontWeight: "600" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  copyBtnText: { fontSize: 12, fontWeight: "600" },
  executeBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  executeBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },

  // Tags
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontSize: 10, fontWeight: "600" },

  // Guest banner
  guestBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 8 },
  guestBannerTitle: { fontSize: 14, fontWeight: "700" },
  guestBannerSub: { fontSize: 12, marginTop: 2 },
  guestCta: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  guestCtaText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 400, borderRadius: 20, borderWidth: 1, padding: 28, alignItems: "center", gap: 12 },
  modalIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  modalTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  modalSub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalClose: { fontSize: 18, padding: 4 },
  modalBenefits: { width: "100%", gap: 8, marginVertical: 4 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  benefitText: { fontSize: 13 },
  modalCta: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 4 },
  modalCtaText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  modalSkip: { fontSize: 13 },

  // Detail modal
  detailModalBox: { width: "100%", maxWidth: 820, borderRadius: 20, borderWidth: 1, padding: 24, maxHeight: "92%" as any },
  detailModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  detailModalTitle: { fontSize: 18, fontWeight: "700" },
  detailLoadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 10 },
  detailLoadingText: { fontSize: 13 },
  detailErrorWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 40, gap: 8 },
  detailErrorTitle: { fontSize: 16, fontWeight: "700" },
  detailErrorDesc: { fontSize: 13, textAlign: "center" },
  detailIntroCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 10 },
  detailWorkflowName: { fontSize: 17, fontWeight: "700" },
  detailMetaText: { fontSize: 12 },
  detailDescText: { fontSize: 13, lineHeight: 18 },
  detailPromptNotice: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  detailPromptNoticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  detailRegisterBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 10, marginTop: 2 },
  detailRegisterBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  detailFlowRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, padding: 9, flexWrap: "wrap" },
  detailFlowPill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  detailFlowPillText: { fontSize: 11, fontWeight: "700" },
  detailFlowArrow: { fontSize: 13 },
  detailExpertsSection: { marginVertical: 4, gap: 2 },
  detailExpertsTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  detailRoleCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10, gap: 8 },
  detailRoleHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailRoleStep: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  detailRoleStepText: { fontSize: 11, fontWeight: "700" },
  detailRoleName: { flex: 1, fontSize: 14, fontWeight: "700" },
  detailRoleDesc: { fontSize: 12, lineHeight: 17 },
  detailPromptLabel: { fontSize: 12, fontWeight: "700" },
  detailPromptBox: { borderRadius: 8, borderWidth: 1, padding: 10 },
  detailPromptText: { fontSize: 12, lineHeight: 18 },
  detailPromptLocked: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailPromptLockedText: { fontSize: 12 },
  detailDiscussionCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 4, gap: 10 },
  detailDiscussionTitle: { fontSize: 14, fontWeight: "700" },
  detailDiscussionGuest: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 10 },
  detailDiscussionGuestText: { fontSize: 12, lineHeight: 17 },
  detailDiscussionRegisterBtn: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  detailDiscussionRegisterBtnText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  detailDiscussionInputWrap: { borderRadius: 10, borderWidth: 1, padding: 10, gap: 10 },
  detailDiscussionInput: { minHeight: 78, fontSize: 13, lineHeight: 18 },
  detailDiscussionSubmit: { alignSelf: "flex-end", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  detailDiscussionSubmitText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  detailDiscussionLoading: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  detailDiscussionLoadingText: { fontSize: 12 },
  detailDiscussionEmpty: { borderRadius: 9, borderWidth: 1, borderStyle: "dashed", padding: 10, alignItems: "center" },
  detailDiscussionEmptyText: { fontSize: 12 },
  detailDiscussionList: { gap: 8 },
  detailDiscussionItem: { borderRadius: 9, borderWidth: 1, padding: 10, gap: 6 },
  detailDiscussionItemHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailDiscussionUser: { fontSize: 12, fontWeight: "700" },
  detailDiscussionTime: { fontSize: 11 },
  detailDiscussionContent: { fontSize: 12, lineHeight: 18 },
});
