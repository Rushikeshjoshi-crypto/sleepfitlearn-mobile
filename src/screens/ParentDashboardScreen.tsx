import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import {
  closeFamilyLink,
  getFamilyStatus,
  listFamilyLinks,
  type FamilyLink,
  type FamilyStatus,
} from "../lib/api/family";
import { familyErrorKey } from "../lib/family/familyErrors";
import { useTheme } from "../theme/ThemeContext";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { ModernButton } from "../components/ModernButton";
import { makeFamilyStyles } from "../components/family/familyStyles";

type Props = NativeStackScreenProps<AppStackParamList, "ParentDashboard">;

// Web equivalent: src/app/[locale]/(app)/parent/page.tsx (ParentDashboard).
export default function ParentDashboardScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Family");
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [links, setLinks] = useState<FamilyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await getFamilyStatus();
      setStatus(s);
      if (s.can_invite) setLinks((await listFamilyLinks()).as_parent);
    } catch (err) {
      setError(t(`Errors.${familyErrorKey(err)}`));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmClose(link: FamilyLink) {
    const pending = link.status === "pending";
    Alert.alert(
      pending ? t("Parent.cancelInviteConfirmTitle") : t("Parent.unlinkConfirmTitle"),
      pending ? t("Parent.cancelInviteConfirmBody") : t("Parent.unlinkConfirmBody"),
      [
        { text: t("Parent.keep"), style: "cancel" },
        {
          text: pending ? t("Parent.cancelInvite") : t("Parent.unlink"),
          style: "destructive",
          onPress: async () => {
            try {
              await closeFamilyLink(link.link_id);
              load();
            } catch (err) {
              Alert.alert(t(`Errors.${familyErrorKey(err)}`));
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const active = links.filter((l) => l.status === "active");
  const pending = links.filter((l) => l.status === "pending");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <Text style={styles.hint}>{t("Parent.pageDescription")}</Text>

      {error ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !status?.enabled ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("Unavailable.title")}</Text>
          <Text style={styles.hint}>{t("Unavailable.description")}</Text>
        </View>
      ) : !status.can_invite ? (
        <View style={styles.card}>
          <Text style={styles.hint}>{status.age_band == null ? t("Parent.needBirthYear") : t("Parent.adultsOnly")}</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("Parent.childrenTitle")}</Text>
          <Text style={styles.hint}>{t("Parent.childrenDescription")}</Text>
          <ModernButton title={t("Invite.button")} onPress={() => navigation.navigate("InviteChild")} />

          {links.length === 0 && <Text style={styles.hint}>{t("Parent.noChildren")}</Text>}

          {active.map((l) => (
            <View key={l.link_id} style={{ gap: 10 }}>
              <View style={styles.divider} />
              <AnimatedPressable
                style={styles.row}
                onPress={() => navigation.navigate("ChildDetail", { linkId: l.link_id, childName: l.child_name })}
              >
                <View style={styles.rowText}>
                  <Text style={styles.body}>{l.child_name ?? t("Parent.unnamedChild")}</Text>
                  <Text style={styles.hint}>{l.invite_email}</Text>
                </View>
                <View style={[styles.pill, styles.pillActive]}>
                  <Text style={[styles.pillText, styles.pillActiveText]}>{t("Parent.statusActive")}</Text>
                </View>
              </AnimatedPressable>
            </View>
          ))}

          {pending.map((l) => (
            <View key={l.link_id} style={{ gap: 10 }}>
              <View style={styles.divider} />
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.body}>{l.invite_email}</Text>
                  {l.expires_at != null && (
                    <Text style={styles.hint}>
                      {t("Parent.expires", { date: new Date(l.expires_at * 1000).toLocaleDateString(i18n.language) })}
                    </Text>
                  )}
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{t("Parent.statusPending")}</Text>
                </View>
              </View>
              <ModernButton title={t("Parent.cancelInvite")} variant="outline" onPress={() => confirmClose(l)} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
