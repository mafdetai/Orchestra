// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "person.3.fill": "group",
  "clock.fill": "history",
  "play.fill": "play-arrow",
  "stop.fill": "stop",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "arrow.clockwise": "refresh",
  "doc.text.fill": "description",
  "square.and.arrow.up": "share",
  "doc.on.doc": "content-copy",
  "pencil": "edit",
  "trash": "delete",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",
  "sparkles": "auto-awesome",
  "bolt.fill": "bolt",
  "person.fill": "person",
  "list.bullet": "format-list-bulleted",
  "envelope.fill": "email",
  "arrow.down.circle.fill": "download",
  "checkmark.seal.fill": "verified",
  "cpu": "memory",
  "square.grid.2x2.fill": "grid-view",
  "star.fill": "star",
  "heart.fill": "favorite",
  "person.badge.plus": "person-add",
  "lock.fill": "lock",
  "globe": "public",
  "crown.fill": "workspace-premium",
  "chart.bar.fill": "bar-chart",
  "arrow.up.right": "open-in-new",
  "plus": "add",
  "minus": "remove",
  "info.circle": "info",
  "shield.fill": "security",
  "flame.fill": "local-fire-department",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
