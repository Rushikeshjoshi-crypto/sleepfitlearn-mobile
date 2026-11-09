import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeContext";
import { radius, type ColorPalette } from "../theme/palettes";
import { AppHeader } from "../components/AppHeader";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ActivityTrends } from "../components/trends/ActivityTrends";
import { VitalsTrends } from "../components/trends/VitalsTrends";

type Mode = "activity" | "vitals";

// Mobile counterpart of the web app's src/components/trends/TrendsView.tsx:
// title + Activity | Vitals switch; Activity = a tile per domain and one big
// chart, Vitals = every body metric as a chart card. Refetches on focus and on
// pull-to-refresh.
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

  const modes: { value: Mode; label: string }[] = [
    { value: "activity", label: t("activityLabel") },
    { value: "vitals", label: t("vitalsLabel") },
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
              style={[styles.modeTab, isActive && styles.modeTabActive]}
              onPress={() => setMode(m.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.modeLabel, isActive && styles.modeLabelActive]}>{m.label}</Text>
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
    container: { padding: 20, gap: 16, paddingBottom: 40 },
    modeRow: { flexDirection: "row", gap: 6, backgroundColor: colors.soft, borderRadius: radius.lg, padding: 4 },
    modeTab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
    modeTabActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    modeLabel: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
    modeLabelActive: { fontWeight: "800", color: colors.primary },
  });
}
