import { useMemo, useState, type ReactNode } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { AnimatedPressable } from "../AnimatedPressable";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import {
  avatarInitial,
  weekSeries,
  weekTabs,
  type ProfileStat,
  type StartItem,
  type WeekBar,
  type WeekTab,
} from "../../lib/dashboard/home";
import type { WeeklySnapshot } from "../../lib/api/dashboard";

// Cards of the dashboard-style Home, same layout as the web's FeedCard /
// HomeCards: flat, 1px border, small corners, bold big numbers, orange for
// today's bar and grey for the rest.

export const FEED_ICON: Record<WeekTab, string> = { sleep: "🌙", fitness: "🏋️", study: "📖", steps: "👟" };

export function FeedCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={styles.card}>{children}</View>;
}

export function FeedCardHeader({ icon, title, range, right }: { icon: string; title: string; range?: string | null; right?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerIcon}>{icon}</Text>
        <View style={styles.flex}>
          <Text style={styles.headerTitle}>{title}</Text>
          {range ? <Text style={styles.headerRange}>{range}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

export function FeedStat({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

// Seven mini bars: orange for today, grey for the rest.
export function WeekBars({ bars, height = 48 }: { bars: WeekBar[]; height?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.barsWrap}>
      <View style={[styles.barsRow, { height }]}>
        {bars.map((b) => (
          <View key={b.date} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                { height: `${Math.max(b.heightPct, 4)}%`, backgroundColor: b.isToday ? colors.orange : colors.bar },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.labelsRow}>
        {bars.map((b) => (
          <Text key={b.date} style={[styles.dayLabel, b.isToday && styles.dayLabelToday]} numberOfLines={1}>
            {b.dayLabel}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function ProfileCard({
  nickname,
  stats,
  avatar,
  onSettings,
}: {
  nickname: string | null | undefined;
  stats: ProfileStat[];
  avatar?: string | null;
  onSettings: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Home", "Nav"]);
  const show = (s: ProfileStat) => {
    if (s.value === null) return t("Home:noData");
    return s.key === "avgSleep" || s.key === "studyThisWeek" ? `${s.value}h` : s.value.toLocaleString();
  };
  return (
    <FeedCard>
      <View style={styles.profileTop}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{avatarInitial(nickname) ?? ""}</Text>
          </View>
        )}
        {nickname ? <Text style={styles.nickname}>{nickname}</Text> : null}
      </View>
      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.key} style={styles.profileStat}>
            <Text style={[styles.profileStatValue, s.value === null && styles.profileStatEmpty]}>{show(s)}</Text>
            <Text style={styles.profileStatLabel}>{t(`Home:${s.key}`)}</Text>
          </View>
        ))}
      </View>
      <AnimatedPressable style={styles.linkRow} onPress={onSettings} accessibilityRole="link">
        <Text style={styles.link}>{t("Nav:settings")} ›</Text>
      </AnimatedPressable>
    </FeedCard>
  );
}

export function ThisWeekCard({ snapshot, stepsAllowed }: { snapshot: WeeklySnapshot; stepsAllowed: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Home", "Dashboard"]);
  const [tab, setTab] = useState<WeekTab>("sleep");
  const tabs = weekTabs(stepsAllowed);
  const active = tabs.includes(tab) ? tab : "sleep";
  const label: Record<WeekTab, string> = {
    sleep: t("Dashboard:sleep"),
    fitness: t("Dashboard:fitness"),
    study: t("Dashboard:study"),
    steps: t("Home:stepsTitle"),
  };
  const caption: Record<WeekTab, string> = {
    sleep: t("Dashboard:avg"),
    fitness: t("Dashboard:days"),
    study: t("Dashboard:total"),
    steps: t("Home:stepsToday"),
  };
  const { value, bars } = weekSeries(snapshot, active);
  const shown =
    value === null ? t("Home:noData") : active === "sleep" || active === "study" ? `${value}h` : value.toLocaleString();
  return (
    <FeedCard>
      <Text style={styles.headerTitle}>{t("Home:thisWeek")}</Text>
      <View style={styles.tabs}>
        {tabs.map((k) => (
          <AnimatedPressable
            key={k}
            style={[styles.tab, k === active && styles.tabActive]}
            onPress={() => setTab(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: k === active }}
            accessibilityLabel={label[k]}
          >
            <Text style={[styles.tabGlyph, k !== active && styles.tabGlyphIdle]}>{FEED_ICON[k]}</Text>
          </AnimatedPressable>
        ))}
      </View>
      <Text style={styles.weekLabel}>{label[active]}</Text>
      <Text style={[styles.weekValue, value === null && styles.weekValueEmpty]}>{shown}</Text>
      <Text style={styles.statLabelPlain}>{caption[active].toUpperCase()}</Text>
      <WeekBars bars={bars} height={56} />
    </FeedCard>
  );
}

export function GettingStartedCard({
  items,
  onAction,
}: {
  items: StartItem[];
  onAction: (key: StartItem["key"]) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Home");
  const doneCount = items.filter((i) => i.done).length;
  const copy: Record<StartItem["key"], { title: string; body: string; action: string }> = {
    sleep: { title: t("sleepTitle"), body: t("sleepBody"), action: t("sleepAction") },
    stepGoal: { title: t("stepGoalTitle"), body: t("stepGoalBody"), action: t("setGoal") },
    healthConnect: { title: t("healthConnectTitle"), body: t("healthConnectBody"), action: t("howToConnect") },
    study: { title: t("studyTitle"), body: t("studyBody"), action: t("studyAction") },
  };
  return (
    <FeedCard>
      <View style={styles.gsHeader}>
        <Text style={styles.gsTitle}>{t("gettingStarted")}</Text>
        <Text style={styles.headerRange}>{t("progress", { done: doneCount, total: items.length })}</Text>
      </View>
      {items.map((item, i) => (
        <View key={item.key} style={[styles.gsItem, i > 0 && styles.gsItemBorder]}>
          <Text style={[styles.gsMark, item.done && { color: colors.statusGood }]}>{item.done ? "✓" : "○"}</Text>
          <View style={styles.flex}>
            <Text style={styles.gsItemTitle}>
              {copy[item.key].title}
              {item.done ? <Text style={styles.headerRange}>{`  ${t("done")}`}</Text> : null}
            </Text>
            <Text style={styles.gsBody}>{copy[item.key].body}</Text>
            {item.done ? null : (
              <AnimatedPressable style={styles.smallButton} onPress={() => onAction(item.key)} accessibilityRole="button">
                <Text style={styles.smallButtonText}>{copy[item.key].action}</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      ))}
    </FeedCard>
  );
}

// Steps feed card (read-only, from Health Connect). Caller renders it only
// when steps are allowed.
export function StepsFeedCard({
  steps,
  goal,
  range,
  bars,
}: {
  steps: number | null;
  goal: number;
  range?: string | null;
  bars: WeekBar[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Home");
  const progress = steps == null ? 0 : Math.min(100, Math.round((steps / goal) * 100));
  const reached = steps != null && steps >= goal;
  return (
    <FeedCard>
      <FeedCardHeader icon={FEED_ICON.steps} title={t("stepsTitle")} range={range} />
      <View style={styles.stepsRow}>
        <View style={styles.flex}>
          {steps != null ? (
            <Text style={styles.statValueInline}>{steps.toLocaleString()}</Text>
          ) : (
            <Text style={[styles.weekValue, styles.weekValueEmpty]}>{t("noData")}</Text>
          )}
          <Text style={styles.headerRange}>
            {t("ofGoal", { goal: goal.toLocaleString() })} · {t("today")}
          </Text>
        </View>
        <Text style={styles.stepsPct}>
          {progress}%{reached ? " ✓" : ""}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${progress}%` }]} />
      </View>
      <WeekBars bars={bars} />
    </FeedCard>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    headerLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
    headerIcon: { fontSize: 18, lineHeight: 22 },
    headerTitle: { fontSize: 16, fontWeight: "800", color: colors.foreground },
    headerRange: { fontSize: 12, color: colors.mutedForeground },
    stat: { marginTop: 14 },
    statValue: { fontSize: 36, lineHeight: 40, fontWeight: "800", color: colors.foreground },
    statValueInline: { fontSize: 36, lineHeight: 40, fontWeight: "800", color: colors.foreground },
    statLabel: { marginTop: 4, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, color: colors.mutedForeground },
    statLabelPlain: { marginTop: 4, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, color: colors.mutedForeground },
    barsWrap: { marginTop: 16 },
    barsRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
    barSlot: { flex: 1, height: "100%", justifyContent: "flex-end" },
    bar: { width: "100%", borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
    labelsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
    dayLabel: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "500", color: colors.mutedForeground },
    dayLabelToday: { fontWeight: "800", color: colors.foreground },
    profileTop: { alignItems: "center", gap: 10 },
    avatar: { width: 64, height: 64, borderRadius: 32 },
    avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: colors.orange },
    avatarText: { fontSize: 26, fontWeight: "800", color: colors.orangeForeground },
    nickname: { fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: "center" },
    statsRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    profileStat: { flex: 1, alignItems: "center", gap: 4 },
    profileStatValue: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    profileStatEmpty: { fontSize: 12, fontWeight: "500", color: colors.mutedForeground },
    profileStatLabel: { fontSize: 11, textAlign: "center", color: colors.mutedForeground },
    linkRow: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, minHeight: 32 },
    link: { fontSize: 14, fontWeight: "700", color: colors.primary },
    tabs: { flexDirection: "row", gap: 4, marginTop: 12, padding: 4, borderRadius: radius.md, backgroundColor: colors.soft },
    tab: { flex: 1, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
    tabActive: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.orange },
    tabGlyph: { fontSize: 15 },
    tabGlyphIdle: { opacity: 0.5 },
    weekLabel: { marginTop: 14, fontSize: 12, fontWeight: "600", color: colors.mutedForeground },
    weekValue: { marginTop: 4, fontSize: 36, lineHeight: 40, fontWeight: "800", color: colors.foreground },
    weekValueEmpty: { fontSize: 20, lineHeight: 26, color: colors.mutedForeground },
    gsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 4, marginBottom: 12 },
    gsTitle: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    gsItem: { flexDirection: "row", gap: 12, paddingVertical: 12 },
    gsItemBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    gsMark: { fontSize: 18, lineHeight: 22, width: 20, color: colors.mutedForeground },
    gsItemTitle: { fontSize: 14, fontWeight: "700", color: colors.foreground },
    gsBody: { marginTop: 2, fontSize: 13, color: colors.mutedForeground },
    smallButton: {
      alignSelf: "flex-start",
      marginTop: 10,
      minHeight: 36,
      paddingHorizontal: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    smallButtonText: { fontSize: 13, fontWeight: "700", color: colors.primaryForeground },
    stepsRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 12 },
    stepsPct: { fontSize: 18, fontWeight: "800", color: colors.foreground },
    track: { marginTop: 12, height: 8, borderRadius: radius.sm, backgroundColor: colors.track, overflow: "hidden" },
    trackFill: { height: "100%", backgroundColor: colors.orange },
  });
}
