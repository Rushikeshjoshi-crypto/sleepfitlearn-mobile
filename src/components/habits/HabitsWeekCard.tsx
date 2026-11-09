import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import type { ContextEvent } from "../../lib/api/context";
import { isoDaysAgo } from "../../lib/dateRange";
import { averageDailyScreenTime } from "../../lib/habits/screenTimeAverage";
import { encouragementKey } from "../../lib/habits/habitDays";
import { formatMinutes } from "../../lib/formatMinutes";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";

const RING_SIZE = 120;
const RING_STROKE = 12;

// "This week" card (last 7 days): a ring with the average routine adherence,
// then small stats. The All habits filter decides which parts show (screen
// time only: the daily average replaces the ring).
export function HabitsWeekCard({ events, filter }: { events: ContextEvent[]; filter: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Habits");

  const weekStart = isoDaysAgo(6);
  const thisWeek = events.filter((e) => e.event_date >= weekStart);
  const screenTime = thisWeek.filter((e) => e.event_type === "screen_time");
  const routine = thisWeek.filter((e) => e.event_type === "routine");
  const avgMinutes = averageDailyScreenTime(screenTime);
  const avgAdherence = routine.length
    ? Math.round(routine.reduce((sum, e) => sum + (e.metadata?.adherence_pct ?? 0), 0) / routine.length)
    : null;
  const daysLogged = new Set(thisWeek.map((e) => e.event_date)).size;

  const showRoutine = filter !== "screen_time";
  const showScreenTime = filter !== "routine";

  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = ((avgAdherence ?? 0) / 100) * circumference;

  const stats = [
    ...(showScreenTime && filter === "all"
      ? [{ label: t("avgDailyScreenTime"), value: avgMinutes !== null ? formatMinutes(avgMinutes) : "—" }]
      : []),
    ...(showRoutine ? [{ label: t("routineCheckIns"), value: String(routine.length) }] : []),
    { label: t("daysLogged"), value: t("daysOutOfSeven", { count: daysLogged }) },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t("thisWeek")}</Text>
      <View style={styles.row}>
        {showRoutine ? (
          <View style={styles.ring} accessible accessibilityLabel={avgAdherence !== null ? t("ringAria", { pct: avgAdherence }) : t("noEntriesThisWeek")}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} style={styles.svg}>
              <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" strokeWidth={RING_STROKE} stroke={colors.track} />
              {avgAdherence !== null && avgAdherence > 0 && (
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={r}
                  fill="none"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  stroke={colors.orange}
                  strokeDasharray={`${filled} ${circumference}`}
                />
              )}
            </Svg>
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={styles.ringValue}>{avgAdherence !== null ? `${avgAdherence}%` : "—"}</Text>
              <Text style={styles.muted}>{t("avgRoutineAdherenceShort")}</Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.bigValue}>{avgMinutes !== null ? formatMinutes(avgMinutes) : "—"}</Text>
            <Text style={styles.muted}>{t("avgDailyScreenTime")}</Text>
          </View>
        )}

        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label}>
              <Text style={styles.muted}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.muted}>
        {showRoutine ? t(encouragementKey(avgAdherence)) : avgMinutes === null ? t("noEntriesThisWeek") : t("screenTimeAwareness")}
      </Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
    label: { fontSize: typography.label.fontSize, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
    row: { flexDirection: "row", alignItems: "center", gap: 20 },
    ring: { width: RING_SIZE, height: RING_SIZE },
    svg: { transform: [{ rotate: "-90deg" }] },
    ringCenter: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
    ringValue: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, color: colors.orange },
    bigValue: { fontSize: 36, fontWeight: "800", letterSpacing: -1, color: colors.orange },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    stats: { flex: 1, gap: 10 },
    statValue: { fontSize: 20, fontWeight: "800", color: colors.foreground },
  });
}
