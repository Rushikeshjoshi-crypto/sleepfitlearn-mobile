import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { useTranslation } from "react-i18next";
import type { ContextEvent } from "../../lib/api/context";
import { dayState, monthDates, type DayState } from "../../lib/habits/habitDays";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

const ITEM_W = 44;

// Consistency: one round circle per day of this / last month (scrolled so
// today is in view). Tapping a past day opens it in the Today card.
export function HabitsMonthCard({
  events,
  today,
  filter,
  selected,
  onSelect,
}: {
  events: ContextEvent[];
  today: string;
  filter: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Habits", "Common"]);
  const [offset, setOffset] = useState<0 | -1>(0);
  const scroller = useRef<ScrollViewInstance>(null);
  const [width, setWidth] = useState(0);
  const dates = monthDates(today, offset);

  useEffect(() => {
    const idx = dates.indexOf(today);
    const x = idx >= 0 ? Math.max(0, idx * ITEM_W - width / 2 + ITEM_W / 2) : 0;
    scroller.current?.scrollTo({ x, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, width]);

  const stateLabel: Record<DayState, string> = {
    done: t("Habits:legendDone"),
    partial: t("Habits:legendPartial"),
    missed: t("Habits:legendMissed"),
    future: t("Habits:legendFuture"),
  };

  function circleStyle(state: DayState, isToday: boolean, isSelected: boolean) {
    if (isToday) return [styles.circle, { backgroundColor: colors.orange }];
    const base =
      state === "done"
        ? { backgroundColor: colors.soft, borderColor: colors.orange, borderWidth: 1 }
        : state === "partial"
          ? { backgroundColor: colors.soft, borderColor: colors.border, borderWidth: 1 }
          : state === "missed"
            ? { backgroundColor: colors.track }
            : { borderColor: colors.border, borderWidth: 1, borderStyle: "dashed" as const };
    return [styles.circle, base, isSelected && { borderColor: colors.foreground, borderWidth: 2 }];
  }

  function glyph(state: DayState, isToday: boolean) {
    if (isToday) return { text: "•", color: colors.orangeForeground };
    if (state === "done") return { text: "✓", color: colors.primary };
    if (state === "partial") return { text: "◐", color: colors.primary };
    if (state === "missed") return { text: "–", color: colors.mutedForeground };
    return { text: "", color: colors.mutedForeground };
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title}>{t("Habits:consistencyTitle")}</Text>
          <Text style={styles.muted}>
            {filter === "screen_time" ? t("Habits:consistencyHintScreenTime") : t("Habits:consistencyHint")}
          </Text>
        </View>
      </View>

      <View style={styles.monthPicker} accessibilityLabel={t("Habits:monthSelectLabel")}>
        {([0, -1] as const).map((o) => (
          <AnimatedPressable key={o} style={[styles.monthBtn, offset === o && styles.monthBtnOn]} onPress={() => setOffset(o)} accessibilityRole="button">
            <Text style={[styles.monthText, offset === o && styles.monthTextOn]}>
              {o === 0 ? t("Habits:thisMonth") : t("Habits:lastMonth")}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {dates.map((date) => {
          const state = dayState(events, date, today, filter);
          const isToday = date === today;
          const g = glyph(state, isToday);
          return (
            <View key={date} style={styles.item}>
              <AnimatedPressable
                disabled={state === "future"}
                onPress={() => onSelect(date)}
                accessibilityRole="button"
                accessibilityState={{ selected: date === selected, disabled: state === "future" }}
                accessibilityLabel={`${date}, ${stateLabel[state]}${isToday ? `, ${t("Common:today")}` : ""}`}
                style={circleStyle(state, isToday, date === selected)}
              >
                <Text style={[styles.glyph, { color: g.color }]}>{g.text}</Text>
              </AnimatedPressable>
              <Text style={[styles.dayNum, isToday && styles.dayNumToday]}>{Number(date.slice(8))}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.legend}>
        {(["done", "partial", "missed"] as const).map((state) => (
          <Text key={state} style={styles.muted}>
            {glyph(state, false).text} {stateLabel[state]}
          </Text>
        ))}
        <Text style={styles.muted}>
          <Text style={{ color: colors.orange }}>●</Text> {t("Common:today")}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
    head: { flexDirection: "row", gap: 8 },
    title: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground },
    muted: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground },
    monthPicker: { flexDirection: "row", gap: 8 },
    monthBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 12 },
    monthBtnOn: { backgroundColor: colors.orange, borderColor: colors.orange },
    monthText: { fontSize: typography.bodySmall.fontSize, fontWeight: "600", color: colors.mutedForeground },
    monthTextOn: { color: colors.orangeForeground, fontWeight: "800" },
    item: { width: ITEM_W, alignItems: "center", gap: 4 },
    circle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    glyph: { fontSize: 16, fontWeight: "800" },
    dayNum: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
    dayNumToday: { color: colors.primary, fontWeight: "800" },
    legend: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  });
}
