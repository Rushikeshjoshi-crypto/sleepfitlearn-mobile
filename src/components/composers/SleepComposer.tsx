import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { computeDurationHours, createSleepEntry, updateSleepEntry, type SleepEntry } from "../../lib/api/sleep";
import CalendarModal from "../CalendarModal";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
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
}: {
  editingEntry?: SleepEntry | null;
  onSaved: () => void;
  onCancelEdit?: () => void;
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
      if (editingEntry) {
        await updateSleepEntry(editingEntry.sk, {
          bedtime,
          wake_time: wakeTime,
          duration_hours: duration,
          notes: notes || null,
        });
      } else {
        await createSleepEntry({
          sleep_date: sleepDate(),
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
      onSaved();
    } catch (err) {
      // 404: the entry was deleted elsewhere — friendly message + refresh.
      showSaveError(t, t("Sleep:saveErrorToast"), err, onSaved);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{editingEntry ? t("Common:editEntry") : t("Sleep:logTonight")}</Text>

      {!editingEntry && (
        <View style={styles.chipRow}>
          <AnimatedPressable
            style={[styles.chip, dateChoice === "last_night" && styles.chipActive]}
            onPress={() => setDateChoice("last_night")}
          >
            <Text style={[styles.chipText, dateChoice === "last_night" && styles.chipTextActive]}>
              {t("Sleep:lastNight")}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.chip, dateChoice === "today" && styles.chipActive]}
            onPress={() => setDateChoice("today")}
          >
            <Text style={[styles.chipText, dateChoice === "today" && styles.chipTextActive]}>{t("Common:today")}</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.chip, dateChoice === "custom" && styles.chipActive]}
            onPress={() => setDatePickerOpen(true)}
          >
            <Text style={[styles.chipText, dateChoice === "custom" && styles.chipTextActive]}>
              {dateChoice === "custom" && customDate ? formatDateLabel(customDate) : t("Sleep:chooseDate")}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t("Sleep:bedtime")}</Text>
          <TextInput
            style={styles.input}
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
            style={styles.input}
            value={wakeTime}
            onChangeText={setWakeTime}
            placeholder="07:00"
            placeholderTextColor={colors.mutedForeground}
            maxLength={5}
          />
        </View>
      </View>

      {duration !== null && <Text style={styles.durationPreview}>{duration}h</Text>}

      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder={t("Sleep:notesPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
        value={notes}
        onChangeText={setNotes}
      />

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
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 10,
    },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    chipRow: { flexDirection: "row", gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, fontWeight: "500" },
    chipTextActive: { color: colors.primaryForeground },
    timeRow: { flexDirection: "row", gap: 10 },
    label: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: typography.body.fontSize,
      color: colors.foreground,
    },
    notesInput: { minHeight: 60, textAlignVertical: "top" },
    durationPreview: { fontSize: typography.bodySmall.fontSize, color: colors.navTint, fontWeight: "600" },
    formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
    button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
    buttonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
    secondaryButton: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
    secondaryButtonText: { color: colors.mutedForeground, fontSize: typography.button.fontSize, fontWeight: "500" },
  });
}
