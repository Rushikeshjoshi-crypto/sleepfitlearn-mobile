import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AppHeader } from "../components/AppHeader";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ActivityTrends } from "../components/trends/ActivityTrends";
import { VitalsTrends } from "../components/trends/VitalsTrends";

type Mode = "activity" | "vitals";
const MODE_GLYPH: Record<Mode, string> = { activity: "📊", vitals: "❤️" };

// Mobile counterpart of the web app's src/components/trends/TrendsView.tsx:
// Activity / Vitals cards on top, each tab a port of its web component
// (components/trends/ActivityTrends.tsx, VitalsTrends.tsx). Refetches on
// focus and on pull-to-refresh.
export default function TrendsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Trends");

  const [mode, setMode] = useState<Mode>("activity");
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setReloadKey((k) => k + 1);
    }, []),
  );

  function onPullRefresh() {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    // The tabs show their own loading state; the pull indicator only needs
    // to acknowledge the gesture.
    setTimeout(() => setRefreshing(false), 400);
  }

  const modes: { value: Mode; label: string; hint: string }[] = [
    { value: "activity", label: t("activityLabel"), hint: t("activityHint") },
    { value: "vitals", label: t("vitalsLabel"), hint: t("vitalsHint") },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <AppHeader title={t("pageTitle")} />

      <View style={styles.modeRow}>
        {modes.map((m) => {
          const isActive = mode === m.value;
          return (
            <AnimatedPressable
              key={m.value}
              style={[styles.modeCard, isActive && styles.modeCardActive]}
              onPress={() => setMode(m.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.modeLabel, isActive && styles.modeLabelActive]}>
                {MODE_GLYPH[m.value]} {m.label}
              </Text>
              <Text style={styles.modeHint}>{m.hint}</Text>
            </AnimatedPressable>
          );
        })}
      </View>

      {mode === "activity" ? <ActivityTrends reloadKey={reloadKey} /> : <VitalsTrends reloadKey={reloadKey} />}
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    modeRow: { flexDirection: "row", gap: 10 },
    modeCard: {
      flex: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 4,
    },
    modeCardActive: { borderColor: colors.navTint, backgroundColor: `${colors.navTint}14` },
    modeLabel: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    modeLabelActive: { color: colors.navTint },
    modeHint: { fontSize: 12, color: colors.mutedForeground },
  });
}
