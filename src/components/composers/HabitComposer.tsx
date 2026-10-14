import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { createContextEvent, type ContextEventType } from "../../lib/api/context";
import { AnimatedPressable } from "../AnimatedPressable";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { todayISO } from "../../lib/dateRange";
import { useSingleFlight } from "../../lib/singleFlight";


export default function HabitComposer({ onSaved }: { onSaved: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Habits");
  const [type, setType] = useState<ContextEventType>("routine");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // One save per tap burst (see lib/singleFlight).
  const singleFlight = useSingleFlight();
  const onSubmit = singleFlight(async () => {
    const num = parseInt(value, 10);
    if (!num && num !== 0) {
      // Mobile-only — no matching web validation key for this.
      Alert.alert(t("valueRequiredTitle"), type === "routine" ? t("enterAdherence") : t("enterMinutes"));
      return;
    }
    setSubmitting(true);
    try {
      await createContextEvent({
        event_type: type,
        event_date: todayISO(),
        metadata: type === "routine" ? { adherence_pct: num } : { minutes: num },
      });
      setValue("");
      onSaved();
    } catch (err) {
      Alert.alert(t("saveErrorToast"), err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("logAnEntry")}</Text>

      <View style={styles.chipRow}>
        <AnimatedPressable
          style={[styles.chip, type === "routine" && styles.chipActive]}
          onPress={() => setType("routine")}
        >
          <Text style={[styles.chipText, type === "routine" && styles.chipTextActive]}>
            {t("eventTypes.routine")}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.chip, type === "screen_time" && styles.chipActive]}
          onPress={() => setType("screen_time")}
        >
          <Text style={[styles.chipText, type === "screen_time" && styles.chipTextActive]}>
            {t("eventTypes.screen_time")}
          </Text>
        </AnimatedPressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder={type === "routine" ? `${t("adherencePctPlaceholder")} (0-100)` : t("minutesPlaceholder")}
        placeholderTextColor={colors.mutedForeground}
        keyboardType="number-pad"
        value={value}
        onChangeText={setValue}
      />

      <AnimatedPressable style={styles.button} onPress={onSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={styles.buttonText}>{t("saveEntry")}</Text>
        )}
      </AnimatedPressable>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { gap: 10 },
    sectionTitle: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    chipRow: { flexDirection: "row", gap: 8 },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, fontWeight: "500" },
    chipTextActive: { color: colors.primaryForeground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: typography.body.fontSize,
      color: colors.foreground,
    },
    button: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 12, alignItems: "center" },
    buttonText: { color: colors.primaryForeground, fontSize: typography.button.fontSize, fontWeight: "600" },
  });
}
