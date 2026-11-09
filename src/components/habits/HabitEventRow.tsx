import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { topApps, type ContextEvent } from "../../lib/api/context";
import { formatMinutes } from "../../lib/formatMinutes";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

export function habitValueLabel(events: ContextEvent[]): string {
  const [first] = events;
  if (first.event_type === "screen_time") {
    return formatMinutes(events.reduce((sum, e) => sum + (e.metadata?.minutes ?? 0), 0));
  }
  return `${first.metadata?.adherence_pct ?? 0}%`;
}

// One entry: a day's screen time rows merged into one (with a tap-to-open app
// breakdown) or a single routine row. Edit and delete stay on the row.
export function HabitEventRow({
  events,
  showDate = false,
  onEdit,
  onDelete,
}: {
  events: ContextEvent[];
  showDate?: boolean;
  onEdit: (events: ContextEvent[]) => void;
  onDelete: (events: ContextEvent[]) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Habits", "Common"]);
  const [open, setOpen] = useState(false);
  const [first] = events;
  const apps = first.event_type === "screen_time" ? topApps(events) : [];
  const label = t(`Habits:eventTypes.${first.event_type}`);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <AnimatedPressable
          style={styles.main}
          disabled={apps.length === 0}
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open ? t("Habits:hideAppBreakdown") : t("Habits:showAppBreakdown")}
        >
          <View style={styles.flex}>
            <Text style={styles.name}>
              {label}
              {apps.length > 0 ? (open ? "  ▾" : "  ▸") : ""}
            </Text>
            {showDate && <Text style={styles.muted}>{first.event_date}</Text>}
          </View>
          <Text style={styles.value}>{habitValueLabel(events)}</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.iconBtn} onPress={() => onEdit(events)} accessibilityRole="button" accessibilityLabel={t("Common:editEntry")}>
          <Text style={styles.glyph}>✎</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.iconBtn} onPress={() => onDelete(events)} accessibilityRole="button" accessibilityLabel={t("Common:deleteEntry")}>
          <Text style={[styles.glyph, { color: colors.destructive }]}>🗑</Text>
        </AnimatedPressable>
      </View>
      {open &&
        apps.map((app) => (
          <View key={app.package_name} style={styles.appRow}>
            <Text style={styles.muted}>{app.app_name}</Text>
            <Text style={styles.muted}>{formatMinutes(app.minutes_used)}</Text>
          </View>
        ))}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    row: { flexDirection: "row", alignItems: "center" },
    main: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 44 },
    flex: { flex: 1 },
    name: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    value: { fontSize: typography.body.fontSize, fontWeight: "800", color: colors.foreground },
    iconBtn: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
    glyph: { fontSize: 15, color: colors.mutedForeground },
    appRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingLeft: 12, paddingRight: 8 },
  });
}
