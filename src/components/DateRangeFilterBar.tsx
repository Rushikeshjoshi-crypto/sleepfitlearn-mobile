import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  resolvePresetRange,
  isValidCustomRange,
  type DateFilterPreset,
  type DateFilterValue,
} from "../lib/dateRangeFilter";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";
import CalendarModal from "./CalendarModal";

const PRESETS: Exclude<DateFilterPreset, "custom">[] = ["today", "yesterday", "last7", "last30"];
const PRESET_KEY: Record<Exclude<DateFilterPreset, "custom">, string> = {
  today: "today",
  yesterday: "yesterday",
  last7: "last7Days",
  last30: "last30Days",
};

// Shared date-range filter for log history views (Sleep, Study) — ports
// web's src/components/DateRangeFilter.tsx. Presets resolve immediately;
// Custom Range opens the existing CalendarModal twice (start/end) rather
// than web's native <input type="date"> pair, since RN has no equivalent.
export default function DateRangeFilterBar({
  value,
  onChange,
}: {
  value: DateFilterValue | null;
  onChange: (value: DateFilterValue | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Common");
  const [customOpen, setCustomOpen] = useState(value?.preset === "custom");
  const [draftFrom, setDraftFrom] = useState<string | null>(value?.preset === "custom" ? value.from : null);
  const [draftTo, setDraftTo] = useState<string | null>(value?.preset === "custom" ? value.to : null);
  const [pickerOpen, setPickerOpen] = useState<"from" | "to" | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  function choosePreset(preset: Exclude<DateFilterPreset, "custom">) {
    setCustomOpen(false);
    setRangeError(null);
    onChange({ preset, ...resolvePresetRange(preset) });
  }

  function openCustom() {
    setCustomOpen(true);
    setRangeError(null);
  }

  function applyCustom() {
    if (!draftFrom || !draftTo || !isValidCustomRange(draftFrom, draftTo)) {
      setRangeError(t("dateFilter.invalidRange"));
      return;
    }
    setRangeError(null);
    onChange({ preset: "custom", from: draftFrom, to: draftTo });
  }

  function clear() {
    setCustomOpen(false);
    setDraftFrom(null);
    setDraftTo(null);
    setRangeError(null);
    onChange(null);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.pillRow}>
        {PRESETS.map((preset) => (
          <AnimatedPressable
            key={preset}
            style={[styles.pill, value?.preset === preset && styles.pillActive]}
            onPress={() => choosePreset(preset)}
          >
            <Text style={[styles.pillText, value?.preset === preset && styles.pillTextActive]}>
              {t(`dateFilter.${PRESET_KEY[preset]}`)}
            </Text>
          </AnimatedPressable>
        ))}
        <AnimatedPressable
          style={[styles.pill, (value?.preset === "custom" || customOpen) && styles.pillActive]}
          onPress={openCustom}
        >
          <Text style={[styles.pillText, (value?.preset === "custom" || customOpen) && styles.pillTextActive]}>
            {t("dateFilter.customRange")}
          </Text>
        </AnimatedPressable>
        {value && (
          <AnimatedPressable style={styles.clearPill} onPress={clear}>
            <Text style={styles.clearText}>✕ {t("dateFilter.clearFilter")}</Text>
          </AnimatedPressable>
        )}
      </View>

      {customOpen && (
        <View style={styles.customPanel}>
          <View style={styles.customRow}>
            <AnimatedPressable style={styles.dateField} onPress={() => setPickerOpen("from")}>
              <Text style={styles.dateFieldLabel}>{t("dateFilter.startDate")}</Text>
              {/* "Select" placeholder is mobile-only — web's native date
                  input shows nothing until a value is picked, no separate
                  placeholder string to port. */}
              <Text style={draftFrom ? styles.dateFieldValue : styles.dateFieldPlaceholder}>
                {draftFrom ?? "Select"}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.dateField} onPress={() => setPickerOpen("to")}>
              <Text style={styles.dateFieldLabel}>{t("dateFilter.endDate")}</Text>
              <Text style={draftTo ? styles.dateFieldValue : styles.dateFieldPlaceholder}>{draftTo ?? "Select"}</Text>
            </AnimatedPressable>
          </View>
          <AnimatedPressable style={styles.applyButton} onPress={applyCustom}>
            <Text style={styles.applyButtonText}>{t("dateFilter.apply")}</Text>
          </AnimatedPressable>
        </View>
      )}

      {rangeError && <Text style={styles.errorText}>{rangeError}</Text>}

      {value && (
        <Text style={styles.activeLabel}>
          {t("dateFilter.activeFilterLabel")}: {value.from === value.to ? value.from : `${value.from} → ${value.to}`}
        </Text>
      )}

      <CalendarModal
        visible={pickerOpen !== null}
        selectedDate={pickerOpen === "from" ? draftFrom : draftTo}
        onSelect={(iso) => {
          if (pickerOpen === "from") setDraftFrom(iso);
          else if (pickerOpen === "to") setDraftTo(iso);
          setPickerOpen(null);
        }}
        onClose={() => setPickerOpen(null)}
      />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
    pill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    pillText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, fontWeight: "500" },
    pillTextActive: { color: colors.primaryForeground },
    clearPill: { paddingVertical: 6, paddingHorizontal: 4 },
    clearText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, fontWeight: "500" },
    customPanel: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 12,
      gap: 10,
    },
    customRow: { flexDirection: "row", gap: 10 },
    dateField: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    dateFieldLabel: { fontSize: 11, color: colors.mutedForeground, marginBottom: 2 },
    dateFieldValue: { fontSize: 14, color: colors.foreground, fontWeight: "500" },
    dateFieldPlaceholder: { fontSize: 14, color: colors.mutedForeground },
    applyButton: {
      alignSelf: "flex-start",
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 18,
    },
    applyButtonText: { color: colors.primaryForeground, fontSize: typography.bodySmall.fontSize, fontWeight: "600" },
    errorText: { fontSize: typography.label.fontSize, color: colors.destructive },
    activeLabel: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
  });
}
