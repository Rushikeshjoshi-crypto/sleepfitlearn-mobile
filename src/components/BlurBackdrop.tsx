import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { BlurView } from "@react-native-community/blur";
import { useTheme } from "../theme/ThemeContext";

// Full-screen blurred, slightly dimmed backdrop for a centered popup
// (@react-native-community/blur). Where the platform can't blur, the
// fallback colour / dim layer still keeps the popup readable.
export function BlurBackdrop({ children }: { children: ReactNode }) {
  const { resolvedScheme } = useTheme();
  return (
    <View style={styles.fill}>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType={resolvedScheme === "dark" ? "dark" : "light"}
        blurAmount={10}
        reducedTransparencyFallbackColor="rgba(0,0,0,0.5)"
      />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dim: { backgroundColor: "rgba(0,0,0,0.25)" },
  center: { flex: 1, justifyContent: "center", padding: 20 },
});
