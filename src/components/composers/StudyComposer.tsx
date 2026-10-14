import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  createStudySession,
  listStudySubjects,
  updateStudySession,
  type StudySession,
  type StudySubject,
} from "../../lib/api/study";
import SelectModal, { type SelectSection } from "../SelectModal";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { CUSTOM_SUBJECT_VALUE, resolveSubjectId } from "../../lib/study/subjects";
import { toTotalMinutes, minutesToHoursAndMinutes } from "../../lib/study/formatMinutes";
import { localizedName } from "../../lib/i18n/localizedName";
import { todayISO } from "../../lib/dateRange";
import { useSingleFlight } from "../../lib/singleFlight";
import { showSaveError } from "../../lib/ui/apiErrors";

const SESSION_TYPE_VALUES = ["reading", "practice", "revision", "homework", "exam_prep"];

// Same quick-pick minute values as web's StudyComposer.tsx.
const QUICK_DURATIONS = [15, 30, 45, 60, 90];


export default function StudyComposer({
  editingSession,
  onSaved,
  onCancelEdit,
}: {
  editingSession?: StudySession | null;
  onSaved: () => void;
  onCancelEdit?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Study", "Common"]);

  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [customSubject, setCustomSubject] = useState("");
  const [durationHours, setDurationHours] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [sessionType, setSessionType] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listStudySubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  // Seeds the picker + free-text fields from an existing subject_id that
  // might be free-text (not present in the known subjects list) — happens
  // whenever the session was logged with a custom subject. Mirrors web's
  // subjectIdToFormDefaults (src/components/study/resolveSubjectId.ts), run
  // here once subjects have loaded so "known" can actually be checked.
  useEffect(() => {
    if (!editingSession) return;
    const id = editingSession.subject_id;
    if (id && subjects.length > 0 && !subjects.some((s) => s.id === id)) {
      setSubjectId(CUSTOM_SUBJECT_VALUE);
      setCustomSubject(id);
    } else {
      setSubjectId(id);
      setCustomSubject("");
    }
    const { hours, minutes } = minutesToHoursAndMinutes(editingSession.duration_minutes ?? 0);
    setDurationHours(String(hours));
    setDurationMinutes(String(minutes));
    setSessionType(editingSession.session_type);
    setNotes(editingSession.notes ?? "");
  }, [editingSession, subjects]);

  function subjectName(id: string | null): string {
    if (!id) return t("Study:unspecifiedSubject");
    if (id === CUSTOM_SUBJECT_VALUE) return customSubject || t("Study:writeYourOwnSubject");
    const subject = subjects.find((s) => s.id === id);
    return subject ? localizedName(subject.name_i18n, i18n.language) : t("Study:unknownSubject");
  }

  const totalMinutes = toTotalMinutes(Number(durationHours) || 0, Number(durationMinutes) || 0);

  // One save per tap burst (see lib/singleFlight).
  const singleFlight = useSingleFlight();
  const onSubmit = singleFlight(async () => {
    if (subjectId === CUSTOM_SUBJECT_VALUE && !customSubject.trim()) {
      Alert.alert(t("Study:enterYourSubjectPlaceholder"));
      return;
    }
    if (totalMinutes < 1 || totalMinutes > 1440) {
      // Mobile-only — web enforces this via a zod schema message that was
      // never exposed as a translation key.
      Alert.alert(t("Study:durationInvalidTitle"), t("Study:durationInvalidBody"));
      return;
    }
    setSubmitting(true);
    try {
      const resolvedSubjectId = resolveSubjectId(subjectId, customSubject);
      if (editingSession) {
        await updateStudySession(editingSession.sk, {
          subject_id: resolvedSubjectId,
          duration_minutes: totalMinutes,
          session_type: sessionType,
          notes: notes || null,
        });
      } else {
        await createStudySession({
          session_date: todayISO(),
          subject_id: resolvedSubjectId,
          duration_minutes: totalMinutes,
          session_type: sessionType,
          notes: notes || null,
        });
        setSubjectId(null);
        setCustomSubject("");
        setDurationHours("0");
        setDurationMinutes("30");
        setSessionType(null);
        setNotes("");
      }
      onSaved();
    } catch (err) {
      // 404: the session was deleted elsewhere — friendly message + refresh.
      showSaveError(t, t("Study:saveSessionError"), err, onSaved);
    } finally {
      setSubmitting(false);
    }
  });

  const subjectSections: SelectSection[] = Object.entries(
    subjects.reduce<Record<string, StudySubject[]>>((acc, s) => {
      (acc[s.module_area] ??= []).push(s);
      return acc;
    }, {}),
  ).map(([area, list]) => ({
    title: area,
    data: list.map((s) => ({ label: localizedName(s.name_i18n, i18n.language), value: s.id })),
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{editingSession ? t("Study:editSession") : t("Study:logASession")}</Text>

      <AnimatedPressable style={styles.input} onPress={() => setSubjectPickerOpen(true)}>
        <Text style={subjectId ? styles.inputText : styles.inputPlaceholder}>{subjectName(subjectId)}</Text>
      </AnimatedPressable>

      {subjectId === CUSTOM_SUBJECT_VALUE && (
        <TextInput
          style={styles.input}
          placeholder={t("Study:enterYourSubjectPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          value={customSubject}
          onChangeText={setCustomSubject}
        />
      )}

      <View style={styles.durationSection}>
        <Text style={styles.label}>{t("Study:durationLabel")}</Text>
        <View style={styles.chipRow}>
          {QUICK_DURATIONS.map((d) => (
            <AnimatedPressable
              key={d}
              style={[styles.chip, totalMinutes === d && styles.chipActive]}
              onPress={() => {
                const { hours, minutes } = minutesToHoursAndMinutes(d);
                setDurationHours(String(hours));
                setDurationMinutes(String(minutes));
              }}
            >
              <Text style={[styles.chipText, totalMinutes === d && styles.chipTextActive]}>
                {t("Study:minutesShort", { count: d })}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
        <View style={styles.durationRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sublabel}>{t("Study:hoursLabel")}</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={durationHours}
              onChangeText={setDurationHours}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sublabel}>{t("Study:minutesLabel")}</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={durationMinutes}
              onChangeText={setDurationMinutes}
            />
          </View>
        </View>
      </View>

      <View style={styles.chipRow}>
        {SESSION_TYPE_VALUES.map((value) => (
          <AnimatedPressable
            key={value}
            style={[styles.chip, sessionType === value && styles.chipActive]}
            onPress={() => setSessionType(sessionType === value ? null : value)}
          >
            <Text style={[styles.chipText, styles.chipTextCapitalize, sessionType === value && styles.chipTextActive]}>
              {t(`Study:sessionTypes.${value}`)}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder={t("Study:notesPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <View style={styles.formActions}>
        {editingSession && onCancelEdit && (
          <AnimatedPressable style={styles.secondaryButton} onPress={onCancelEdit}>
            <Text style={styles.secondaryButtonText}>{t("Common:cancel")}</Text>
          </AnimatedPressable>
        )}
        <AnimatedPressable style={styles.button} onPress={onSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.buttonText}>{editingSession ? t("Common:save") : t("Study:saveSession")}</Text>
          )}
        </AnimatedPressable>
      </View>

      <SelectModal
        visible={subjectPickerOpen}
        title={t("Study:subjectLabel")}
        sections={subjectSections}
        onSelect={setSubjectId}
        onClose={() => setSubjectPickerOpen(false)}
        searchPlaceholder={t("Study:searchSubjectsPlaceholder")}
        showCustomOption
        customOptionValue={CUSTOM_SUBJECT_VALUE}
        customOptionLabel={t("Study:writeYourOwnSubject")}
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: typography.body.fontSize,
    color: colors.foreground,
  },
  inputText: { color: colors.foreground },
  inputPlaceholder: { color: colors.mutedForeground },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  label: { fontSize: typography.bodySmall.fontSize, fontWeight: "600", color: colors.foreground },
  sublabel: { fontSize: typography.label.fontSize, color: colors.mutedForeground, marginBottom: 4 },
  durationSection: { gap: 8 },
  durationRow: { flexDirection: "row", gap: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, fontWeight: "500" },
  // Session type values are stored/translated lowercase ("reading",
  // "exam prep") — same as web's `capitalize` CSS class on the equivalent chips.
  chipTextCapitalize: { textTransform: "capitalize" },
  chipTextActive: { color: colors.primaryForeground },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  buttonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
  secondaryButton: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.mutedForeground, fontSize: typography.button.fontSize, fontWeight: "500" },
  });
}
