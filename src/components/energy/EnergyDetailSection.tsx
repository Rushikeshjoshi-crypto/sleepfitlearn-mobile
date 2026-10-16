import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { ENERGY_WEIGHTS } from "../../lib/energy/calculate";
import { setRestDay, syncEnergyForDate, type EnergySnapshot } from "../../lib/energy/sync";
import { energyBreakdown, shiftDay } from "../../lib/energy/detail";
import { energyBar } from "../../lib/vitals/tile";
import { todayISO } from "../../lib/dateRange";

// Same colours as the Personal Energy tile (web emerald-500 / amber-400 / destructive).
const ENERGY_GREEN = "#10B981";
const ENERGY_AMBER = "#FBBF24";

// The Energy tile's popup — same content as the web's EnergyDialog: how it's
// calculated, the score for a day (today by default, ‹ › for earlier days),
// its sleep / workout breakdown, and the rest-day switch (only on days with
// no workout logged). Reading a day also stores its score (syncEnergyForDate),
// so `onChanged` refreshes the Personal tiles when that changed something.
export function EnergyDetailSection({ onChanged }: { onChanged?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Personal");
  const [date, setDate] = useState(todayISO);
  const [snapshot, setSnapshot] = useState<EnergySnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  // A ref, so a new onChanged (the parent re-rendering after a refresh) never re-triggers a load.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const load = useCallback(async (d: string) => {
    setState("loading");
    try {
      const { snapshot: s, changed } = await syncEnergyForDate(d);
      setSnapshot(s);
      setState("ready");
      if (changed) onChangedRef.current?.();
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  async function onRestDay(next: boolean) {
    if (!snapshot) return;
    setSaving(true);
    try {
      await setRestDay(date, next, snapshot.restDaySk);
      await load(date);
      onChangedRef.current?.();
    } catch {
      Alert.alert(t("energy.title"), t("energy.restDayError"));
    } finally {
      setSaving(false);
    }
  }

  const isToday = date >= todayISO();
  const result = snapshot?.result;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("energy.title")}</Text>
      <Text style={styles.hint}>
        {t("energy.info", {
          sleepPct: Math.round(ENERGY_WEIGHTS.sleep * 100),
          workoutPct: Math.round(ENERGY_WEIGHTS.workout * 100),
        })}
      </Text>

      <View style={styles.dateRow}>
        <AnimatedPressable style={styles.arrow} onPress={() => setDate((d) => shiftDay(d, -1))} accessibilityRole="button" accessibilityLabel={t("energy.previousDay")}>
          <Text style={styles.arrowText}>‹</Text>
        </AnimatedPressable>
        <Text style={styles.date}>{isToday ? t("Common:today") : date}</Text>
        <AnimatedPressable
          style={[styles.arrow, isToday && styles.arrowDisabled]}
          onPress={() => setDate((d) => shiftDay(d, 1))}
          disabled={isToday}
          accessibilityRole="button"
          accessibilityLabel={t("energy.nextDay")}
        >
          <Text style={styles.arrowText}>›</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.box}>
        {state === "loading" ? (
          <ActivityIndicator color={colors.navTint} />
        ) : state === "error" || !snapshot ? (
          <Text style={styles.error}>{t("energy.loadError")}</Text>
        ) : result?.score == null || !result.label ? (
          <Text style={styles.hint}>{t("energy.empty")}</Text>
        ) : (
          (() => {
            const bar = energyBar(result.score);
            const color = bar.label === "low" ? colors.destructive : bar.label === "moderate" ? ENERGY_AMBER : ENERGY_GREEN;
            const parts = energyBreakdown(snapshot);
            return (
              <>
                <Text style={styles.score}>
                  <Text style={{ color }}>{t(`energyLabels.${bar.label}`)}</Text>
                  <Text style={styles.outOf}>  {result.score} / 100</Text>
                </Text>
                <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: bar.percent }}>
                  <View style={[styles.fill, { width: `${bar.percent}%`, backgroundColor: color }]} />
                </View>
                <Text style={styles.hint}>
                  {t(`energy.${parts.sleep.key}`, parts.sleep.values)} | {t(`energy.${parts.workout.key}`, parts.workout.values)}
                </Text>
                {parts.basis && <Text style={styles.hint}>{t(`energy.${parts.basis}`)}</Text>}
              </>
            );
          })()
        )}
      </View>

      {/* A logged workout always wins over a rest-day mark, so the switch only shows on days without one. */}
      {state === "ready" && snapshot && !snapshot.hasWorkoutEntries && (
        <View style={styles.restRow}>
          <Text style={[styles.body, styles.restLabel]}>{t("energy.restDayLabel")}</Text>
          {saving ? (
            <ActivityIndicator color={colors.navTint} />
          ) : (
            <Switch value={snapshot.restDay} onValueChange={onRestDay} trackColor={{ true: colors.navTint, false: colors.border }} thumbColor={colors.card} />
          )}
        </View>
      )}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { gap: 12 },
    title: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    hint: { fontSize: typography.label.fontSize, color: colors.mutedForeground, lineHeight: 18 },
    body: { fontSize: typography.body.fontSize, color: colors.foreground },
    error: { fontSize: typography.body.fontSize, color: colors.destructive },
    dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    arrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    arrowDisabled: { opacity: 0.35 },
    arrowText: { fontSize: 22, color: colors.foreground, marginTop: -2 },
    date: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    box: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, gap: 8, minHeight: 60, justifyContent: "center" },
    score: { fontSize: 24, fontWeight: "700" },
    outOf: { fontSize: typography.label.fontSize, fontWeight: "400", color: colors.mutedForeground },
    track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
    fill: { height: 6, borderRadius: 3 },
    restRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    restLabel: { flex: 1 },
  });
}
