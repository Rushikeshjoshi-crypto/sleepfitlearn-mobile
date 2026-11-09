import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { topApps, type ContextEvent } from "../../lib/api/context";
import { changePct, monthRange, screenTimeBetween } from "../../lib/habits/habitDays";
import { formatMinutes } from "../../lib/formatMinutes";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";

const MAX_BARS = 6;
const BAR_MAX = 140;
const BAR_MIN = 8;

// Most used apps this month: one bar per app (top 6), summed from the apps
// already synced onto each screen_time event. The top app is orange with its
// minutes and change vs last month (when last month has data for it).
export function MostUsedAppsCard({ events, today }: { events: ContextEvent[]; today: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Habits");

  const thisMonth = monthRange(today, 0);
  const lastMonthRange = monthRange(today, -1);
  const apps = topApps(screenTimeBetween(events, thisMonth.from, today)).slice(0, MAX_BARS);
  const lastMonth = new Map(
    topApps(screenTimeBetween(events, lastMonthRange.from, lastMonthRange.to)).map((a) => [a.package_name, a.minutes_used]),
  );
  const top = apps[0];
  const max = top?.minutes_used ?? 0;
  const change = top ? changePct(top.minutes_used, lastMonth.get(top.package_name)) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t("mostUsedAppsTitle")}</Text>
      <Text style={styles.muted}>{t("mostUsedAppsThisMonth")}</Text>

      {!top ? (
        <Text style={styles.body}>{t("noAppUsageThisMonth")}</Text>
      ) : (
        <>
          <View style={styles.topBlock}>
            <Text style={styles.topName} numberOfLines={1}>
              {top.app_name}
            </Text>
            <Text style={styles.topValue}>{formatMinutes(top.minutes_used)}</Text>
            {change !== null && (
              <Text style={styles.muted}>
                {change >= 0 ? "▲ " : "▼ "}
                {t("vsLastMonth", { change: `${change > 0 ? "+" : ""}${change}%` })}
              </Text>
            )}
          </View>
          <View
            style={styles.chart}
            accessible
            accessibilityLabel={apps.map((a) => `${a.app_name} ${formatMinutes(a.minutes_used)}`).join(", ")}
          >
            {apps.map((app, i) => {
              const height = max > 0 ? Math.max(BAR_MIN, Math.round((app.minutes_used / max) * BAR_MAX)) : BAR_MIN;
              return (
                <View key={app.package_name} style={styles.col}>
                  <View style={styles.barBox}>
                    <View style={[styles.bar, { height, backgroundColor: i === 0 ? colors.orange : colors.bar }]} />
                  </View>
                  <Text style={styles.appName} numberOfLines={1}>
                    {app.app_name}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 6 },
    label: { fontSize: typography.label.fontSize, fontWeight: "800", color: colors.primary, textTransform: "uppercase", letterSpacing: 0.8 },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground, marginTop: 6 },
    topBlock: { marginTop: 8, gap: 2 },
    topName: { fontSize: typography.body.fontSize, fontWeight: "700", color: colors.foreground },
    topValue: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.orange },
    chart: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 },
    col: { flex: 1, alignItems: "center", gap: 6, minWidth: 0 },
    barBox: { height: BAR_MAX, width: "100%", justifyContent: "flex-end", alignItems: "center" },
    bar: { width: "100%", maxWidth: 36, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
    appName: { fontSize: 11, color: colors.mutedForeground, width: "100%", textAlign: "center" },
  });
}
