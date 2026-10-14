import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { getConsentLog, type ConsentEvent } from "../../lib/api/family";
import { familyErrorKey } from "../../lib/family/familyErrors";
import { KNOWN_CONSENT_EVENTS } from "../../lib/family/consentEvents";
import { useTheme } from "../../theme/ThemeContext";
import { ModernButton } from "../ModernButton";
import { makeFamilyStyles } from "./familyStyles";

// One link's consent log (either side may read it) — the child's view in
// Settings → Family. Web equivalent: src/components/family/ConsentLogList.tsx.
export function ConsentLogList({ linkId }: { linkId: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Family");
  const [events, setEvents] = useState<ConsentEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    getConsentLog(linkId)
      .then((r) => {
        if (!cancelled) setEvents(r.events);
      })
      .catch((err) => {
        if (!cancelled) setError(t(`Errors.${familyErrorKey(err)}`));
      });
    return () => {
      cancelled = true;
    };
  }, [linkId, attempt, t]);

  if (error) {
    return (
      <View style={styles.logBlock}>
        <Text style={styles.errorText}>{error}</Text>
        <ModernButton title={t("retry")} variant="outline" onPress={() => setAttempt((n) => n + 1)} />
      </View>
    );
  }
  if (!events) return <ActivityIndicator color={colors.primary} />;
  if (events.length === 0) return <Text style={styles.hint}>{t("ConsentLog.empty")}</Text>;

  return (
    <View style={styles.logBlock}>
      {events.map((e) => (
        <View key={`${e.created_at}-${e.event_type}`} style={styles.logItem}>
          <Text style={styles.body}>
            {KNOWN_CONSENT_EVENTS.has(e.event_type) ? t(`ConsentLog.events.${e.event_type}`) : e.event_type}
          </Text>
          <Text style={styles.hint}>
            {e.actor_role === "parent"
              ? t("ConsentLog.byParent")
              : e.actor_role === "system"
                ? t("ConsentLog.bySystem")
                : t("ConsentLog.byChild")} · {new Date(e.created_at).toLocaleString(i18n.language)}
            {e.consent_text_version ? ` · ${t("ConsentLog.consentVersion", { version: e.consent_text_version })}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}
