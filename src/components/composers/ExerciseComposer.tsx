import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, ToastAndroid, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  createExerciseEntry,
  listActivityTypes,
  listCustomActivities,
  listExerciseEntries,
  updateExerciseEntry,
  type ActivityType,
  type CustomActivity,
  type ExerciseEntry,
  type ExerciseLogMode,
} from "../../lib/api/fitness";
import { ApiError } from "../../lib/api/client";
import { exerciseParts, findCombineTarget, isCombinedExercise } from "../../lib/exercise/combine";
import { formatMinutes } from "../../lib/formatMinutes";
import { exerciseDurationMinutes } from "../../lib/exercise/duration";
import { minutesToHoursAndMinutes } from "../../lib/study/formatMinutes";
import SelectModal, { type SelectSection } from "../SelectModal";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { localizedName } from "../../lib/i18n/localizedName";
import { todayISO } from "../../lib/dateRange";
import { useSingleFlight } from "../../lib/singleFlight";
import { showSaveError } from "../../lib/ui/apiErrors";

const INTENSITIES = ["low", "moderate", "high"];
const QUICK_DURATIONS = [15, 30, 45, 60, 90];

function showInfo(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}


export default function ExerciseComposer({
  editingEntry,
  onSaved,
  onCancelEdit,
}: {
  editingEntry?: ExerciseEntry | null;
  onSaved: () => void;
  onCancelEdit?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Exercise", "Common"]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [customActivities, setCustomActivities] = useState<CustomActivity[]>([]);
  const [activityId, setActivityId] = useState<string | null>(null);
  // Hours + minutes, like Study (lib/exercise/duration → one duration_minutes).
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutesPart, setDurationMinutesPart] = useState("");
  const [intensity, setIntensity] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // "Single entry" is the default; "Combine" is only offered (and only sent)
  // while today already has a non-Health-Connect row for the chosen activity.
  const [mode, setMode] = useState<ExerciseLogMode>("single");
  const [todayEntries, setTodayEntries] = useState<ExerciseEntry[]>([]);

  // Bumped after each save so today's rows (and the Combine offer) refresh.
  const [todayVersion, setTodayVersion] = useState(0);

  useEffect(() => {
    setMode("single");
    if (editingEntry) return;
    let cancelled = false;
    const today = todayISO();
    listExerciseEntries({ from: today, to: today })
      .then((rows) => {
        if (!cancelled) setTodayEntries(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [editingEntry, todayVersion]);

  // Any activity: Combine joins today's newest non-Health-Connect row
  // (lib/exercise/combine.ts, same rule as the backend).
  const combineTarget = !editingEntry ? findCombineTarget(todayEntries, todayISO()) : null;
  // 2+ activities: only intensity/notes are editable (see isCombinedExercise).
  const lockedEdit = Boolean(editingEntry && isCombinedExercise(editingEntry));
  const effectiveMode: ExerciseLogMode = combineTarget ? mode : "single";

  useEffect(() => {
    listActivityTypes()
      .then(setActivityTypes)
      .catch(() => {});
    listCustomActivities()
      .then(setCustomActivities)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (editingEntry) {
      setActivityId(editingEntry.activity_type_id);
      const { hours, minutes } = minutesToHoursAndMinutes(editingEntry.duration_minutes ?? 0);
      setDurationHours(hours ? String(hours) : "");
      setDurationMinutesPart(editingEntry.duration_minutes ? String(minutes) : "");
      setIntensity(editingEntry.intensity);
      setNotes(editingEntry.notes ?? "");
    }
  }, [editingEntry]);

  function activityName(id: string | null): string {
    if (!id) return t("Exercise:noActivity");
    const activityType = activityTypes.find((a) => a.id === id);
    return (
      customActivities.find((a) => a.id === id)?.name ??
      (activityType ? localizedName(activityType.name_i18n, i18n.language) : undefined) ??
      t("Exercise:unknownActivity")
    );
  }

  // One save per tap burst (see lib/singleFlight).
  const singleFlight = useSingleFlight();
  const onSubmit = singleFlight(async () => {
    const durationMinutes = exerciseDurationMinutes(durationHours, durationMinutesPart);
    if (durationMinutes == null) {
      Alert.alert(t("Exercise:durationRequiredTitle"), t("Exercise:durationRequiredBody"));
      return;
    }
    setSubmitting(true);
    try {
      if (editingEntry) {
        await updateExerciseEntry(editingEntry.sk, {
          event_date: editingEntry.event_date,
          activity_type_id: activityId,
          duration_minutes: durationMinutes,
          intensity,
          notes: notes || null,
        });
      } else {
        const saved = await createExerciseEntry({
          event_date: todayISO(),
          activity_type_id: activityId,
          duration_minutes: durationMinutes,
          intensity,
          notes: notes || null,
          mode: effectiveMode,
        });
        if (saved?.combined) showInfo(t("Exercise:addedToExistingToast"));
        setActivityId(null);
        setDurationHours("");
        setDurationMinutesPart("");
        setIntensity(null);
        setNotes("");
        setMode("single");
        setTodayVersion((v) => v + 1);
      }
      onSaved();
    } catch (err) {
      // A refused combine (over 24h / notes too long) gets its own message;
      // 404: the entry was deleted elsewhere — friendly message + refresh.
      const combineRefused = !editingEntry && effectiveMode === "combine" && err instanceof ApiError && err.status === 400;
      if (combineRefused) Alert.alert(t("Exercise:combineRejectedToast"));
      else showSaveError(t, t("Exercise:saveErrorToast"), err, onSaved);
    } finally {
      setSubmitting(false);
    }
  });

  const activitySections: SelectSection[] = [
    ...(customActivities.length > 0
      ? [{
          title: t("Exercise:myActivities"),
          // A custom activity saved without a name can't be picked by name.
          data: customActivities.filter((a) => (a.name ?? "").trim()).map((a) => ({ label: a.name, value: a.id })),
        }]
      : []),
    ...Object.entries(
      activityTypes.reduce<Record<string, ActivityType[]>>((acc, a) => {
        (acc[a.category] ??= []).push(a);
        return acc;
      }, {}),
    ).map(([category, list]) => ({
      title: category,
      data: list.map((a) => ({ label: localizedName(a.name_i18n, i18n.language), value: a.id })),
    })),
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{editingEntry ? t("Common:editEntry") : t("Exercise:logAWorkout")}</Text>
      {!editingEntry && <Text style={styles.subtitle}>{t("Exercise:logAWorkoutSubtitle")}</Text>}

      {lockedEdit && editingEntry ? (
        <View style={styles.modeBlock}>
          <Text style={styles.modeLabel}>
            {exerciseParts(editingEntry)
              .map((p) => `${activityName(p.activity_type_id)} ${formatMinutes(p.minutes)}`)
              .join(" + ")}
          </Text>
          <Text style={styles.lockedHint}>{t("Exercise:combinedEditLockedHint")}</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.sublabel}>{t("Exercise:activityLabel")}</Text>
          <AnimatedPressable style={styles.input} onPress={() => setActivityPickerOpen(true)}>
            <Text style={activityId ? styles.inputText : styles.inputPlaceholder}>{activityName(activityId)}</Text>
          </AnimatedPressable>
        </View>
      )}

      {combineTarget && (
        <View accessibilityRole="radiogroup" accessibilityLabel={t("Exercise:entryModeLabel")} style={styles.modeBlock}>
          <Text style={styles.modeLabel}>{t("Exercise:entryModeLabel")}</Text>
          <View style={styles.chipRow}>
            {(["single", "combine"] as const).map((m) => (
              <AnimatedPressable
                key={m}
                accessibilityRole="radio"
                accessibilityState={{ checked: effectiveMode === m }}
                style={[styles.chip, effectiveMode === m && styles.chipActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.chipText, effectiveMode === m && styles.chipTextActive]}>
                  {m === "single"
                    ? t("Exercise:entryModeSingle")
                    : t("Exercise:entryModeCombine", { total: formatMinutes(combineTarget.duration_minutes ?? 0) })}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>
      )}

      {!lockedEdit && (
        <View style={styles.modeBlock}>
          <Text style={styles.sublabel}>{t("Exercise:durationLabel")}</Text>
          <View style={styles.chipRow}>
            {QUICK_DURATIONS.map((d) => {
              const selected = exerciseDurationMinutes(durationHours, durationMinutesPart) === d;
              return (
                <AnimatedPressable
                  key={d}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() => {
                    const { hours, minutes } = minutesToHoursAndMinutes(d);
                    setDurationHours(hours ? String(hours) : "");
                    setDurationMinutesPart(String(minutes));
                  }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{t("Exercise:minutesShort", { count: d })}</Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </View>
      )}

      {!lockedEdit && (
        <View style={styles.durationRow}>
          <View style={styles.durationField}>
            <Text style={styles.sublabel}>{t("Exercise:hoursLabel")}</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              value={durationHours}
              onChangeText={(v) => setDurationHours(v.replace(/[^0-9]/g, "").slice(0, 2))}
            />
          </View>
          <View style={styles.durationField}>
            <Text style={styles.sublabel}>{t("Exercise:minutesLabel")}</Text>
            <TextInput
              style={styles.input}
              placeholder="30"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="number-pad"
              value={durationMinutesPart}
              onChangeText={(v) => setDurationMinutesPart(v.replace(/[^0-9]/g, "").slice(0, 2))}
            />
          </View>
        </View>
      )}

      <View style={styles.modeBlock}>
        <Text style={styles.sublabel}>
          {t("Exercise:intensityLabel")} {t("Exercise:optionalSuffix")}
        </Text>
      <View style={styles.chipRow}>
        {INTENSITIES.map((i) => (
          <AnimatedPressable
            key={i}
            style={[styles.chip, intensity === i && styles.chipActive]}
            onPress={() => setIntensity(intensity === i ? null : i)}
          >
            <Text style={[styles.chipText, styles.capitalize, intensity === i && styles.chipTextActive]}>
              {t(`Exercise:intensityLevels.${i}`)}
            </Text>
          </AnimatedPressable>
        ))}
      </View>
      </View>

      <Text style={styles.sublabel}>{t("Common:notesOptionalLabel")}</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder={t("Exercise:notesPlaceholder")}
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
            <Text style={styles.buttonText}>{editingEntry ? t("Common:save") : t("Exercise:addWorkout")}</Text>
          )}
        </AnimatedPressable>
      </View>

      <SelectModal
        visible={activityPickerOpen}
        title={t("Exercise:activityLabel")}
        sections={activitySections}
        onSelect={setActivityId}
        onClose={() => setActivityPickerOpen(false)}
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
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: typography.body.fontSize,
      color: colors.foreground,
    },
    inputText: { color: colors.foreground },
    inputPlaceholder: { color: colors.mutedForeground },
    notesInput: { minHeight: 60, textAlignVertical: "top" },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    modeBlock: { gap: 6 },
    modeLabel: { fontSize: typography.bodySmall.fontSize, fontWeight: "500", color: colors.foreground },
    lockedHint: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    durationRow: { flexDirection: "row", gap: 10 },
    durationField: { flex: 1 },
    sublabel: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, marginBottom: 4 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.bodySmall.fontSize, color: colors.foreground, fontWeight: "600" },
    capitalize: { textTransform: "capitalize" },
    chipTextActive: { color: colors.primaryForeground },
    formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
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
    secondaryButtonText: { color: colors.mutedForeground, fontSize: typography.button.fontSize, fontWeight: "500" },
  });
}
