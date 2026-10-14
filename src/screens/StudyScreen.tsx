import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import {
  deleteStudySession,
  listStudySessions,
  listStudySubjects,
  type StudySession,
  type StudySubject,
} from "../lib/api/study";
import {
  createExamLog,
  deleteExamLog,
  listExamLogs,
  updateExamLog,
  type ExamLog,
} from "../lib/api/examLogs";
import { groupByDate, dateGroupLabel } from "../lib/groupByDate";
import { groupByKey } from "../lib/groupByKey";
import { formatIcuPlural } from "../lib/i18n/icuPlural";
import { HistoryCard } from "../components/history/HistoryCard";
import { HistoryDateGroup } from "../components/history/HistoryDateGroup";
import { HistoryEntryRow } from "../components/history/HistoryEntryRow";
import StudyComposer from "../components/composers/StudyComposer";
import SelectModal, { type SelectSection } from "../components/SelectModal";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { SegmentedControl } from "../components/SegmentedControl";
import { CUSTOM_SUBJECT_VALUE, resolveSubjectId } from "../lib/study/subjects";
import { getExamGrade, EXAM_GUIDANCE_TITLE_KEY, EXAM_GUIDANCE_TIP_KEYS, type ExamGrade } from "../lib/study/examGrade";
import DateRangeFilterBar from "../components/DateRangeFilterBar";
import { isWithinDateRange, type DateFilterValue } from "../lib/dateRangeFilter";
import { localizedName } from "../lib/i18n/localizedName";
import { loadErrorText } from "../lib/api/gateErrors";
import { todayISO } from "../lib/dateRange";
import { useSingleFlight } from "../lib/singleFlight";
import { showSaveError } from "../lib/ui/apiErrors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Tab = "sessions" | "exams";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


function scoreColor(pct: number, colors: ColorPalette): string {
  if (pct >= 80) return "#2E7D32";
  if (pct >= 50) return "#B7791F";
  return colors.destructive;
}

// Soft tinted panel behind each grade's guidance tips — green/yellow reuse
// scoreColor's own hex (at low opacity) so the panel always agrees with the
// badge above it; red reuses the theme's own destructive tokens (already
// dark-mode-safe) instead of a hardcoded hex, same as scoreColor does for red.
function gradePanelColors(grade: ExamGrade, colors: ColorPalette): { background: string; border: string } {
  if (grade === "green") return { background: "#2E7D3214", border: "#2E7D3240" };
  if (grade === "yellow") return { background: "#B7791F14", border: "#B7791F40" };
  return { background: colors.destructiveBg, border: colors.destructiveBorder };
}

export default function StudyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Study", "Common"]);

  const [tab, setTab] = useState<Tab>("sessions");
  const [subjects, setSubjects] = useState<StudySubject[]>([]);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<StudySession | null>(null);

  const [exams, setExams] = useState<ExamLog[]>([]);
  const [examFormOpen, setExamFormOpen] = useState(false);
  const [editingExamSk, setEditingExamSk] = useState<string | null>(null);
  const [examSubjectId, setExamSubjectId] = useState<string | null>(null);
  const [examCustomSubject, setExamCustomSubject] = useState("");
  const [marksObtained, setMarksObtained] = useState("");
  const [marksTotal, setMarksTotal] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [examSubjectPickerOpen, setExamSubjectPickerOpen] = useState(false);
  const [examSubmitting, setExamSubmitting] = useState(false);
  // Both sessions and exams are fetched in full (no from/to params), so this
  // filter is applied entirely client-side — matches web's StudyView.tsx,
  // which never passes a server range for study either.
  const [dateFilter, setDateFilter] = useState<DateFilterValue | null>(null);
  // Narrows which subject's box(es) render below — same "isolate to one
  // group" role Habits' own "All habits" dropdown plays over its two boxes.
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [subjectFilterPickerOpen, setSubjectFilterPickerOpen] = useState(false);
  const [expandedSessionSubjects, setExpandedSessionSubjects] = useState<Set<string>>(new Set());
  const [expandedExamSubjects, setExpandedExamSubjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    listStudySubjects()
      .then((data) => {
        setSubjects(data);
        setSubjectsError(null);
      })
      .catch((err) => setSubjectsError(loadErrorText(err, t("Study:subjectsLoadError"))));
  }, [t]);

  const refreshSessions = useCallback(() => {
    return listStudySessions()
      .then((data) => setSessions([...data].sort((a, b) => b.session_date.localeCompare(a.session_date))))
      .catch((err) => setError(loadErrorText(err, t("Study:loadHistoryError"))))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [t]);

  const refreshExams = useCallback(() => {
    return listExamLogs()
      .then((data) => {
        setExams([...data].sort((a, b) => b.exam_date.localeCompare(a.exam_date)));
        setExamsError(null);
      })
      .catch((err) => setExamsError(loadErrorText(err, t("Study:examLoadError"))))
      .finally(() => setExamsLoading(false));
  }, [t]);

  function onPullRefresh() {
    setRefreshing(true);
    Promise.all([refreshSessions(), refreshExams()]);
  }

  useFocusEffect(
    useCallback(() => {
      refreshSessions();
      refreshExams();
    }, [refreshSessions, refreshExams]),
  );

  function subjectName(id: string | null): string {
    if (!id) return t("Study:unspecifiedSubject");
    const subject = subjects.find((s) => s.id === id);
    return subject ? localizedName(subject.name_i18n, i18n.language) : t("Study:unknownSubject");
  }

  function onDeleteSession(sk: string) {
    Alert.alert(t("Study:deleteThisSession"), undefined, [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteStudySession(sk);
            if (editingSession?.sk === sk) setEditingSession(null);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            refreshSessions();
          } catch (err) {
            Alert.alert(t("Study:deleteSessionError"), err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  }

  function resetExamForm() {
    setEditingExamSk(null);
    setExamSubjectId(null);
    setExamCustomSubject("");
    setMarksObtained("");
    setMarksTotal("");
    setSuggestions("");
    setExamFormOpen(false);
  }

  // Mirrors web's subjectIdToFormDefaults: seeds the picker + free-text
  // fields from an existing subject_id that might be free-text (not in the
  // known subjects list), which happens whenever the exam was logged with a
  // custom subject.
  function startEditExam(exam: ExamLog) {
    setEditingExamSk(exam.sk);
    if (exam.subject_id && subjects.length > 0 && !subjects.some((s) => s.id === exam.subject_id)) {
      setExamSubjectId(CUSTOM_SUBJECT_VALUE);
      setExamCustomSubject(exam.subject_id);
    } else {
      setExamSubjectId(exam.subject_id);
      setExamCustomSubject("");
    }
    setMarksObtained(String(exam.marks_obtained));
    setMarksTotal(String(exam.marks_total));
    setSuggestions(exam.suggestions ?? "");
    setExamFormOpen(true);
  }

  // One save per tap burst (see lib/singleFlight).
  const examSingleFlight = useSingleFlight();
  const onSubmitExam = examSingleFlight(async () => {
    if (!examSubjectId) {
      // Mobile-only — web's exam form makes subject required via the
      // native <Select>, with no separate validation message to port.
      Alert.alert(t("Study:subjectRequiredTitle"), t("Study:subjectRequiredBody"));
      return;
    }
    if (examSubjectId === CUSTOM_SUBJECT_VALUE && !examCustomSubject.trim()) {
      Alert.alert(t("Study:enterYourSubjectPlaceholder"));
      return;
    }
    const obtained = parseFloat(marksObtained);
    const total = parseFloat(marksTotal);
    // Number.isFinite: an empty "obtained" parses to NaN, which slipped past
    // these comparisons and was sent as null (the backend now refuses it).
    if (!total || !Number.isFinite(obtained) || obtained < 0 || obtained > total) {
      // Mobile-only — matches web's zod refine message ("Marks obtained
      // cannot exceed total marks"), which was never exposed as a
      // translation key either.
      Alert.alert(t("Study:marksInvalidTitle"), t("Study:marksInvalidBody"));
      return;
    }
    const resolvedSubjectId = resolveSubjectId(examSubjectId, examCustomSubject);
    if (!resolvedSubjectId) {
      Alert.alert(t("Study:enterYourSubjectPlaceholder"));
      return;
    }
    setExamSubmitting(true);
    try {
      if (editingExamSk) {
        await updateExamLog(editingExamSk, {
          subject_id: resolvedSubjectId,
          marks_obtained: obtained,
          marks_total: total,
          suggestions: suggestions || null,
        });
      } else {
        await createExamLog({
          exam_date: todayISO(),
          subject_id: resolvedSubjectId,
          marks_obtained: obtained,
          marks_total: total,
          suggestions: suggestions || null,
        });
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      resetExamForm();
      refreshExams();
    } catch (err) {
      // 404: the exam log was deleted elsewhere — friendly message + refresh.
      showSaveError(t, t("Study:saveExamError"), err, () => {
        resetExamForm();
        refreshExams();
      });
    } finally {
      setExamSubmitting(false);
    }
  });

  function onDeleteExam(sk: string) {
    Alert.alert(t("Study:deleteExamLogTitle"), t("Study:deleteExamLogConfirm"), [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await deleteExamLog(sk);
            if (editingExamSk === sk) resetExamForm();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            refreshExams();
          } catch (err) {
            Alert.alert(t("Study:deleteEntryError"), err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  }

  const subjectSections: SelectSection[] = Object.entries(
    subjects.reduce<Record<string, StudySubject[]>>((acc, s) => {
      (acc[s.module_area] ??= []).push(s);
      return acc;
    }, {}),
  ).map(([area, list]) => ({
    title: area,
    data: list.map((s) => ({ label: localizedName(s.name_i18n, i18n.language), value: s.id })),
  }));

  // Subject-level filtering narrows which box(es) render at all; date-range
  // filtering then narrows each remaining box's own contents. Matches web's
  // StudyView.tsx filter order exactly.
  let filteredSessions = subjectFilter === "all" ? sessions : sessions.filter((s) => s.subject_id === subjectFilter);
  if (dateFilter) filteredSessions = filteredSessions.filter((s) => isWithinDateRange(s.session_date, dateFilter));
  let filteredExams = subjectFilter === "all" ? exams : exams.filter((e) => e.subject_id === subjectFilter);
  if (dateFilter) filteredExams = filteredExams.filter((e) => isWithinDateRange(e.exam_date, dateFilter));

  const sessionSubjectGroups = groupByKey(
    filteredSessions,
    (s) => s.subject_id ?? "__unspecified__",
    (key) => subjectName(key === "__unspecified__" ? null : key),
  );
  const examSubjectGroups = groupByKey(
    filteredExams,
    (e) => e.subject_id ?? "__unspecified__",
    (key) => subjectName(key === "__unspecified__" ? null : key),
  );

  function toggleSessionSubject(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSessionSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExamSubject(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedExamSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function sessionValueLabel(session: StudySession): string {
    return t("Study:minutesShort", { count: session.duration_minutes ?? 0 });
  }

  function examValueLabel(exam: ExamLog): string {
    return `${Math.round((exam.marks_obtained / exam.marks_total) * 100)}%`;
  }

  function groupSummary<T>(
    items: T[],
    valueLabel: (item: T) => string,
    dateFor: (item: T) => string,
  ): string {
    const countText = formatIcuPlural(t("Common:entryCount"), items.length, i18n.language);
    return `${countText} · ${t("Common:latestEntryPreview", {
      value: valueLabel(items[0]),
      date: dateGroupLabel(dateFor(items[0])),
    })}`;
  }

  const subjectFilterSections: SelectSection[] = [
    { title: "", data: [{ label: t("Study:allSubjects"), value: "all" }] },
    ...subjectSections,
  ];
  const subjectFilterLabel =
    subjectFilter === "all" ? t("Study:allSubjects") : subjectName(subjectFilter);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      <SegmentedControl
        options={[
          { value: "sessions" as const, label: t("Study:sessionsTab") },
          { value: "exams" as const, label: t("Study:examsTab") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {subjectsError && <Text style={styles.loadErrorText}>{subjectsError}</Text>}

      {tab === "sessions" ? (
        <>
          <StudyComposer
            editingSession={editingSession}
            onSaved={() => {
              setEditingSession(null);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              refreshSessions();
            }}
            onCancelEdit={() => setEditingSession(null)}
          />

          <View style={styles.filterRow}>
            <Text style={styles.sectionTitle}>{t("Study:historyTitle")}</Text>
            <AnimatedPressable style={styles.filterTrigger} onPress={() => setSubjectFilterPickerOpen(true)}>
              <Text style={styles.filterTriggerText} numberOfLines={1}>
                {subjectFilterLabel}
              </Text>
            </AnimatedPressable>
          </View>
          <DateRangeFilterBar value={dateFilter} onChange={setDateFilter} />

          {loading ? (
            <ActivityIndicator color={colors.navTint} />
          ) : sessionSubjectGroups.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.body}>
                {error ?? (dateFilter ? t("Common:dateFilter.noResultsForRange") : t("Study:noSessionsLoggedYet"))}
              </Text>
            </View>
          ) : (
            sessionSubjectGroups.map((group) => {
              const dateGroups = groupByDate(group.items, (s) => s.session_date);
              const expanded = expandedSessionSubjects.has(group.key);
              return (
                <HistoryCard
                  key={group.key}
                  title={group.name}
                  summaryText={groupSummary(group.items, sessionValueLabel, (s) => s.session_date)}
                  expanded={expanded}
                  onToggle={() => toggleSessionSubject(group.key)}
                  expandLabel={t("Common:expandHistory", { title: group.name })}
                  collapseLabel={t("Common:collapseHistory", { title: group.name })}
                >
                  {dateGroups.map((dateGroup) => (
                    <HistoryDateGroup key={dateGroup.label} label={dateGroup.label}>
                      {dateGroup.items.map((session) => (
                        <HistoryEntryRow
                          key={session.sk}
                          title={subjectName(session.subject_id)}
                          subtitle={
                            session.session_type
                              ? capitalize(t(`Study:sessionTypes.${session.session_type}`, { defaultValue: session.session_type }))
                              : undefined
                          }
                          value={sessionValueLabel(session)}
                          onPress={() => setEditingSession(session)}
                          onLongPress={() => onDeleteSession(session.sk)}
                        />
                      ))}
                    </HistoryDateGroup>
                  ))}
                </HistoryCard>
              );
            })
          )}
        </>
      ) : (
        <>
          {!examFormOpen ? (
            <AnimatedPressable style={styles.addExamRow} onPress={() => setExamFormOpen(true)}>
              <Text style={styles.addExamText}>+ {t("Study:logExamResult")}</Text>
            </AnimatedPressable>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {editingExamSk ? t("Study:editExamLogTitle") : t("Study:logExamResultTitle")}
              </Text>

              <AnimatedPressable style={styles.input} onPress={() => setExamSubjectPickerOpen(true)}>
                <Text style={examSubjectId ? styles.inputText : styles.inputPlaceholder}>
                  {examSubjectId === CUSTOM_SUBJECT_VALUE
                    ? examCustomSubject || t("Study:writeYourOwnSubject")
                    : subjectName(examSubjectId)}
                </Text>
              </AnimatedPressable>

              {examSubjectId === CUSTOM_SUBJECT_VALUE && (
                <TextInput
                  style={styles.input}
                  placeholder={t("Study:enterYourSubjectPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={examCustomSubject}
                  onChangeText={setExamCustomSubject}
                />
              )}

              <View style={styles.marksRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t("Study:marksObtainedLabel")}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={marksObtained}
                  onChangeText={setMarksObtained}
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder={t("Study:outOfTotalLabel")}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={marksTotal}
                  onChangeText={setMarksTotal}
                />
              </View>

              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder={t("Study:suggestionsPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={suggestions}
                onChangeText={setSuggestions}
              />

              <View style={styles.formActions}>
                <AnimatedPressable style={styles.secondaryButton} onPress={resetExamForm}>
                  <Text style={styles.secondaryButtonText}>{t("Common:cancel")}</Text>
                </AnimatedPressable>
                <AnimatedPressable style={styles.button} onPress={onSubmitExam} disabled={examSubmitting}>
                  {examSubmitting ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={styles.buttonText}>{editingExamSk ? t("Common:save") : t("Study:saveExamLog")}</Text>
                  )}
                </AnimatedPressable>
              </View>
            </View>
          )}

          <View style={styles.filterRow}>
            <Text style={styles.sectionTitle}>{t("Study:historyTitle")}</Text>
            <AnimatedPressable style={styles.filterTrigger} onPress={() => setSubjectFilterPickerOpen(true)}>
              <Text style={styles.filterTriggerText} numberOfLines={1}>
                {subjectFilterLabel}
              </Text>
            </AnimatedPressable>
          </View>
          <DateRangeFilterBar value={dateFilter} onChange={setDateFilter} />

          {examsLoading ? (
            <ActivityIndicator color={colors.navTint} />
          ) : examsError ? (
            <View style={styles.card}>
              <Text style={styles.loadErrorText}>{examsError}</Text>
            </View>
          ) : examSubjectGroups.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.body}>
                {dateFilter ? t("Common:dateFilter.noResultsForRange") : t("Study:noExamsTitle")}
              </Text>
            </View>
          ) : (
            examSubjectGroups.map((group) => {
              const dateGroups = groupByDate(group.items, (e) => e.exam_date);
              const expanded = expandedExamSubjects.has(group.key);
              return (
                <HistoryCard
                  key={group.key}
                  title={group.name}
                  summaryText={groupSummary(group.items, examValueLabel, (e) => e.exam_date)}
                  expanded={expanded}
                  onToggle={() => toggleExamSubject(group.key)}
                  expandLabel={t("Common:expandHistory", { title: group.name })}
                  collapseLabel={t("Common:collapseHistory", { title: group.name })}
                >
                  {dateGroups.map((dateGroup) => (
                    <HistoryDateGroup key={dateGroup.label} label={dateGroup.label}>
                      {dateGroup.items.map((exam) => {
                        const pct = Math.round((exam.marks_obtained / exam.marks_total) * 100);
                        const grade = getExamGrade(pct);
                        const guidanceTitle = t(`Study:${EXAM_GUIDANCE_TITLE_KEY[grade]}`);
                        const guidanceTips = EXAM_GUIDANCE_TIP_KEYS[grade].map((key) => t(`Study:${key}`));
                        const panelColors = gradePanelColors(grade, colors);
                        return (
                          <View key={exam.sk} style={styles.examEntryWrap}>
                            <HistoryEntryRow
                              title={subjectName(exam.subject_id)}
                              valueNode={
                                <View style={[styles.scoreBadge, { backgroundColor: scoreColor(pct, colors) }]}>
                                  <Text style={styles.scoreBadgeText}>{pct}%</Text>
                                </View>
                              }
                              onPress={() => startEditExam(exam)}
                              onLongPress={() => onDeleteExam(exam.sk)}
                              hideDivider
                            />
                            <View
                              style={[
                                styles.guidancePanel,
                                { backgroundColor: panelColors.background, borderColor: panelColors.border },
                              ]}
                            >
                              <Text style={styles.guidanceTitle}>{guidanceTitle}</Text>
                              {guidanceTips.map((tip) => (
                                <Text key={tip} style={styles.guidanceTip}>
                                  {"• "}
                                  {tip}
                                </Text>
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </HistoryDateGroup>
                  ))}
                </HistoryCard>
              );
            })
          )}
        </>
      )}

      <SelectModal
        visible={examSubjectPickerOpen}
        title={t("Study:subjectLabel")}
        sections={subjectSections}
        onSelect={setExamSubjectId}
        onClose={() => setExamSubjectPickerOpen(false)}
        searchPlaceholder={t("Study:searchSubjectsPlaceholder")}
        showCustomOption
        customOptionValue={CUSTOM_SUBJECT_VALUE}
        customOptionLabel={t("Study:writeYourOwnSubject")}
      />

      <SelectModal
        visible={subjectFilterPickerOpen}
        title={t("Study:allSubjects")}
        sections={subjectFilterSections}
        onSelect={setSubjectFilter}
        onClose={() => setSubjectFilterPickerOpen(false)}
        searchPlaceholder={t("Study:searchSubjectsPlaceholder")}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, gap: 16, paddingBottom: 40 },
  title: { fontSize: typography.title.fontSize, fontWeight: "600", letterSpacing: -0.3, color: colors.foreground },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  filterTrigger: {
    maxWidth: 160,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  filterTriggerText: { fontSize: typography.bodySmall.fontSize, color: colors.foreground, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: typography.body.fontSize,
  },
  inputText: { color: colors.foreground },
  inputPlaceholder: { color: colors.mutedForeground },
  notesInput: { minHeight: 60, textAlignVertical: "top" },
  marksRow: { flexDirection: "row", gap: 10 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  buttonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
  secondaryButton: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  secondaryButtonText: { color: colors.mutedForeground, fontSize: typography.button.fontSize, fontWeight: "500" },
  body: { fontSize: 14, color: colors.mutedForeground },
  loadErrorText: { fontSize: 14, color: colors.destructive },
  addExamRow: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  addExamText: { color: colors.navTint, fontWeight: "600", fontSize: typography.body.fontSize },
  scoreBadge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  scoreBadgeText: { color: "#fff", fontSize: typography.bodySmall.fontSize, fontWeight: "700" },
  examEntryWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 4,
    gap: 8,
  },
  guidancePanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  guidanceTitle: { fontSize: typography.bodySmall.fontSize, fontWeight: "700", color: colors.foreground, marginBottom: 2 },
  guidanceTip: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, lineHeight: 18 },
  });
}
