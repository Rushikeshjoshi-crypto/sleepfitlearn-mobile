import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";
import { ModernButton } from "../components/ModernButton";
import { createCameraHeartRate } from "../lib/api/fitness";
import { todayISO } from "../lib/dateRange";
import { analyzePpg, liveFeedback, MEASURE_MS, WARMUP_MS, type Frame, type LiveFeedback, type PpgResult } from "../lib/heartCamera/ppg";
import { heartCameraSupported, requestCameraPermission, startHeartCamera } from "../lib/native/heartCamera";
import { checkVitalsAccess } from "../lib/vitals/eligibility";

type Phase =
  | { kind: "checking" }
  | { kind: "blocked"; message: string }
  | { kind: "intro" }
  | { kind: "measuring" }
  | { kind: "result"; result: PpgResult };

const FEEDBACK_KEY: Record<LiveFeedback, string> = {
  waiting: "fbWaiting",
  noFinger: "fbNoFinger",
  moving: "fbMoving",
  ok: "fbOk",
};
const POOR_KEY = { noFinger: "poorNoFinger", noPulse: "poorNoPulse", tooShort: "poorTooShort" } as const;
const ERROR_KEY: Record<string, string> = { no_permission: "permissionDenied", no_flash: "noFlash", unsupported: "unavailable" };

// Camera heart rate: fingertip over the back camera + flash for 35 s (5 s
// warm-up + 30 s analysed by lib/heartCamera/ppg.ts), live feedback, then a
// result with a quality badge. Only good / fair readings can be saved. Same
// account rule as Health Connect heart rate (lib/vitals/eligibility.ts).
export default function HeartRateMeasureScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("HeartCamera");
  const navigation = useNavigation();
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [feedback, setFeedback] = useState<LiveFeedback>("waiting");
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const frames = useRef<Frame[]>([]);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    checkVitalsAccess().then((access) => {
      if (!access.allowed) setPhase({ kind: "blocked", message: t("notAllowed") });
      else if (!heartCameraSupported()) setPhase({ kind: "blocked", message: t("unavailable") });
      else setPhase({ kind: "intro" });
    });
  }, [t]);

  const stopAll = useCallback(async () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const stop = stopRef.current;
    stopRef.current = null;
    if (stop) await stop();
  }, []);

  // Never leave the camera / torch on when the screen goes away.
  useEffect(
    () => () => {
      stopAll();
    },
    [stopAll],
  );

  useEffect(() => {
    if (phase.kind !== "measuring") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase.kind, pulse]);

  async function start() {
    if (!(await requestCameraPermission())) {
      setPhase({ kind: "blocked", message: t("permissionDenied") });
      return;
    }
    frames.current = [];
    setElapsed(0);
    setFeedback("waiting");
    try {
      stopRef.current = await startHeartCamera((f) => frames.current.push(f));
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setPhase({ kind: "blocked", message: t(ERROR_KEY[code] ?? "cameraError") });
      return;
    }
    setPhase({ kind: "measuring" });
    const startedAt = Date.now();
    timer.current = setInterval(async () => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      setFeedback(liveFeedback(frames.current.slice(-60)));
      if (ms >= MEASURE_MS) {
        await stopAll();
        setPhase({ kind: "result", result: analyzePpg(frames.current) });
      }
    }, 250);
  }

  async function cancel() {
    await stopAll();
    setPhase({ kind: "intro" });
  }

  async function save(result: Extract<PpgResult, { quality: "good" | "fair" }>) {
    setSaving(true);
    try {
      await createCameraHeartRate(todayISO(), result.bpm, result.quality, (MEASURE_MS - WARMUP_MS) / 1000);
      navigation.goBack();
    } catch {
      setPhase({ kind: "blocked", message: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  const secondsLeft = Math.max(0, Math.ceil((MEASURE_MS - elapsed) / 1000));
  const progress = Math.min(1, elapsed / MEASURE_MS);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {phase.kind === "checking" && <ActivityIndicator color={colors.navTint} />}

      {phase.kind === "blocked" && (
        <View style={styles.card}>
          <Text style={styles.body}>{phase.message}</Text>
          <ModernButton title={t("tryAgain")} onPress={() => setPhase({ kind: "intro" })} variant="outline" />
        </View>
      )}

      {phase.kind === "intro" && (
        <View style={styles.card}>
          <Text style={styles.heart}>❤️</Text>
          {[t("step1"), t("step2"), t("step3")].map((s, i) => (
            <Text key={s} style={styles.step}>
              {i + 1}. {s}
            </Text>
          ))}
          <Text style={styles.hint}>{t("cameraReason")}</Text>
          <ModernButton title={t("start")} onPress={start} />
          <Text style={styles.hint}>{t("disclaimer")}</Text>
        </View>
      )}

      {phase.kind === "measuring" && (
        <View style={styles.card}>
          <Animated.Text style={[styles.heartBig, { transform: [{ scale: pulse }] }]}>❤️</Animated.Text>
          <Text style={styles.title}>{elapsed < WARMUP_MS ? t("warmup") : t("measuring")}</Text>
          <Text style={[styles.feedback, feedback === "ok" ? styles.feedbackOk : styles.feedbackWarn]}>{t(FEEDBACK_KEY[feedback])}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.hint}>{t("secondsLeft", { seconds: secondsLeft })}</Text>
          <ModernButton title={t("cancel")} onPress={cancel} variant="outline" />
        </View>
      )}

      {phase.kind === "result" && (
        <View style={styles.card}>
          {phase.result.quality === "poor" ? (
            <>
              <Text style={styles.title}>{t("poorTitle")}</Text>
              <Text style={styles.body}>{t(POOR_KEY[phase.result.reason])}</Text>
              <ModernButton title={t("tryAgain")} onPress={start} />
            </>
          ) : (
            <>
              <Text style={styles.label}>{t("resultTitle")}</Text>
              <Text style={styles.bpm}>
                {phase.result.bpm} <Text style={styles.unit}>bpm</Text>
              </Text>
              <Text style={[styles.badge, phase.result.quality === "good" ? styles.feedbackOk : styles.feedbackWarn]}>
                {phase.result.quality === "good" ? t("qualityGood") : t("qualityFair")}
              </Text>
              <Text style={styles.hint}>{t("disclaimer")}</Text>
              {(() => {
                const result = phase.result;
                return <ModernButton title={t("save")} onPress={() => save(result)} loading={saving} />;
              })()}
              <ModernButton title={t("discard")} onPress={() => setPhase({ kind: "intro" })} variant="outline" disabled={saving} />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { padding: 24, gap: 16, paddingBottom: 40 },
    card: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 14 },
    heart: { fontSize: 40, textAlign: "center" },
    heartBig: { fontSize: 72, textAlign: "center" },
    title: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground, textAlign: "center" },
    label: { fontSize: typography.label.fontSize, fontWeight: "600", color: colors.mutedForeground, textAlign: "center", textTransform: "uppercase" },
    step: { fontSize: typography.body.fontSize, color: colors.foreground, lineHeight: 22 },
    body: { fontSize: typography.body.fontSize, color: colors.foreground, lineHeight: 22 },
    hint: { fontSize: typography.label.fontSize, color: colors.mutedForeground, textAlign: "center" },
    feedback: { fontSize: typography.body.fontSize, fontWeight: "600", textAlign: "center" },
    feedbackOk: { color: colors.primary },
    feedbackWarn: { color: "#D68910" },
    track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
    fill: { height: 8, borderRadius: 4, backgroundColor: colors.navTint },
    bpm: { fontSize: 56, fontWeight: "700", color: colors.foreground, textAlign: "center" },
    unit: { fontSize: 18, fontWeight: "400", color: colors.mutedForeground },
    badge: { fontSize: typography.body.fontSize, fontWeight: "600", textAlign: "center" },
  });
}
