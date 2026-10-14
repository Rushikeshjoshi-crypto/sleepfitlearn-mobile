import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import {
  closeFamilyLink,
  getChildSummary,
  getConsentLog,
  listFamilyLinks,
  SCOPE_KEYS,
  updateControls,
  updateShareScopes,
  type ChildSummary,
  type ConsentEvent,
  type FamilyLink,
  type ShareScopes,
} from "../lib/api/family";
import { familyErrorKey } from "../lib/family/familyErrors";
import { formatIcuPlural } from "../lib/i18n/icuPlural";
import { useTheme } from "../theme/ThemeContext";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ModernButton } from "../components/ModernButton";
import { metricTypeLabel } from "../lib/family/childDetail";
import { parentVitalsDisplay } from "../lib/family/parentVitals";
import { KNOWN_CONSENT_EVENTS } from "../lib/family/consentEvents";
import { ScopeToggleList } from "../components/family/ScopeToggleList";
import { makeFamilyStyles } from "../components/family/familyStyles";
import { warningsAfterLimitChange, warningsInitial } from "../lib/family/controlsDefaults";

type Props = NativeStackScreenProps<AppStackParamList, "ChildDetail">;
type Tab = "summary" | "sharing" | "controls" | "log";

const KNOWN_EVENTS = KNOWN_CONSENT_EVENTS;

// null = a day with no data: an empty track, no bar (not a zero bar).
function Bars({ values, styles }: { values: (number | null)[]; styles: ReturnType<typeof makeFamilyStyles> }) {
  const max = Math.max(...values.map((v) => v ?? 0), 1);
  return (
    <View style={styles.barsRow}>
      {values.map((v, i) => (
        <View key={i} style={styles.barTrack}>
          {v != null && <View style={[styles.bar, { height: `${Math.max((v / max) * 100, v > 0 ? 6 : 2)}%` }]} />}
        </View>
      ))}
    </View>
  );
}

// Parent's view of one linked child. Web equivalent: ChildDetail in
// src/components/family/ParentDashboard.tsx.
export default function ChildDetailScreen({ route, navigation }: Props) {
  const { linkId } = route.params;
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Family");
  const [tab, setTab] = useState<Tab>("summary");
  const [link, setLink] = useState<FamilyLink | null>(null);
  const [summary, setSummary] = useState<ChildSummary | null>(null);
  const [events, setEvents] = useState<ConsentEvent[] | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  // One error per part of the screen, each with its own retry — a failed
  // summary or consent-log load no longer hides the tabs or the Unlink button.
  const [linkError, setLinkError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const [linkTry, setLinkTry] = useState(0);
  const [summaryTry, setSummaryTry] = useState(0);
  const [logTry, setLogTry] = useState(0);

  const [scopes, setScopes] = useState<ShareScopes | null>(null);
  const [limit, setLimit] = useState("");
  const [warnings, setWarnings] = useState(true);
  // Setting a limit turns its reminder on unless the parent flipped the
  // switch themselves (lib/family/controlsDefaults, same as web).
  const [warningsTouched, setWarningsTouched] = useState(false);
  const [socialBlocked, setSocialBlocked] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyLink = useCallback((l: FamilyLink) => {
    setLink(l);
    setScopes({ ...l.share_scopes, ...(l.pending_scopes ?? {}) });
    setLimit(l.controls.daily_screen_time_limit_minutes != null ? String(l.controls.daily_screen_time_limit_minutes) : "");
    setWarnings(warningsInitial(l.controls.limit_warning_notifications));
    setSocialBlocked(l.controls.social_blocked);
  }, []);

  useEffect(() => {
    setLinkError(null);
    listFamilyLinks()
      .then((r) => {
        const found = r.as_parent.find((l) => l.link_id === linkId && l.status === "active");
        if (found) applyLink(found);
        else setLinkError(t("Errors.linkNotFound"));
      })
      .catch((err) => setLinkError(t(`Errors.${familyErrorKey(err)}`)));
  }, [linkId, applyLink, t, linkTry]);

  useEffect(() => {
    if (tab !== "summary" || !link) return;
    setSummary(null);
    setSummaryError(null);
    getChildSummary(linkId, days)
      .then(setSummary)
      .catch((err) => setSummaryError(t(`Errors.${familyErrorKey(err)}`)));
  }, [tab, days, link, linkId, t, summaryTry]);

  useEffect(() => {
    if (tab !== "log") return;
    setEvents(null);
    setLogError(null);
    getConsentLog(linkId)
      .then((r) => setEvents(r.events))
      .catch((err) => setLogError(t(`Errors.${familyErrorKey(err)}`)));
  }, [tab, linkId, t, logTry]);

  const retryBlock = (message: string, retry: () => void) => (
    <View style={styles.card}>
      <Text style={styles.errorText}>{message}</Text>
      <ModernButton title={t("retry")} variant="secondary" onPress={retry} />
    </View>
  );
  const unlinkButton = <ModernButton title={t("Parent.unlink")} variant="destructive" onPress={confirmUnlink} />;

  async function saveScopes() {
    if (!scopes) return;
    setSaving(true);
    try {
      const updated = await updateShareScopes(linkId, scopes);
      applyLink(updated);
      const requestedMore = updated.pending_scopes && Object.keys(updated.pending_scopes).length > 0;
      Alert.alert(requestedMore ? t("ScopesForm.savedWithRequest") : t("ScopesForm.saved"));
    } catch (err) {
      Alert.alert(t(`Errors.${familyErrorKey(err)}`));
    } finally {
      setSaving(false);
    }
  }

  async function saveControls() {
    const minutes = limit.trim() === "" ? null : Number(limit);
    if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440)) {
      Alert.alert(t("Controls.limitInvalid"));
      return;
    }
    setSaving(true);
    try {
      applyLink(
        await updateControls(linkId, {
          daily_screen_time_limit_minutes: minutes,
          limit_warning_notifications: warnings,
          social_blocked: socialBlocked,
        }),
      );
      Alert.alert(t("Controls.saved"));
    } catch (err) {
      Alert.alert(t(`Errors.${familyErrorKey(err)}`));
    } finally {
      setSaving(false);
    }
  }

  function confirmUnlink() {
    Alert.alert(t("Parent.unlinkConfirmTitle"), t("Parent.unlinkConfirmBody"), [
      { text: t("Parent.keep"), style: "cancel" },
      {
        text: t("Parent.unlink"),
        style: "destructive",
        onPress: async () => {
          try {
            await closeFamilyLink(linkId);
            navigation.goBack();
          } catch (err) {
            Alert.alert(t(`Errors.${familyErrorKey(err)}`));
          }
        },
      },
    ]);
  }

  // The link itself didn't load: error + retry, and Unlink stays available
  // (it only needs the link id).
  if (linkError || !link || !scopes) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        {linkError ? retryBlock(linkError, () => setLinkTry((n) => n + 1)) : <ActivityIndicator color={colors.primary} />}
        {unlinkButton}
      </ScrollView>
    );
  }

  const minutesText = (m: number) => t("Summary.minutesShort", { minutes: m });
  const TABS: { key: Tab; label: string }[] = [
    { key: "summary", label: t("Parent.tabSummary") },
    { key: "sharing", label: t("Parent.tabSharing") },
    { key: "controls", label: t("Parent.tabControls") },
    { key: "log", label: t("Parent.tabLog") },
  ];
  const notShared = SCOPE_KEYS.filter((k) => !link.share_scopes[k]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.tabRow}>
        {TABS.map((x) => (
          <AnimatedPressable key={x.key} style={[styles.tab, tab === x.key && styles.tabActive]} onPress={() => setTab(x.key)}>
            <Text style={[styles.tabText, tab === x.key && styles.tabTextActive]} numberOfLines={1}>
              {x.label}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {tab === "summary" && (
        <>
          <View style={styles.tabRow}>
            {([7, 30] as const).map((d) => (
              <AnimatedPressable key={d} style={[styles.tab, days === d && styles.tabActive]} onPress={() => setDays(d)}>
                <Text style={[styles.tabText, days === d && styles.tabTextActive]}>{t("Summary.lastDays", { days: d })}</Text>
              </AnimatedPressable>
            ))}
          </View>
          {summaryError ? (
            retryBlock(summaryError, () => setSummaryTry((n) => n + 1))
          ) : !summary ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              {summary.sleep && (
                <View style={styles.card}>
                  <Text style={styles.label}>{t("Scopes.sleep.label")}</Text>
                  <Text style={styles.statValue}>{t("Summary.avgSleep", { hours: summary.sleep.avg_hours })}</Text>
                  <Bars styles={styles} values={summary.sleep.daily.map((d) => d.hours)} />
                </View>
              )}
              {summary.exercise && (
                <View style={styles.card}>
                  <Text style={styles.label}>{t("Scopes.exercise.label")}</Text>
                  <Text style={styles.statValue}>
                    {formatIcuPlural(t("Summary.workoutDays"), summary.exercise.workout_days, i18n.language)}
                  </Text>
                  <Bars styles={styles} values={summary.exercise.daily.map((d) => d.minutes)} />
                </View>
              )}
              {summary.study && (
                <View style={styles.card}>
                  <Text style={styles.label}>{t("Scopes.study.label")}</Text>
                  <Text style={styles.statValue}>{t("Summary.totalTime", { time: minutesText(summary.study.total_minutes) })}</Text>
                  <Bars styles={styles} values={summary.study.daily.map((d) => d.minutes)} />
                </View>
              )}
              {summary.habits && (
                <View style={styles.card}>
                  <Text style={styles.label}>{t("Scopes.habits.label")}</Text>
                  <Text style={styles.statValue}>
                    {summary.habits.avg_screen_time_minutes == null
                      ? t("Summary.noData")
                      : t("Summary.avgScreenTime", { time: minutesText(summary.habits.avg_screen_time_minutes) })}
                  </Text>
                  {summary.habits.routine_adherence_avg_pct != null && (
                    <Text style={styles.hint}>{t("Summary.routineAdherence", { pct: summary.habits.routine_adherence_avg_pct })}</Text>
                  )}
                  <Bars styles={styles} values={summary.habits.daily.map((d) => d.screen_time_minutes)} />
                </View>
              )}
              {summary.personal && (
                <View style={styles.card}>
                  <Text style={styles.label}>{t("Scopes.personal.label")}</Text>
                  <Text style={styles.statValue}>
                    {formatIcuPlural(t("Summary.latestReadings"), summary.personal.latest.length, i18n.language)}
                  </Text>
                  {summary.personal.latest.map((m, i) => {
                    // HR/BP synced from Health Connect: numbers, time and source only — no colours.
                    const shown = parentVitalsDisplay(m, (k, v) => t(`Vitals:${k}`, v), (iso) => new Date(iso).toLocaleString(i18n.language));
                    return (
                      <View key={m.metric_type ?? `metric-${i}`} style={styles.row}>
                        <Text style={styles.hint}>{metricTypeLabel(m.metric_type)}</Text>
                        <View>
                          <Text style={styles.body}>{shown.value}</Text>
                          {shown.detail && <Text style={styles.hint}>{shown.detail}</Text>}
                        </View>
                      </View>
                    );
                  })}
                  <Text style={styles.hint}>{t("Vitals:disclaimer")}</Text>
                </View>
              )}
              {notShared.length > 0 && (
                <Text style={styles.hint}>
                  {t("Summary.notShared", { categories: notShared.map((k) => t(`Scopes.${k}.label`)).join(", ") })}
                </Text>
              )}
            </>
          )}
        </>
      )}

      {tab === "sharing" && (
        <View style={styles.card}>
          <Text style={styles.hint}>{t("ScopesForm.parentHelper")}</Text>
          <ScopeToggleList value={scopes} onChange={setScopes} pending={link.pending_scopes} disabled={saving} />
          <ModernButton title={t("ScopesForm.save")} onPress={saveScopes} loading={saving} />
        </View>
      )}

      {tab === "controls" && (
        <View style={styles.card}>
          <Text style={styles.label}>{t("Controls.limitLabel")}</Text>
          <TextInput
            style={styles.input}
            value={limit}
            onChangeText={(v) => {
              const next = v.replace(/[^0-9]/g, "").slice(0, 4);
              setWarnings(warningsAfterLimitChange(limit, next, warnings, warningsTouched));
              setLimit(next);
            }}
            placeholder={t("Controls.limitPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
          />
          <Text style={styles.hint}>{t("Controls.limitHelper")}</Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.body}>{t("Controls.warningsLabel")}</Text>
              <Text style={styles.hint}>{t("Controls.warningsHelper")}</Text>
            </View>
            <Switch
              value={warnings}
              onValueChange={(on) => {
                setWarningsTouched(true);
                setWarnings(on);
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.body}>{t("Controls.socialLabel")}</Text>
              <Text style={styles.hint}>{t("Controls.socialHelper")}</Text>
            </View>
            <Switch value={socialBlocked} onValueChange={setSocialBlocked} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <ModernButton title={t("Controls.save")} onPress={saveControls} loading={saving} />
        </View>
      )}

      {tab === "log" && logError && retryBlock(logError, () => setLogTry((n) => n + 1))}
      {tab === "log" && !logError && (
        <View style={styles.card}>
          {!events ? (
            <ActivityIndicator color={colors.primary} />
          ) : events.length === 0 ? (
            <Text style={styles.hint}>{t("ConsentLog.empty")}</Text>
          ) : (
            events.map((e) => (
              <View key={`${e.created_at}-${e.event_type}`} style={{ gap: 2 }}>
                <Text style={styles.body}>
                  {KNOWN_EVENTS.has(e.event_type) ? t(`ConsentLog.events.${e.event_type}`) : e.event_type}
                </Text>
                <Text style={styles.hint}>
                  {e.actor_role === "parent"
                    ? t("ConsentLog.byParent")
                    : e.actor_role === "system"
                      ? t("ConsentLog.bySystem")
                      : t("ConsentLog.byChild")} ·{" "}
                  {new Date(e.created_at).toLocaleString(i18n.language)}
                  {e.consent_text_version ? ` · ${t("ConsentLog.consentVersion", { version: e.consent_text_version })}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>
      )}

      {unlinkButton}
    </ScrollView>
  );
}
