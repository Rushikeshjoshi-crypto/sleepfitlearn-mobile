import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { computeDurationHours, createSleepEntry, updateSleepEntry, type SleepEntry } from "../../lib/api/sleep";
import CalendarModal from "../CalendarModal";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { isoDaysAgo } from "../../lib/dateRange";
import { useSingleFlight } from "../../lib/singleFlight";
import { showSaveError } from "../../lib/ui/apiErrors";

function formatDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function SleepComposer({
  editingEntry,
  onSaved,
  onCancelEdit,
  request,
}: {
  editingEntry?: SleepEntry | null;
  // The night that was saved ("yyyy-MM-dd"), so the page can show it.
  onSaved: (savedDate?: string) => void;
  onCancelEdit?: () => void;
  // An empty night picked on the calendar: log that date ("n" makes the same
  // date selectable twice).
  request?: { date: string; n: number } | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Sleep", "Common"]);
  const [dateChoice, setDateChoice] = useState<"last_night" | "today" | "custom">("last_night");
  const [customDate, setCustomDate] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [bedtime, setBedtime] = useState("23:00");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editingEntry) {
      setBedtime(editingEntry.bedtime ?? "23:00");
      setWakeTime(editingEntry.wake_time ?? "07:00");
      setNotes(editingEntry.notes ?? "");
    }
  }, [editingEntry]);

  // A night picked on the calendar becomes the date being logged.
  useEffect(() => {
    if (!request || editingEntry) return;
    if (request.date === isoDaysAgo(1)) {
      setDateChoice("last_night");
      setCustomDate(null);
    } else if (request.date === isoDaysAgo(0)) {
      setDateChoice("today");
      setCustomDate(null);
    } else {
      setCustomDate(request.date);
      setDateChoice("custom");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.n]);

  const duration = computeDurationHours(bedtime, wakeTime);

  function sleepDate(): string {
    if (dateChoice === "last_night") return isoDaysAgo(1);
    if (dateChoice === "today") return isoDaysAgo(0);
    return customDate ?? isoDaysAgo(1);
  }

  // One save per tap burst (see lib/singleFlight).
  const singleFlight = useSingleFlight();
  const onSubmit = singleFlight(async () => {
    if (duration === null) {
      Alert.alert(t("Sleep:invalidNightError"));
      return;
    }
    setSubmitting(true);
    try {
      let savedDate: string;
      if (editingEntry) {
        savedDate = editingEntry.sleep_date;
        await updateSleepEntry(editingEntry.sk, {
          bedtime,
          wake_time: wakeTime,
          duration_hours: duration,
          notes: notes || null,
        });
      } else {
        savedDate = sleepDate();
        await createSleepEntry({
          sleep_date: savedDate,
          bedtime,
          wake_time: wakeTime,
          duration_hours: duration,
          notes: notes || null,
        });
        setBedtime("23:00");
        setWakeTime("07:00");
        setNotes("");
        setDateChoice("last_night");
        setCustomDate(null);
      }
      onSaved(savedDate);
    } catch (err) {
      // 404: the entry was deleted elsewhere — friendly message + refresh.
      showSaveError(t, t("Sleep:saveErrorToast"), err, () => onSaved());
    } finally {
      setSubmitting(false);
    }
  });

  const choices: { key: "last_night" | "today" | "custom"; label: string; onPress: () => void }[] = [
    { key: "last_night", label: t("Sleep:lastNight"), onPress: () => setDateChoice("last_night") },
    { key: "today", label: t("Common:today"), onPress: () => setDateChoice("today") },
    {
      key: "custom",
      label: dateChoice === "custom" && customDate ? formatDateLabel(customDate) : t("Sleep:chooseDate"),
      onPress: () => setDatePickerOpen(true),
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        {editingEntry
          ? t("Sleep:editingNight", { date: formatDateLabel(editingEntry.sleep_date) })
          : t("Sleep:logTonight")}
      </Text>
      {!editingEntry && <Text style={styles.subtitle}>{t("Sleep:logTonightSubtitle")}</Text>}

      {!editingEntry && (
        <View style={styles.toggleRow}>
          {choices.map((c) => (
            <AnimatedPressable
              key={c.key}
              style={[styles.toggle, dateChoice === c.key && styles.toggleActive]}
              onPress={c.onPress}
              accessibilityState={{ selected: dateChoice === c.key }}
            >
              <Text style={[styles.toggleText, dateChoice === c.key && styles.toggleTextActive]} numberOfLines={1}>
                {c.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t("Sleep:bedtime")}</Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={bedtime}
            onChangeText={setBedtime}
            placeholder="23:00"
            placeholderTextColor={colors.mutedForeground}
            maxLength={5}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t("Sleep:wakeTime")}</Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            value={wakeTime}
            onChangeText={setWakeTime}
            placeholder="07:00"
            placeholderTextColor={colors.mutedForeground}
            maxLength={5}
          />
        </View>
      </View>

      {duration !== null && <Text style={styles.durationPreview}>{duration}h</Text>}

      <View>
        <Text style={styles.label}>{t("Common:notesOptionalLabel")}</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder={t("Sleep:notesPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          multiline
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      <View style={styles.formActions}>
        {editingEntry && onCancelEdit && (
          <AnimatedPressable style={styles.secondaryButton} onPress={onCancelEdit}>
            <Text style={styles.secondaryButtonText}>{t("Common:cancel")}</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable style={styles.button} onPress={onSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>{editingEntry ? t("Common:save") : t("Sleep:saveEntry")}</Text>
          )}
        </AnimatedPressable>
      </View>

      <CalendarModal
        visible={datePickerOpen}
        selectedDate={customDate}
        onSelect={(iso) => {
          if (iso) {
            setCustomDate(iso);
            setDateChoice("custom");
          } else {
            setCustomDate(null);
            setDateChoice("last_night");
          }
        }}
        onClose={() => setDatePickerOpen(false)}
      />
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
      gap: 12,
    },
    sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    subtitle: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, marginTop: -8 },
    toggleRow: { flexDirection: "row", gap: 4, backgroundColor: colors.soft, borderRadius: radius.md, padding: 4 },
    toggle: {
      flex: 1,
      minHeight: 40,
      borderRadius: radius.sm,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    toggleActive: { backgroundColor: colors.primary },
    toggleText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, fontWeight: "600" },
    toggleTextActive: { color: colors.primaryForeground, fontWeight: "800" },
    timeRow: { flexDirection: "row", gap: 10 },
    label: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: typography.body.fontSize,
      color: colors.foreground,
    },
    timeInput: { fontSize: 24, fontWeight: "800", textAlign: "center", paddingVertical: 8 },
    notesInput: { minHeight: 60, textAlignVertical: "top" },
    durationPreview: { fontSize: 15, color: colors.primary, fontWeight: "800" },
    formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
    button: {
      flex: 1,
      minHeight: 48,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 20,
    },
    buttonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "800" },
    secondaryButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 16 },
    secondaryButtonText: { color: colors.mutedForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
  });
}
