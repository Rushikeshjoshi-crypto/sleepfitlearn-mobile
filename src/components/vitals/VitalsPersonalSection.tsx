import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import type { PersonalEntry } from "../../lib/api/fitness";
import type { AgeBand } from "../../lib/api/users";
import { getCurrentUserId } from "../../lib/aws/cognito";
import { hasSyncedVitals, latestHeartRateDay, recentBloodPressure } from "../../lib/vitals/display";
import {
  bloodPressureBand,
  bloodPressureNeedsDoctor,
  heartRateNeedsDoctor,
  restingHeartRateBand,
} from "../../lib/vitals/ranges";
import { sourceLabel } from "../../lib/vitals/sourceLabel";
import { deleteSyncedVitals } from "../../lib/vitals/sync";
import { ModernButton } from "../ModernButton";
import { RangeDot } from "./RangeDot";

const BP_ROWS = 5;

// Personal screen: heart rate and blood pressure at a glance — the latest
// Health Connect HR day, recent BP readings with their source, and the same
// "delete synced data" action as Habits → Health Connect (deleteSyncedVitals).
// Connecting / consent stays in the Habits tab (VitalsSection).
export function VitalsPersonalSection({
  entries,
  ageBand,
  onChanged,
  onMeasure,
}: {
  entries: PersonalEntry[];
  ageBand: AgeBand | null;
  onChanged: () => void;
  // Opens the camera heart rate screen (fingertip over the camera).
  onMeasure?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Vitals");
  const [deleting, setDeleting] = useState(false);

  const hr = latestHeartRateDay(entries);
  const bp = recentBloodPressure(entries, BP_ROWS);
  const apps = (origins: string[]) => origins.map(sourceLabel).join(", ");

  function onDelete() {
    Alert.alert(t("deleteTitle"), t("deleteBody"), [
      { text: t("Common:cancel"), style: "cancel" },
      {
        text: t("Common:delete"),
        style: "destructive",
        onPress: async () => {
          const userId = await getCurrentUserId();
          if (!userId) return;
          setDeleting(true);
          try {
            const count = await deleteSyncedVitals(userId);
            Alert.alert(t("title"), t("deleted", { count }));
          } catch {
            Alert.alert(t("title"), t("deleteError"));
          } finally {
            setDeleting(false);
            onChanged();
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("sectionTitle")}</Text>
      {onMeasure && <ModernButton title={`❤️ ${t("HeartCamera:measureButton")}`} onPress={onMeasure} />}

      {!hr && bp.length === 0 ? (
        <Text style={styles.body}>{t("emptyMobile")}</Text>
      ) : (
        <>
          {hr?.vitals && (
            <View style={styles.block}>
              <Text style={styles.label}>{t("hrCardTitle")}</Text>
              <Text style={styles.hint}>{hr.date}</Text>
              {hr.vitals.avg != null && (
                <Text style={styles.value}>
                  {t("hrSummary", { avg: hr.vitals.avg, min: hr.vitals.min, max: hr.vitals.max })} bpm
                </Text>
              )}
              {hr.vitals.resting != null && (
                <View style={styles.row}>
                  <Text style={styles.value}>{t("resting", { value: hr.vitals.resting })} bpm</Text>
                  <RangeDot band={restingHeartRateBand(hr.vitals.resting)} />
                </View>
              )}
              <Text style={styles.badge}>{t("fromHealthConnect", { app: apps(hr.vitals.origins) })}</Text>
              {heartRateNeedsDoctor(hr.vitals.resting) && <Text style={styles.doctor}>{t("seeDoctor")}</Text>}
            </View>
          )}

          {bp.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.label}>{t("bpHistoryTitle")}</Text>
              {bp.map((e) => {
                const origins = e.vitals?.origins ?? [];
                return (
                  <View key={`${e.date}-${e.sysSk}`} style={styles.bpRow}>
                    <View style={styles.bpText}>
                      <View style={styles.row}>
                        <Text style={styles.value}>
                          {e.systolic} / {e.diastolic} mmHg
                        </Text>
                        <RangeDot band={bloodPressureBand(e.systolic, e.diastolic, { origins, ageBand })} />
                      </View>
                      <Text style={styles.badge}>
                        {e.date} · {e.vitals ? t("fromHealthConnect", { app: apps(origins) }) : t("manual")}
                      </Text>
                      {bloodPressureNeedsDoctor(e.systolic, e.diastolic) && <Text style={styles.doctor}>{t("seeDoctor")}</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {hasSyncedVitals(entries) &&
        (deleting ? (
          <ActivityIndicator color={colors.navTint} />
        ) : (
          <ModernButton title={t("deleteHcButton")} onPress={onDelete} variant="outline" />
        ))}
      <Text style={styles.hint}>{t("disclaimer")}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      gap: 12,
    },
    title: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    block: { gap: 4 },
    label: { fontSize: typography.label.fontSize, fontWeight: "600", color: colors.mutedForeground, textTransform: "uppercase" },
    value: { fontSize: typography.body.fontSize, fontWeight: "600", color: colors.foreground },
    row: { flexDirection: "row", alignItems: "center" },
    bpRow: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    bpText: { gap: 2 },
    badge: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
    doctor: { fontSize: typography.label.fontSize, color: colors.destructive, fontWeight: "600" },
    body: { fontSize: typography.body.fontSize, color: colors.mutedForeground },
    hint: { fontSize: typography.label.fontSize, color: colors.mutedForeground },
  });
}
