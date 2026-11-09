import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import type { SleepEntry } from "../../lib/api/sleep";
import { getDateFnsLocale } from "../../lib/i18n/dateFnsLocale";
import { sleepZone } from "../../lib/sleep/quality";
import { splitHours } from "../../lib/sleep/stats";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

// The night picked on the calendar: total, quality, bedtime / wake time,
// notes, Edit (loads it into the log card) and Delete (the screen asks first).
export default function SleepDayCard({
  date,
  entry,
  onEdit,
  onDelete,
}: {
  date: string | null;
  entry: SleepEntry | undefined;
  onEdit: (entry: SleepEntry) => void;
  onDelete: (entry: SleepEntry) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Sleep", "Common"]);
  const locale = getDateFnsLocale(i18n.language);
  const hours = entry?.duration_hours;
  const parts = typeof hours === "number" ? splitHours(hours) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>
        {date ? format(parseISO(date), "EEEE, MMM d", { locale }).toUpperCase() : t("Sleep:selectNight").toUpperCase()}
      </Text>

      {date && !entry && <Text style={styles.muted}>{t("Sleep:noEntryForNight")}</Text>}

      {entry && (
        <>
          <View style={styles.totalRow}>
            {parts ? (
              <>
                <Text style={styles.bigNumber}>{parts.hours}h</Text>
                <Text style={styles.minutes}>{String(parts.minutes).padStart(2, "0")}m</Text>
              </>
            ) : (
              <Text style={styles.bigNumber}>—</Text>
            )}
          </View>
          {typeof hours === "number" && <Text style={styles.muted}>{t(`Sleep:durationZones.${sleepZone(hours)}`)}</Text>}

          <View style={styles.timeRow}>
            {(
              [
                [t("Sleep:bedtime"), entry.bedtime],
                [t("Sleep:wakeTime"), entry.wake_time],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={styles.timeTile}>
                <Text style={styles.timeLabel}>{label}</Text>
                <Text style={styles.timeValue}>{value ?? "—"}</Text>
              </View>
            ))}
          </View>

          {entry.notes ? <Text style={styles.muted}>{entry.notes}</Text> : null}

          <View style={styles.actions}>
            <AnimatedPressable style={styles.button} onPress={() => onEdit(entry)}>
              <Text style={styles.buttonText}>{t("Sleep:edit")}</Text>
            </AnimatedPressable>
            <AnimatedPressable style={[styles.button, styles.deleteButton]} onPress={() => onDelete(entry)}>
              <Text style={[styles.buttonText, { color: colors.destructive }]}>{t("Common:delete")}</Text>
            </AnimatedPressable>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 6,
    },
    heading: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: colors.primary },
    muted: { fontSize: 13, color: colors.mutedForeground },
    totalRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 2 },
    bigNumber: { fontSize: 44, lineHeight: 48, fontWeight: "800", color: colors.orange },
    minutes: { fontSize: 20, fontWeight: "600", color: colors.mutedForeground },
    timeRow: { flexDirection: "row", gap: 10, marginTop: 8 },
    timeTile: { flex: 1, backgroundColor: colors.soft, borderRadius: radius.md, padding: 10 },
    timeLabel: { fontSize: 12, color: colors.mutedForeground },
    timeValue: { fontSize: 20, fontWeight: "800", color: colors.foreground, marginTop: 2 },
    actions: { flexDirection: "row", gap: 10, marginTop: 8 },
    button: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteButton: { borderColor: colors.destructiveBorder },
    buttonText: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  });
}
