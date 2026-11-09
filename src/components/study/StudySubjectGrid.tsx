import { useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { StudySession } from "../../lib/api/study";
import { dateGroupLabel, groupByDate } from "../../lib/groupByDate";
import { formatMinutes } from "../../lib/study/formatMinutes";
import { formatIcuPlural } from "../../lib/i18n/icuPlural";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// History as subject cards (latest session first). A card opens a details
// dialog with that subject's sessions grouped by date; edit and delete live
// on each row there.
export function StudySubjectGrid({
  sessions,
  nameFor,
  onEdit,
  onDelete,
}: {
  sessions: StudySession[];
  nameFor: (id: string | null) => string;
  onEdit: (session: StudySession) => void;
  onDelete: (sk: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Study", "Common"]);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const bySubject = new Map<string, { key: string; name: string; sessions: StudySession[] }>();
  for (const s of sessions) {
    const key = s.subject_id ?? "__unspecified__";
    const existing = bySubject.get(key);
    if (existing) existing.sessions.push(s);
    else bySubject.set(key, { key, name: nameFor(s.subject_id), sessions: [s] });
  }
  const groups = [...bySubject.values()].sort((a, b) => b.sessions[0].session_date.localeCompare(a.sessions[0].session_date));
  // Closes by itself once its last session is deleted.
  const openGroup = openKey ? bySubject.get(openKey) : undefined;
  const entryCount = (n: number) => formatIcuPlural(t("Common:entryCount"), n, i18n.language);

  return (
    <>
      {groups.map((group) => {
        const latest = group.sessions[0];
        return (
          <AnimatedPressable key={group.key} style={styles.card} onPress={() => setOpenKey(group.key)} accessibilityRole="button">
            <View style={styles.cardHead}>
              <View style={styles.initial}>
                <Text style={styles.initialText}>{group.name.trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {group.name}
                </Text>
                <Text style={styles.muted}>{entryCount(group.sessions.length)}</Text>
              </View>
            </View>
            <Text style={styles.big}>{formatMinutes(latest.duration_minutes ?? 0)}</Text>
            <Text style={styles.muted}>{t("Study:latestOn", { date: dateGroupLabel(latest.session_date) })}</Text>
          </AnimatedPressable>
        );
      })}

      <Modal visible={!!openGroup} transparent animationType="fade" onRequestClose={() => setOpenKey(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {openGroup && (
              <>
                <View style={styles.sheetHead}>
                  <View style={styles.flex}>
                    <Text style={styles.sheetTitle}>{openGroup.name}</Text>
                    <Text style={styles.muted}>{entryCount(openGroup.sessions.length)}</Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => setOpenKey(null)}
                    accessibilityRole="button"
                    accessibilityLabel={t("Common:close")}
                    style={styles.iconBtn}
                  >
                    <Text style={styles.iconGlyph}>✕</Text>
                  </AnimatedPressable>
                </View>
                <ScrollView contentContainerStyle={styles.sheetBody}>
                  {groupByDate(openGroup.sessions, (s) => s.session_date).map((dg) => (
                    <View key={dg.label} style={styles.dateGroup}>
                      <Text style={styles.dateLabel}>{dg.label}</Text>
                      {dg.items.map((s) => (
                        <View key={s.sk} style={styles.sessionRow}>
                          <View style={styles.flex}>
                            <Text style={styles.sessionValue}>{formatMinutes(s.duration_minutes ?? 0)}</Text>
                            {!!s.session_type && (
                              <Text style={styles.muted}>
                                {capitalize(t(`Study:sessionTypes.${s.session_type}`, { defaultValue: s.session_type }))}
                              </Text>
                            )}
                            {!!s.notes && <Text style={styles.muted}>{s.notes}</Text>}
                          </View>
                          <AnimatedPressable
                            style={styles.iconBtn}
                            accessibilityRole="button"
                            accessibilityLabel={t("Common:editEntry")}
                            onPress={() => {
                              setOpenKey(null);
                              onEdit(s);
                            }}
                          >
                            <Text style={styles.iconGlyph}>✎</Text>
                          </AnimatedPressable>
                          <AnimatedPressable
                            style={styles.iconBtn}
                            accessibilityRole="button"
                            accessibilityLabel={t("Common:deleteEntry")}
                            onPress={() => onDelete(s.sk)}
                          >
                            <Text style={[styles.iconGlyph, { color: colors.destructive }]}>🗑</Text>
                          </AnimatedPressable>
                        </View>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 4,
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
    initial: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.soft, alignItems: "center", justifyContent: "center" },
    initialText: { fontSize: 16, fontWeight: "800", color: colors.primary },
    name: { fontSize: typography.body.fontSize, fontWeight: "700", color: colors.foreground },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    big: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.foreground },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
    sheet: {
      maxHeight: "85%",
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    sheetHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    sheetTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    sheetBody: { gap: 16 },
    dateGroup: { gap: 6 },
    dateLabel: { fontSize: typography.label.fontSize, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: colors.mutedForeground },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 8,
      paddingLeft: 12,
      paddingRight: 4,
    },
    sessionValue: { fontSize: typography.body.fontSize, fontWeight: "800", color: colors.foreground },
    iconBtn: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
    iconGlyph: { fontSize: 16, color: colors.mutedForeground },
  });
}
