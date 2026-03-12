import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { useColors } from "@/hooks/use-colors";

interface MarkdownRendererProps {
  content: string;
  /** 字体大小，默认 14 */
  fontSize?: number;
}

/**
 * 渲染 Markdown 内容，支持表格、标题、粗体、斜体、代码块、列表等。
 * 表格使用横向滚动，避免在窄屏上溢出。
 */
export function MarkdownRenderer({ content, fontSize = 14 }: MarkdownRendererProps) {
  const colors = useColors();

  const markdownStyles = StyleSheet.create({
    // 正文
    body: {
      color: colors.foreground,
      fontSize,
      lineHeight: fontSize * 1.7,
    },
    // 标题
    heading1: {
      color: colors.foreground,
      fontSize: fontSize + 8,
      fontWeight: "700",
      marginTop: 20,
      marginBottom: 8,
      lineHeight: (fontSize + 8) * 1.3,
    },
    heading2: {
      color: colors.foreground,
      fontSize: fontSize + 5,
      fontWeight: "700",
      marginTop: 16,
      marginBottom: 6,
      lineHeight: (fontSize + 5) * 1.3,
    },
    heading3: {
      color: colors.foreground,
      fontSize: fontSize + 2,
      fontWeight: "600",
      marginTop: 12,
      marginBottom: 4,
      lineHeight: (fontSize + 2) * 1.4,
    },
    heading4: {
      color: colors.foreground,
      fontSize: fontSize + 1,
      fontWeight: "600",
      marginTop: 10,
      marginBottom: 4,
    },
    // 段落
    paragraph: {
      color: colors.foreground,
      fontSize,
      lineHeight: fontSize * 1.7,
      marginBottom: 10,
    },
    // 粗体
    strong: {
      fontWeight: "700",
      color: colors.foreground,
    },
    // 斜体
    em: {
      fontStyle: "italic",
      color: colors.foreground,
    },
    // 行内代码
    code_inline: {
      backgroundColor: colors.surface,
      color: "#E06C75",
      fontFamily: "monospace",
      fontSize: fontSize - 1,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
    },
    // 代码块
    fence: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
    },
    code_block: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      marginVertical: 8,
      fontFamily: "monospace",
      fontSize: fontSize - 1,
      color: colors.foreground,
    },
    // 引用块
    blockquote: {
      backgroundColor: colors.surface,
      borderLeftWidth: 3,
      borderLeftColor: "#6C63FF",
      paddingLeft: 12,
      paddingVertical: 6,
      marginVertical: 8,
      borderRadius: 4,
    },
    // 列表
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      flexDirection: "row",
      marginBottom: 4,
    },
    bullet_list_icon: {
      color: "#6C63FF",
      marginRight: 6,
      fontSize,
      lineHeight: fontSize * 1.7,
    },
    ordered_list_icon: {
      color: "#6C63FF",
      marginRight: 6,
      fontSize,
      lineHeight: fontSize * 1.7,
      fontWeight: "600",
    },
    bullet_list_content: {
      flex: 1,
      color: colors.foreground,
      fontSize,
      lineHeight: fontSize * 1.7,
    },
    ordered_list_content: {
      flex: 1,
      color: colors.foreground,
      fontSize,
      lineHeight: fontSize * 1.7,
    },
    // 分割线
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: 16,
    },
    // 链接
    link: {
      color: "#6C63FF",
      textDecorationLine: "underline",
    },
    // 表格
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      marginVertical: 12,
      overflow: "hidden",
    },
    thead: {
      backgroundColor: "#6C63FF15",
    },
    tbody: {},
    th: {
      padding: 10,
      fontWeight: "700",
      color: colors.foreground,
      fontSize: fontSize - 1,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      minWidth: 80,
    },
    td: {
      padding: 10,
      color: colors.foreground,
      fontSize: fontSize - 1,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      minWidth: 80,
    },
    tr: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
    },
  });

  // 用 ScrollView 横向包裹，防止宽表格溢出
  const rules = {
    table: (node: any, children: any, parent: any, styles: any) => (
      <ScrollView
        key={node.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginVertical: 12 }}
      >
        <View style={[styles.table, { alignSelf: "flex-start" }]}>
          {children}
        </View>
      </ScrollView>
    ),
  };

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {content || ""}
    </Markdown>
  );
}
