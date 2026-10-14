import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";
import { getDateFnsLocale } from "../lib/i18n/dateFnsLocale";

// Monday-first week grid, indices matching buildGrid()'s start-of-week
// convention below — labels use the app's own selected language (via
// date-fns), not the OS's default locale, so this stays consistent with the
// rest of the translated UI regardless of device settings.
function buildWeekdayLabels(locale: ReturnType<typeof getDateFnsLocale>): string[] {
  // Any Monday works as the anchor date; only the weekday name is read.
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return format(d, "EEEEEE", { locale });
  });
}

// Local-date formatting (not toISOString, which converts to UTC and can
// shift the date by a day for timezones ahead of UTC, e.g. IST late-night).
function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const firstDow = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - firstDow);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function CalendarModal({
  visible,
  selectedDate,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedDate: string | null;
  onSelect: (iso: string | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Common");
  const dateFnsLocale = useMemo(() => getDateFnsLocale(i18n.language), [i18n.language]);
  const weekdayLabels = useMemo(() => buildWeekdayLabels(dateFnsLocale), [dateFnsLocale]);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());

  useEffect(() => {
    if (visible) {
      const d = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [visible, selectedDate]);

  const todayIso = localISO(new Date());
  const cells = buildGrid(viewYear, viewMonth);

  function changeMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <AnimatedPressable onPress={() => changeMonth(-1)} hitSlop={8}>
              <Text style={styles.navArrow}>{"‹"}</Text>
            </AnimatedPressable>
            <Text style={styles.monthLabel}>{format(new Date(viewYear, viewMonth, 1), "LLLL yyyy", { locale: dateFnsLocale })}</Text>
            <AnimatedPressable onPress={() => changeMonth(1)} hitSlop={8}>
              <Text style={styles.navArrow}>{"›"}</Text>
            </AnimatedPressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((label, i) => (
              <Text key={i} style={styles.weekdayLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((date) => {
              const iso = localISO(date);
              const inMonth = date.getMonth() === viewMonth;
              const isFuture = iso > todayIso;
              const isSelected = iso === selectedDate;
              const isToday = iso === todayIso;
              return (
                <AnimatedPressable
                  key={iso}
                  style={[styles.cell, isSelected && styles.cellSelected, isToday && !isSelected && styles.cellToday]}
                  disabled={isFuture}
                  onPress={() => {
                    onSelect(iso);
                    onClose();
                  }}
                >
                  <Text
                    style={[
                      styles.cellText,
                      !inMonth && styles.cellTextOutside,
                      isFuture && styles.cellTextDisabled,
                      isSelected && styles.cellTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            {/* No matching web key for a bare "Clear" (web only has
                "Clear filter", a longer phrase for a different context). */}
            <AnimatedPressable onPress={() => onSelect(null)}>
              <Text style={styles.footerLink}>Clear</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => {
                onSelect(todayIso);
                onClose();
              }}
            >
              <Text style={styles.footerLink}>{t("today")}</Text>
            </AnimatedPressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.card, borderRadius: 20, padding: 16, gap: 12 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    monthLabel: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    navArrow: { fontSize: 22, color: colors.mutedForeground, paddingHorizontal: 8 },
    weekdayRow: { flexDirection: "row" },
    weekdayLabel: {
      flex: 1,
      textAlign: "center",
      fontSize: typography.label.fontSize,
      fontWeight: "600",
      color: colors.mutedForeground,
    },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
    },
    cellSelected: { backgroundColor: colors.primary },
    cellToday: { borderWidth: 1, borderColor: colors.navTint },
    cellText: { fontSize: 14, color: colors.foreground },
    cellTextOutside: { color: colors.mutedForeground, opacity: 0.5 },
    cellTextDisabled: { color: colors.mutedForeground, opacity: 0.3 },
    cellTextSelected: { color: colors.primaryForeground, fontWeight: "700" },
    footer: { flexDirection: "row", justifyContent: "space-between", paddingTop: 4 },
    footerLink: { color: colors.navTint, fontWeight: "600", fontSize: 14 },
  });
}
