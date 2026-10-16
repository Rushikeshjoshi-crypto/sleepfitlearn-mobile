import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useTranslation } from "react-i18next";
import {
  BP_META,
  METRIC_META,
  WEIGHT_META,
  createBpEntry,
  createSimpleMetricEntry,
  createWeightEntry,
  deleteBpEntry,
  deleteSimpleMetricEntry,
  deleteWeightEntry,
  listPersonalEntries,
  updateBpEntry,
  updateSimpleMetricEntry,
  updateWeightEntry,
  type PersonalEntry,
  type SimpleMetricType,
  isWeightInRange,
} from "../lib/api/fitness";
import { todayISO } from "../lib/dateRange";
import { groupByDate, dateGroupLabel } from "../lib/groupByDate";
import { groupByKey } from "../lib/groupByKey";
import { formatIcuPlural } from "../lib/i18n/icuPlural";
import { HistoryCard } from "../components/history/HistoryCard";
import { HistoryDateGroup } from "../components/history/HistoryDateGroup";
import { HistoryEntryRow } from "../components/history/HistoryEntryRow";
import SelectModal, { type SelectSection } from "../components/SelectModal";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ModernButton } from "../components/ModernButton";
import CalendarModal from "../components/CalendarModal";
import { loadErrorText } from "../lib/api/gateErrors";
import { useSingleFlight } from "../lib/singleFlight";
import { showSaveError } from "../lib/ui/apiErrors";
import type { AgeBand } from "../lib/api/users";
import { checkVitalsAccess } from "../lib/vitals/eligibility";
import { hideSyncedVitals } from "../lib/vitals/display";
import {
  bloodPressureBand,
  bloodPressureNeedsDoctor,
  heartRateNeedsDoctor,
  restingHeartRateBand,
  type RangeBand,
} from "../lib/vitals/ranges";
import { sourceLabel } from "../lib/vitals/sourceLabel";
import { RangeDot } from "../components/vitals/RangeDot";
import { VitalsPersonalSection } from "../components/vitals/VitalsPersonalSection";
import { EnergyDetailSection } from "../components/energy/EnergyDetailSection";
import { BlurBackdrop } from "../components/BlurBackdrop";
import { bloodPressureTile, energyBar, heartRateTile, tileEntry, type VitalsTile } from "../lib/vitals/tile";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type MetricKey = "weight" | "bp" | SimpleMetricType;

// Energy bar colours — the web's EnergyLevelCard emerald-500 / amber-400.
const ENERGY_GREEN = "#10B981";
const ENERGY_AMBER = "#FBBF24";

// Translation keys for metric labels — Trends.* has a matching key for most
// (this same metric catalog backs the Trends charts on web); height_cm and
// energy_level have no matching key there, so metricLabel() below falls back
// to the METRIC_META English label for just those two.
const METRIC_LABEL_KEY: Partial<Record<MetricKey, string>> = {
  weight: "Trends:weightTitle",
  bp: "Trends:bloodPressureLabel",
  heart_rate: "Trends:heartRateLabel",
  waist_cm: "Trends:waistLabel",
  chin_ups: "Trends:chinUpsLabel",
  bench_press: "Trends:benchPressLabel",
};

function metricEnglishLabel(kind: MetricKey): string {
  if (kind === "weight") return WEIGHT_META.label;
  if (kind === "bp") return BP_META.label;
  return METRIC_META[kind].label;
}

function metricUnit(kind: MetricKey): string {
  if (kind === "weight") return WEIGHT_META.unit;
  if (kind === "bp") return BP_META.unit;
  return METRIC_META[kind].unit;
}

// energy_level is calculated (lib/energy), so it's shown but never logged,
// edited or deleted by hand — same as web's `computed` metrics.
function isComputed(kind: MetricKey): boolean {
  return kind !== "weight" && kind !== "bp" && !!METRIC_META[kind].computed;
}

const ALL_METRIC_KEYS: MetricKey[] = [
  "weight",
  "bp",
  ...(Object.keys(METRIC_META) as SimpleMetricType[]),
];

// Same 90-day "pages" as the web app's PersonalView: the backend only has a
// ?from&to filter, so earlier history is fetched as consecutive 90-day
// windows, newest first; an empty window means the start of history.
const CHUNK_DAYS = 90;

function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function chunkEndingAt(to: string): { from: string; to: string } {
  return { from: shiftISO(to, -(CHUNK_DAYS - 1)), to };
}

// Web's getNextPageParam: the day before the earliest entry loaded so far,
// or no more pages once a window comes back empty.
function nextChunkEnd(page: PersonalEntry[]): string | null {
  if (page.length === 0) return null;
  const earliest = page.reduce((min, e) => (e.date < min ? e.date : min), page[0].date);
  return shiftISO(earliest, -1);
}

// Tile order for the latest-value grid — same as web's metricConfig.ts VITAL_KINDS.
const VITAL_KINDS: MetricKey[] = ["weight", "bp", "heart_rate", "waist_cm", "chin_ups", "bench_press", "height_cm", "energy_level"];

function latestDisplay(entry: PersonalEntry): string {
  if (entry.kind === "bp") return `${entry.systolic ?? "—"} / ${entry.diastolic ?? "—"}`;
  return String(entry.value);
}

function entryValueLabel(entry: PersonalEntry): string {
  if (entry.kind === "bp") return `${entry.systolic} / ${entry.diastolic} ${BP_META.unit}`;
  if (entry.kind === "weight") return `${entry.value} ${WEIGHT_META.unit}`;
  // The stored unit: older energy rows were typed in on a 1-5 scale (web shows them the same way).
  return `${entry.value} ${entry.unit || METRIC_META[entry.kind].unit}`;
}

export default function PersonalScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation(["Personal", "Trends", "Common"]);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();

  function metricLabel(kind: MetricKey): string {
    const key = METRIC_LABEL_KEY[kind];
    return key ? t(key) : metricEnglishLabel(kind);
  }

  const metricOptions = ALL_METRIC_KEYS.map((key) => ({
    label: metricLabel(key),
    value: key,
    sublabel: metricUnit(key),
  }));

  const [entries, setEntries] = useState<PersonalEntry[]>([]);
  // For the BP colour rule (no colour for 13–17); null until known.
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  // Synced HR/BP is shown only to accounts allowed to see it (fail closed
  // until the age status is known — lib/vitals/eligibility.ts).
  const [vitalsAllowed, setVitalsAllowed] = useState(false);
  // The log / edit form opens as a popup (from a tile's "+" or a history row).
  const [formOpen, setFormOpen] = useState(false);
  // Heart rate & BP details (from tapping either tile).
  const [vitalsDetailOpen, setVitalsDetailOpen] = useState(false);
  // Which tile opened the Heart rate & BP popup — the camera button is for heart rate only.
  const [vitalsDetailKind, setVitalsDetailKind] = useState<"heart_rate" | "bp">("heart_rate");
  // The Energy tile opens its own popup (score breakdown, earlier days, rest day).
  const [energyDetailOpen, setEnergyDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingEntry, setEditingEntry] = useState<PersonalEntry | null>(null);
  const [metricType, setMetricType] = useState<MetricKey | null>(null);
  const [value, setValue] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [metricFilter, setMetricFilter] = useState("all");
  const [metricFilterPickerOpen, setMetricFilterPickerOpen] = useState(false);
  const [expandedMetrics, setExpandedMetrics] = useState<Set<string>>(new Set());
  // The entry's date — defaults to today, set from the entry when editing
  // (web's MetricLogDialog has the same date field).
  const [entryDate, setEntryDate] = useState(todayISO());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Earliest day covered by the loaded windows, and where the next "load
  // earlier" window ends (null = start of history reached).
  const [windowFrom, setWindowFrom] = useState(() => chunkEndingAt(todayISO()).from);
  const [nextTo, setNextTo] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  // Re-fetches everything loaded so far in one request (the backend accepts
  // any from/to), so an edit or pull-to-refresh keeps the older windows.
  const refresh = useCallback(() => {
    listPersonalEntries({ from: windowFrom, to: todayISO() })
      .then((loaded) => {
        setEntries(loaded);
        setNextTo(nextChunkEnd(loaded));
        setError(null);
      })
      .catch((err) => setError(loadErrorText(err, t("Personal:loadError"))))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, [t, windowFrom]);

  async function loadEarlier() {
    if (!nextTo) return;
    const chunk = chunkEndingAt(nextTo);
    setLoadingEarlier(true);
    try {
      const page = await listPersonalEntries(chunk);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setEntries((prev) => [...prev, ...page]);
      setWindowFrom(chunk.from);
      setNextTo(nextChunkEnd(page));
    } catch (err) {
      Alert.alert(loadErrorText(err, t("Personal:loadError")));
    } finally {
      setLoadingEarlier(false);
    }
  }

  function onPullRefresh() {
    setRefreshing(true);
    refresh();
  }

  useFocusEffect(
    useCallback(() => {
      refresh();
      checkVitalsAccess().then((a) => {
        setAgeBand(a.ageBand);
        setVitalsAllowed(a.allowed);
      });
    }, [refresh]),
  );

  // Heart rate / BP rows: where it came from, the colour hint and the
  // "see a doctor" line (lib/vitals). Other metrics are unchanged.
  function vitalsInfo(entry: PersonalEntry): { subtitle?: string; band: RangeBand; value?: string } {
    if (entry.kind === "bp") {
      const origins = entry.vitals?.origins ?? [];
      const source = entry.vitals ? t("Vitals:fromHealthConnect", { app: origins.map(sourceLabel).join(", ") }) : t("Vitals:manual");
      const doctor = bloodPressureNeedsDoctor(entry.systolic, entry.diastolic) ? `\n${t("Vitals:seeDoctor")}` : "";
      return { subtitle: source + doctor, band: bloodPressureBand(entry.systolic, entry.diastolic, { origins, ageBand }) };
    }
    if (entry.kind === "heart_rate") {
      const v = entry.vitals;
      if (!v && entry.camera) {
        const quality = entry.camera.quality === "good" ? t("HeartCamera:qualityGood") : t("HeartCamera:qualityFair");
        return { subtitle: `${t("HeartCamera:sourceLabel")} · ${quality}`, band: "neutral" };
      }
      if (!v) return { subtitle: t("Vitals:manual"), band: "neutral" };
      const parts = [];
      if (v.avg != null) parts.push(t("Vitals:hrSummary", { avg: v.avg, min: v.min, max: v.max }));
      if (v.resting != null) parts.push(t("Vitals:resting", { value: v.resting }));
      const doctor = heartRateNeedsDoctor(v.resting) ? `\n${t("Vitals:seeDoctor")}` : "";
      return {
        subtitle: t("Vitals:fromHealthConnect", { app: v.origins.map(sourceLabel).join(", ") }) + doctor,
        band: restingHeartRateBand(v.resting),
        value: `${parts.join(" · ")} ${METRIC_META.heart_rate.unit}`,
      };
    }
    return { band: "neutral" };
  }

  // Synced rows are rebuilt by every sync, so they're not edited here.
  function onPressEntry(entry: PersonalEntry) {
    if (entry.vitals) Alert.alert(t("Vitals:title"), t("Vitals:readOnly"));
    else startEdit(entry);
  }

  function resetForm() {
    setFormOpen(false);
    setEditingEntry(null);
    setEntryDate(todayISO());
    setMetricType(null);
    setValue("");
    setSystolic("");
    setDiastolic("");
  }

  function startEdit(entry: PersonalEntry) {
    setFormOpen(true);
    setEditingEntry(entry);
    setEntryDate(entry.date);
    setMetricType(entry.kind);
    if (entry.kind === "bp") {
      setSystolic(String(entry.systolic));
      setDiastolic(String(entry.diastolic));
    } else {
      setValue(String(entry.value));
    }
  }

  // One save per tap burst (see lib/singleFlight).
  const singleFlight = useSingleFlight();
  const onSubmit = singleFlight(async () => {
    if (!metricType) {
      Alert.alert(t("Personal:pickMetricTitle"), t("Personal:pickMetricBody"));
      return;
    }
    if (isComputed(metricType)) return;

    if (metricType === "bp") {
      const sys = parseInt(systolic, 10);
      const dia = parseInt(diastolic, 10);
      if (!sys || !dia) {
        Alert.alert(t("Personal:bothValuesRequiredTitle"), t("Personal:bothValuesRequiredBody"));
        return;
      }
      setSubmitting(true);
      try {
        if (editingEntry?.kind === "bp") {
          await updateBpEntry(entryDate, sys, dia, editingEntry.sysSk, editingEntry.diaSk);
        } else {
          await createBpEntry(entryDate, sys, dia);
        }
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        resetForm();
        refresh();
      } catch (err) {
        // 404: one side of the pair was deleted elsewhere — friendly message + refresh.
        showSaveError(t, t("Common:couldntSaveEntry"), err, () => {
          resetForm();
          refresh();
        });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const num = parseFloat(value);
    if (!num) {
      Alert.alert(t("Personal:valueRequiredTitle"), t("Personal:valueRequiredBody"));
      return;
    }
    // Same 20–400 kg bounds as the web form; the backend refuses impossible
    // weights, which used to leave half a weight saved.
    if (metricType === "weight" && !isWeightInRange(num)) {
      Alert.alert(t("Personal:weightRangeTitle"), t("Personal:weightRangeBody", { min: WEIGHT_META.min, max: WEIGHT_META.max }));
      return;
    }
    setSubmitting(true);
    try {
      if (metricType === "weight") {
        if (editingEntry?.kind === "weight") {
          await updateWeightEntry(editingEntry.source, editingEntry.sk, entryDate, num);
        } else {
          await createWeightEntry(entryDate, num);
        }
      } else {
        if (editingEntry?.kind === metricType) {
          await updateSimpleMetricEntry(metricType, editingEntry.sk, entryDate, num);
        } else {
          await createSimpleMetricEntry(metricType, entryDate, num);
        }
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      resetForm();
      refresh();
    } catch (err) {
      // 404: the entry was deleted elsewhere — friendly message + refresh.
      showSaveError(t, t("Common:couldntSaveEntry"), err, () => {
        resetForm();
        refresh();
      });
    } finally {
      setSubmitting(false);
    }
  });

  function onDelete(entry: PersonalEntry) {
    Alert.alert(t("Common:deleteThisEntry"), undefined, [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          try {
            if (entry.kind === "bp") await deleteBpEntry(entry.sysSk, entry.diaSk);
            else if (entry.kind === "weight") await deleteWeightEntry(entry.source, entry.sk);
            else await deleteSimpleMetricEntry(entry.sk);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            if (editingEntry === entry) resetForm();
            refresh();
          } catch (err) {
            Alert.alert(t("Common:couldntDeleteEntry"), err instanceof Error ? err.message : undefined);
          }
        },
      },
    ]);
  }

  const metricSections: SelectSection[] = [{ title: "", data: metricOptions.filter((o) => !isComputed(o.value)) }];
  const metricFilterSections: SelectSection[] = [
    { title: "", data: [{ label: t("Personal:allMetrics"), value: "all" }, ...metricOptions] },
  ];
  const metricFilterLabel = metricFilter === "all" ? t("Personal:allMetrics") : metricLabel(metricFilter as MetricKey);

  function toggleMetricExpanded(key: string) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const shownEntries = vitalsAllowed ? entries : hideSyncedVitals(entries);
  const filteredEntries = metricFilter === "all" ? shownEntries : shownEntries.filter((e) => e.kind === metricFilter);
  const metricGroups = groupByKey(
    filteredEntries,
    (e) => e.kind,
    (key) => metricLabel(key as MetricKey),
  );

  function groupSummary(items: PersonalEntry[]): string {
    const countText = formatIcuPlural(t("Common:entryCount"), items.length, i18n.language);
    return `${countText} · ${t("Common:latestEntryPreview", {
      value: entryValueLabel(items[0]),
      date: dateGroupLabel(items[0].date),
    })}`;
  }

  function formatEntryDate(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });
  }

  function startLog(kind: MetricKey) {
    resetForm();
    setMetricType(kind);
    setFormOpen(true);
  }

  // Heart rate / BP tiles: the latest reading with its source, colour hint
  // and extreme-value warning (lib/vitals/tile.ts).
  function vitalsTileFor(latest: PersonalEntry): VitalsTile | null {
    if (latest.kind === "bp") return bloodPressureTile(latest, ageBand);
    if (latest.kind === "heart_rate") return heartRateTile(latest);
    return null;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor={colors.navTint} />}
    >
      {/* Latest value per metric — web's VitalsGrid. */}
      <View style={styles.tileGrid}>
        {VITAL_KINDS.map((kind) => {
          // Energy shows only today's score (blank until logged); others their latest.
          const latest = tileEntry(shownEntries, kind, todayISO());
          const opensVitals = vitalsAllowed && (kind === "heart_rate" || kind === "bp");
          const opensPopup = opensVitals || kind === "energy_level";
          return (
            <AnimatedPressable
              key={kind}
              style={styles.tile}
              onPress={kind === "energy_level" ? () => setEnergyDetailOpen(true) : opensVitals ? () => { setVitalsDetailKind(kind === "bp" ? "bp" : "heart_rate"); setVitalsDetailOpen(true); } : undefined}
              disabled={!opensPopup}
              accessibilityRole={opensPopup ? "button" : undefined}
              accessibilityLabel={kind === "energy_level" ? t("Personal:energy.openDetailsAriaLabel") : undefined}
            >
              <View style={styles.tileHeader}>
                <Text style={styles.tileLabel} numberOfLines={1}>
                  {metricLabel(kind)}
                </Text>
                {!isComputed(kind) && (
                  <AnimatedPressable
                    style={styles.tileAdd}
                    onPress={() => startLog(kind)}
                    accessibilityRole="button"
                    accessibilityLabel={t("Personal:logMetricAriaLabel", { label: metricLabel(kind) })}
                  >
                    <Text style={styles.tileAddText}>+</Text>
                  </AnimatedPressable>
                )}
              </View>
              {latest ? (
                <>
                  {(() => {
                    const vt = vitalsTileFor(latest);
                    return (
                      <>
                        <View style={styles.tileValueRow}>
                          <Text style={styles.tileValue}>
                            {vt ? vt.value : latestDisplay(latest)} <Text style={styles.tileUnit}>{metricUnit(kind)}</Text>
                          </Text>
                          {vt && vt.resting == null && <RangeDot band={vt.band} />}
                        </View>
                        {vt && vt.resting != null && (
                          <View style={styles.tileValueRow}>
                            <Text style={styles.tileMeta}>{t("Vitals:resting", { value: vt.resting })}</Text>
                            <RangeDot band={vt.band} />
                          </View>
                        )}
                        {vt && (
                          <Text style={styles.tileMeta} numberOfLines={1}>
                            {vt.source ?? (latest.kind === "heart_rate" && latest.camera ? t("HeartCamera:sourceLabel") : t("Vitals:manual"))}
                          </Text>
                        )}
                        {vt?.doctor && (
                          <Text style={styles.tileDoctor} numberOfLines={2}>
                            ⚠ {t("Vitals:seeDoctor")}
                          </Text>
                        )}
                        {kind === "energy_level" && latest.kind !== "bp" && (() => {
                          const bar = energyBar(latest.value);
                          const color = bar.label === "low" ? colors.destructive : bar.label === "moderate" ? ENERGY_AMBER : ENERGY_GREEN;
                          return (
                            <>
                              <Text style={[styles.tileMeta, { color }]}>{t(`Personal:energyLabels.${bar.label}`)}</Text>
                              <View
                                style={styles.energyTrack}
                                accessibilityRole="progressbar"
                                accessibilityValue={{ min: 0, max: 100, now: bar.percent }}
                              >
                                <View style={[styles.energyFill, { width: `${bar.percent}%`, backgroundColor: color }]} />
                              </View>
                            </>
                          );
                        })()}
                      </>
                    );
                  })()}
                  <Text style={styles.tileDate}>
                    {new Date(`${latest.date}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" })}
                  </Text>
                </>
              ) : (
                // Energy not logged today: just blank ("—"), not "No entries yet".
                <Text style={styles.tileEmpty}>{kind === "energy_level" ? "—" : t("Personal:noEntriesYet")}</Text>
              )}
            </AnimatedPressable>
          );
        })}
      </View>

      {/* Heart rate & BP details: a popup from the two tiles (connecting stays in Habits → Health Connect). */}
      <Modal visible={vitalsDetailOpen && vitalsAllowed} transparent animationType="fade" onRequestClose={() => setVitalsDetailOpen(false)}>
        <BlurBackdrop>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <VitalsPersonalSection
                entries={entries}
                ageBand={ageBand}
                onChanged={refresh}
                focus={vitalsDetailKind}
                onMeasure={
                  vitalsDetailKind === "heart_rate"
                    ? () => {
                        setVitalsDetailOpen(false);
                        navigation.navigate("HeartRateMeasure");
                      }
                    : undefined
                }
              />
              <AnimatedPressable style={styles.secondaryButton} onPress={() => setVitalsDetailOpen(false)}>
                <Text style={styles.secondaryButtonText}>{t("Vitals:close")}</Text>
              </AnimatedPressable>
            </ScrollView>
          </View>
        </BlurBackdrop>
      </Modal>

      {/* Energy details: a popup from the Energy tile (same as the web's EnergyDialog). */}
      <Modal visible={energyDetailOpen} transparent animationType="fade" onRequestClose={() => setEnergyDetailOpen(false)}>
        <BlurBackdrop>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              <EnergyDetailSection onChanged={refresh} />
              <AnimatedPressable style={styles.secondaryButton} onPress={() => setEnergyDetailOpen(false)}>
                <Text style={styles.secondaryButtonText}>{t("Vitals:close")}</Text>
              </AnimatedPressable>
            </ScrollView>
          </View>
        </BlurBackdrop>
      </Modal>

      {/* Log / edit form — a popup from a tile's "+" or a history row. */}
      <Modal visible={formOpen} transparent animationType="fade" onRequestClose={resetForm}>
        <BlurBackdrop>
          <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {editingEntry ? t("Common:editEntry") : metricType ? t("Personal:logMetric", { label: metricLabel(metricType) }) : t("Personal:logAMetric")}
                </Text>

                <AnimatedPressable style={styles.input} onPress={() => setMetricPickerOpen(true)}>
                  <Text style={metricType ? styles.inputText : styles.inputPlaceholder}>
                    {metricType ? metricLabel(metricType) : t("Personal:chooseAMetric")}
                  </Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={styles.input}
                  onPress={() => setDatePickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t("Common:dateLabel")}
                >
                  <Text style={styles.inputText}>
                    {t("Common:dateLabel")}: {entryDate === todayISO() ? t("Common:today") : formatEntryDate(entryDate)}
                  </Text>
                </AnimatedPressable>

                {/* Heart rate can also be measured with the camera (same account rule as Health Connect). */}
                {metricType === "heart_rate" && vitalsAllowed && !editingEntry && (
                  <ModernButton
                    title={`📷 ${t("HeartCamera:measureButton")}`}
                    variant="outline"
                    style={styles.measureButton}
                    onPress={() => {
                      resetForm();
                      navigation.navigate("HeartRateMeasure");
                    }}
                  />
                )}

                {metricType === "bp" ? (
                  <View style={styles.bpRow}>
                    <TextInput
                      style={[styles.input, styles.bpInput]}
                      placeholder={t("Personal:systolicLabel")}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                      value={systolic}
                      onChangeText={setSystolic}
                    />
                    <TextInput
                      style={[styles.input, styles.bpInput]}
                      placeholder={t("Personal:diastolicLabel")}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                      value={diastolic}
                      onChangeText={setDiastolic}
                    />
                  </View>
                ) : metricType ? (
                  <TextInput
                    style={styles.input}
                    placeholder={t("Personal:valuePlaceholder", { unit: metricUnit(metricType) })}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={value}
                    onChangeText={setValue}
                  />
                ) : null}

                <View style={styles.formActions}>
                  <AnimatedPressable style={styles.secondaryButton} onPress={resetForm}>
                    <Text style={styles.secondaryButtonText}>{t("Common:cancel")}</Text>
                  </AnimatedPressable>
                  <AnimatedPressable style={styles.button} onPress={onSubmit} disabled={submitting || !metricType}>
                    {submitting ? (
                      <ActivityIndicator color={colors.primaryForeground} />
                    ) : (
                      <Text style={styles.buttonText}>{editingEntry ? t("Common:save") : t("Personal:logEntry")}</Text>
                    )}
                  </AnimatedPressable>
                </View>
              </View>
          </ScrollView>
        </BlurBackdrop>
      </Modal>

      <View style={styles.filterRow}>
        <Text style={styles.sectionTitle}>{t("Personal:historyTitle")}</Text>
        <AnimatedPressable style={styles.filterTrigger} onPress={() => setMetricFilterPickerOpen(true)}>
          <Text style={styles.filterTriggerText} numberOfLines={1}>
            {metricFilterLabel}
          </Text>
        </AnimatedPressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.navTint} />
      ) : null}
      {!loading && shownEntries.some((e) => e.kind === "heart_rate" || e.kind === "bp") && (
        <Text style={styles.vitalsDisclaimer}>{t("Vitals:disclaimer")}</Text>
      )}
      {loading ? null : metricGroups.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>{error ?? t("Personal:noEntriesYetHistory")}</Text>
        </View>
      ) : (
        metricGroups.map((group) => {
          const dateGroups = groupByDate(group.items, (e) => e.date);
          const expanded = expandedMetrics.has(group.key);
          return (
            <HistoryCard
              key={group.key}
              title={group.name}
              summaryText={groupSummary(group.items)}
              expanded={expanded}
              onToggle={() => toggleMetricExpanded(group.key)}
              expandLabel={t("Common:expandHistory", { title: group.name })}
              collapseLabel={t("Common:collapseHistory", { title: group.name })}
            >
              {dateGroups.map((dateGroup) => (
                <HistoryDateGroup key={dateGroup.label} label={dateGroup.label}>
                  {dateGroup.items.map((entry, index) => {
                    const info = vitalsInfo(entry);
                    return (
                      <HistoryEntryRow
                        key={`${entry.kind}-${index}`}
                        title={metricLabel(entry.kind)}
                        subtitle={info.subtitle}
                        valueNode={
                          <View style={styles.valueWithDot}>
                            <Text style={styles.body}>{info.value ?? entryValueLabel(entry)}</Text>
                            <RangeDot band={info.band} />
                          </View>
                        }
                        onPress={isComputed(entry.kind) ? undefined : () => onPressEntry(entry)}
                        onLongPress={isComputed(entry.kind) ? undefined : () => onDelete(entry)}
                      />
                    );
                  })}
                </HistoryDateGroup>
              ))}
            </HistoryCard>
          );
        })
      )}

      {!loading && nextTo && (
        <AnimatedPressable style={styles.secondaryButton} onPress={loadEarlier} disabled={loadingEarlier}>
          {loadingEarlier ? (
            <ActivityIndicator color={colors.navTint} />
          ) : (
            <Text style={styles.secondaryButtonText}>{t("Personal:loadEarlierEntries")}</Text>
          )}
        </AnimatedPressable>
      )}

      <CalendarModal
        visible={datePickerOpen}
        selectedDate={entryDate}
        onSelect={(iso) => setEntryDate(iso ?? todayISO())}
        onClose={() => setDatePickerOpen(false)}
      />

      <SelectModal
        visible={metricPickerOpen}
        title={t("Personal:metricPickerTitle")}
        sections={metricSections}
        onSelect={(v) => {
          setMetricType(v as MetricKey);
          setValue("");
          setSystolic("");
          setDiastolic("");
        }}
        onClose={() => setMetricPickerOpen(false)}
      />

      <SelectModal
        visible={metricFilterPickerOpen}
        title={t("Personal:allMetrics")}
        sections={metricFilterSections}
        onSelect={setMetricFilter}
        onClose={() => setMetricFilterPickerOpen(false)}
      />
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tile: {
      width: "48%",
      flexGrow: 1,
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 4,
    },
    tileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
    tileLabel: { flex: 1, fontSize: typography.label.fontSize, fontWeight: "600", color: colors.mutedForeground },
    tileAdd: { minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
    tileAddText: { fontSize: 20, color: colors.navTint },
    tileValue: { fontSize: 22, fontWeight: "600", color: colors.foreground },
    tileUnit: { fontSize: 12, fontWeight: "400", color: colors.mutedForeground },
    tileDate: { fontSize: 11, color: colors.mutedForeground },
    tileEmpty: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
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
  body: { fontSize: 14, color: colors.mutedForeground },
  valueWithDot: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  tileValueRow: { flexDirection: "row", alignItems: "center" },
  tileMeta: { fontSize: 11, color: colors.mutedForeground },
  tileDoctor: { fontSize: 11, fontWeight: "600", color: colors.destructive },
  energyTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden", marginTop: 4 },
  energyFill: { height: 6, borderRadius: 3 },
  // Centered dialog (fades in), not a bottom sheet.
  sheetBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "85%", flexGrow: 0, backgroundColor: colors.background, borderRadius: 24 },
  sheetContent: { padding: 16, gap: 12 },
  vitalsDisclaimer: { fontSize: 12, color: colors.mutedForeground },
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
  bpRow: { flexDirection: "row", gap: 10 },
  bpInput: { flex: 1 },
  formActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  buttonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
  secondaryButton: { borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 },
  // Heart-rate red so "Measure with camera" reads as a button, not another input box.
  measureButton: { borderColor: "#F43F5E", borderWidth: 1.5, backgroundColor: "rgba(244, 63, 94, 0.12)" },
  secondaryButtonText: { color: colors.mutedForeground, fontSize: typography.button.fontSize, fontWeight: "500" },
  });
}
