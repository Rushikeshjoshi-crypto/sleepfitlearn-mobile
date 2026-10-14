import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { deleteContextEvent, updateContextEvent, type ContextEvent } from "../../lib/api/context";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";
import { showSaveError } from "../../lib/ui/apiErrors";

// Mobile port of the web app's ScreenTimeEditForm / RoutineEditForm
// (src/components/habits/HabitEventRow.tsx), same API calls and rules:
//  - screen time: `events` is one day's merged screen_time rows. The first is
//    updated with the new total ({ minutes }) and the rest are deleted, so the
//    edited total stays authoritative.
//  - routine: a single event, updated with { adherence_pct }.
// Same bounds as web's validation/context.ts: minutes 0–1440, % 0–100, note ≤ 280.
const MAX_NOTE = 280;

export function HabitEventEditModal({
  events,
  onClose,
  onSaved,
}: {
  events: ContextEvent[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Habits", "Common"]);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const primary = events?.[0] ?? null;
  const isScreenTime = primary?.event_type === "screen_time";

  useEffect(() => {
    if (!events || events.length === 0) return;
    const [first] = events;
    const initial =
      first.event_type === "screen_time"
        ? Math.round(events.reduce((sum, e) => sum + (e.metadata?.minutes ?? 0), 0))
        : first.metadata?.adherence_pct ?? 0;
    setValue(String(initial));
    setNote(first.description ?? "");
    setError(null);
  }, [events]);

  async function save() {
    if (!events || !primary) return;
    const num = Number(value);
    if (isScreenTime && !(Number.isFinite(num) && num >= 0 && num <= 1440)) {
      setError(t("Habits:minutesRangeError"));
      return;
    }
    if (!isScreenTime && !(Number.isFinite(num) && num >= 0 && num <= 100)) {
      setError(t("Habits:adherenceRangeError"));
      return;
    }
    if (note.trim().length > MAX_NOTE) {
      setError(t("Habits:noteTooLong"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateContextEvent(primary.sk, {
        event_type: primary.event_type,
        event_date: primary.event_date,
        description: note.trim() || null,
        metadata: isScreenTime ? { minutes: num } : { adherence_pct: num },
      });
      const rest = isScreenTime ? events.slice(1) : [];
      if (rest.length > 0) await Promise.all(rest.map((e) => deleteContextEvent(e.sk)));
      Alert.alert(t("Common:entryUpdated"));
      onSaved();
    } catch (err) {
      // 404: the entry was deleted elsewhere — friendly message + refresh.
      showSaveError(t, t("Common:couldntSaveChanges"), err, onSaved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={events != null} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("Common:editEntry")}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={(v) => setValue(v.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            placeholder={isScreenTime ? t("Habits:minutesPlaceholder") : t("Habits:adherencePctPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
          />
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t("Habits:noteOptionalLabel")}
            placeholderTextColor={colors.mutedForeground}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <AnimatedPressable style={styles.actionButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>{t("Common:cancel")}</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.actionButton} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.saveText}>{t("Common:save")}</Text>}
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.card, borderRadius: 24, padding: 20, gap: 12 },
    title: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.foreground,
      backgroundColor: colors.background,
    },
    noteInput: { minHeight: 64, textAlignVertical: "top" },
    error: { fontSize: typography.bodySmall.fontSize, color: colors.destructive },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
    actionButton: { minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
    cancelText: { fontSize: 15, color: colors.mutedForeground },
    saveText: { fontSize: 15, fontWeight: "600", color: colors.primary },
  });
}
