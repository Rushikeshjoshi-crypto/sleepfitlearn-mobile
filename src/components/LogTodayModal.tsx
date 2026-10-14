import { useEffect, useMemo, useState } from "react";
import { Modal, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import SleepComposer from "./composers/SleepComposer";
import StudyComposer from "./composers/StudyComposer";
import ExerciseComposer from "./composers/ExerciseComposer";
import HabitComposer from "./composers/HabitComposer";
import { AnimatedPressable } from "./AnimatedPressable";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { resolveLogTab, type LogTab } from "../lib/logTodayTab";

type Tab = LogTab;

const TAB_KEYS: { key: Tab; labelKey: string }[] = [
  { key: "sleep", labelKey: "sleepTab" },
  { key: "study", labelKey: "studyTab" },
  { key: "exercise", labelKey: "exerciseTab" },
  { key: "habits", labelKey: "habitsTab" },
];

export default function LogTodayModal({
  visible,
  onClose,
  onSaved,
  initialTab,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Tab to open on (e.g. Home → Study "Log it now"); Sleep by default.
  initialTab?: LogTab;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["LogTodayModal", "UI"]);
  const [tab, setTab] = useState<Tab>(resolveLogTab(initialTab));
  // The modal stays mounted while hidden, so pick the tab on every open.
  useEffect(() => {
    if (visible) setTab(resolveLogTab(initialTab));
  }, [visible, initialTab]);

  function handleSaved() {
    onSaved();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("LogTodayModal:title")}</Text>
          <AnimatedPressable onPress={onClose}>
            <Text style={styles.closeText}>{t("UI:close")}</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.tabRow}>
          {TAB_KEYS.map((tabItem) => (
            <AnimatedPressable
              key={tabItem.key}
              style={[styles.tabButton, tab === tabItem.key && styles.tabButtonActive]}
              onPress={() => setTab(tabItem.key)}
            >
              <Text style={[styles.tabText, tab === tabItem.key && styles.tabTextActive]}>
                {t(`LogTodayModal:${tabItem.labelKey}`)}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {tab === "sleep" && <SleepComposer onSaved={handleSaved} />}
          {tab === "study" && <StudyComposer onSaved={handleSaved} />}
          {tab === "exercise" && <ExerciseComposer onSaved={handleSaved} />}
          {tab === "habits" && <HabitComposer onSaved={handleSaved} />}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 12,
    },
    title: { fontSize: 18, fontWeight: "600", color: colors.foreground },
    closeText: { color: colors.navTint, fontWeight: "500" },
    tabRow: {
      flexDirection: "row",
      backgroundColor: colors.muted,
      borderRadius: 999,
      padding: 4,
      marginHorizontal: 24,
      gap: 4,
    },
    tabButton: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
    tabButtonActive: { backgroundColor: colors.primary },
    tabText: { fontSize: typography.bodySmall.fontSize, fontWeight: "600", color: colors.mutedForeground },
    tabTextActive: { color: colors.primaryForeground },
    content: { padding: 24, gap: 16 },
  });
}
