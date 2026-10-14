import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../../navigation/AppNavigator";
import {
  closeFamilyLink,
  getFamilyStatus,
  listFamilyLinks,
  listIncomingInvites,
  respondToScopeRequest,
  SCOPE_KEYS,
  updateShareScopes,
  type FamilyLink,
  type FamilyStatus,
  type IncomingInvite,
  type ShareScopes,
} from "../../lib/api/family";
import { familyErrorKey } from "../../lib/family/familyErrors";
import { useTheme } from "../../theme/ThemeContext";
import { ModernButton } from "../ModernButton";
import { ScopeToggleList } from "./ScopeToggleList";
import { makeFamilyStyles } from "./familyStyles";
import { familySectionView } from "../../lib/family/familySectionView";
import { ConsentLogList } from "./ConsentLogList";

// The child's side of one link — web equivalent: LinkedParentRow in
// src/components/family/LinkedParentsCard.tsx.
function LinkedParentRow({ link, onChanged }: { link: FamilyLink; onChanged: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t } = useTranslation("Family");
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState<ShareScopes>(link.share_scopes);
  const [saving, setSaving] = useState(false);
  // The child's own consent log for this link (web: LinkedParentsCard "Activity log").
  const [showLog, setShowLog] = useState(false);
  const name = link.parent_name ?? t("LinkedParents.unnamedParent");
  const shared = SCOPE_KEYS.filter((k) => link.share_scopes[k]);
  const requested = SCOPE_KEYS.filter((k) => link.pending_scopes?.[k]);
  const c = link.controls;
  const fail = (err: unknown) => Alert.alert(t(`Errors.${familyErrorKey(err)}`));

  async function respond(approve: boolean) {
    try {
      await respondToScopeRequest(link.link_id, approve);
      Alert.alert(approve ? t("LinkedParents.requestApproved") : t("LinkedParents.requestDeclined"));
      onChanged();
    } catch (err) {
      fail(err);
    }
  }

  async function saveScopes() {
    setSaving(true);
    try {
      await updateShareScopes(link.link_id, scopes);
      setEditing(false);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  function confirmUnlink() {
    Alert.alert(t("LinkedParents.unlinkConfirmTitle", { name }), t("LinkedParents.unlinkConfirmBody"), [
      { text: t("LinkedParents.keep"), style: "cancel" },
      {
        text: t("LinkedParents.unlink"),
        style: "destructive",
        onPress: async () => {
          try {
            await closeFamilyLink(link.link_id);
            Alert.alert(t("LinkedParents.unlinked", { name }));
            onChanged();
          } catch (err) {
            fail(err);
          }
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.divider} />
      <Text style={styles.body}>{name}</Text>
      <Text style={styles.hint}>
        {shared.length
          ? t("LinkedParents.canSee", { categories: shared.map((k) => t(`Scopes.${k}.label`)).join(", ") })
          : t("LinkedParents.seesNothing")}
      </Text>
      {c.daily_screen_time_limit_minutes != null && (
        <Text style={styles.hint}>• {t("LinkedParents.controlLimit", { minutes: c.daily_screen_time_limit_minutes })}</Text>
      )}
      {c.social_blocked && <Text style={styles.hint}>• {t("LinkedParents.controlSocial")}</Text>}

      {requested.length > 0 && (
        <View style={styles.requestBox}>
          <Text style={styles.body}>
            {t("LinkedParents.requestText", { name, categories: requested.map((k) => t(`Scopes.${k}.label`)).join(", ") })}
          </Text>
          <View style={styles.buttonRow}>
            <ModernButton style={styles.flexButton} title={t("LinkedParents.approve")} onPress={() => respond(true)} />
            <ModernButton style={styles.flexButton} title={t("LinkedParents.decline")} variant="outline" onPress={() => respond(false)} />
          </View>
        </View>
      )}

      {editing ? (
        <>
          <Text style={styles.hint}>{t("ScopesForm.childHelper")}</Text>
          <ScopeToggleList value={scopes} onChange={setScopes} disabled={saving} />
          <ModernButton title={t("ScopesForm.save")} onPress={saveScopes} loading={saving} />
        </>
      ) : (
        <View style={styles.buttonRow}>
          <ModernButton style={styles.flexButton} title={t("LinkedParents.editSharing")} variant="outline" onPress={() => setEditing(true)} />
          <ModernButton style={styles.flexButton} title={t("LinkedParents.unlink")} variant="outline" onPress={confirmUnlink} />
        </View>
      )}
      <ModernButton title={t("LinkedParents.viewLog")} variant="outline" onPress={() => setShowLog((v) => !v)} />
      {showLog && <ConsentLogList linkId={link.link_id} />}
    </View>
  );
}

// Settings → Family. Web equivalent: src/components/family/FamilySection.tsx.
export function FamilySection() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t } = useTranslation("Family");
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [asChild, setAsChild] = useState<FamilyLink[]>([]);
  // Invites sent to this account's email, reviewed by link id (no code to type).
  const [incoming, setIncoming] = useState<IncomingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [linksError, setLinksError] = useState(false);

  // A failed request is shown as an error with a retry — before, a failed
  // status read as "coming soon" (lib/family/familySectionView, same as web).
  const load = useCallback(async () => {
    setLoading(true);
    setStatusError(false);
    setLinksError(false);
    let s: FamilyStatus;
    try {
      s = await getFamilyStatus();
      setStatus(s);
    } catch {
      setStatus(null);
      setStatusError(true);
      setLoading(false);
      return;
    }
    try {
      setAsChild(s.can_be_linked ? (await listFamilyLinks()).as_child : []);
    } catch {
      setAsChild([]);
      setLinksError(true);
    } finally {
      setLoading(false);
    }
    // Best-effort: a failed list just shows no invites (the code entry stays).
    setIncoming(s.can_be_linked ? await listIncomingInvites().catch(() => []) : []);
  }, []);

  const view = familySectionView({ statusLoading: loading && !status, statusError, status, linksLoading: loading, linksError });
  const errorWithRetry = (
    <>
      <Text style={styles.errorText}>{t("Errors.generic")}</Text>
      <ModernButton title={t("retry")} variant="outline" onPress={load} />
    </>
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t("Settings.title")}</Text>
      <Text style={styles.hint}>{t("Settings.description")}</Text>
      {view === "loading" || view === "child_loading" ? (
        <ActivityIndicator color={colors.navTint} />
      ) : view === "status_error" ? (
        errorWithRetry
      ) : view === "unavailable" || !status ? (
        <>
          <Text style={styles.body}>{t("Unavailable.title")}</Text>
          <Text style={styles.hint}>{t("Unavailable.description")}</Text>
        </>
      ) : view === "need_birth_year" ? (
        <Text style={styles.hint}>{t("Settings.needBirthYear")}</Text>
      ) : view === "parent" ? (
        <>
          <Text style={styles.hint}>{t("Settings.parentHelper")}</Text>
          <ModernButton title={t("Settings.openDashboard")} onPress={() => navigation.navigate("ParentDashboard")} />
        </>
      ) : view === "child" || view === "links_error" ? (
        <>
          {incoming.length > 0 && (
            <>
              <Text style={styles.label}>{t("Incoming.title")}</Text>
              {incoming.map((inv) => (
                <View key={inv.link_id} style={styles.requestBox}>
                  <Text style={styles.body}>
                    {t("Incoming.from", { name: inv.parent_name ?? t("LinkedParents.unnamedParent") })}
                  </Text>
                  <ModernButton
                    title={t("Incoming.review")}
                    onPress={() => navigation.navigate("AcceptInvite", { linkId: inv.link_id })}
                  />
                </View>
              ))}
            </>
          )}
          {view === "links_error" ? (
            errorWithRetry
          ) : asChild.length > 0 ? (
            <>
              <Text style={styles.label}>{t("LinkedParents.title")}</Text>
              {asChild.map((l) => (
                <LinkedParentRow key={`${l.link_id}-${JSON.stringify(l.share_scopes)}-${JSON.stringify(l.pending_scopes)}`} link={l} onChanged={load} />
              ))}
            </>
          ) : (
            <Text style={styles.hint}>{t("Settings.noParents")}</Text>
          )}
          <ModernButton title={t("Settings.enterCode")} variant="outline" onPress={() => navigation.navigate("AcceptInvite")} />
        </>
      ) : (
        // Enabled but neither 18+ nor 13–17 (an under-13 band) — say why, not an empty card.
        <Text style={styles.hint}>{t("Errors.under13")}</Text>
      )}
    </View>
  );
}
