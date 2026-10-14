import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import {
  acceptInvite,
  getFamilyStatus,
  previewInvite,
  rejectInvite,
  type FamilyStatus,
  type InvitePreview,
  type InviteRef,
  type ShareScopes,
} from "../lib/api/family";
import { familyErrorKey } from "../lib/family/familyErrors";
import { useTheme } from "../theme/ThemeContext";
import { ModernButton } from "../components/ModernButton";
import { ScopeToggleList } from "../components/family/ScopeToggleList";
import { makeFamilyStyles } from "../components/family/familyStyles";
import { inviteBlockReason } from "../lib/family/inviteBlockReason";

type Props = NativeStackScreenProps<AppStackParamList, "AcceptInvite">;

// Reached via an invite link (code, see lib/family/inviteLinks.ts), Settings →
// Family → "I have an invite code", or Settings → Family → "Invites for you"
// (by link id — no code to type).
// Web equivalent: src/components/family/AcceptInviteView.tsx.
//
// The consent wording (Family → Accept.consent*) is approved as version
// "v1-2026-10" (the backend's CONSENT_TEXT_VERSION, recorded with every
// acceptance). Changing the wording means bumping that version too.
export default function AcceptInviteScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Family");
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [codeInput, setCodeInput] = useState(route.params?.code ?? "");
  const [inviteRef, setInviteRef] = useState<InviteRef | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [scopes, setScopes] = useState<ShareScopes | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "accept" | "reject" | null>(null);

  const load = useCallback(
    async (ref: InviteRef) => {
      setBusy("load");
      setError(null);
      try {
        const p = await previewInvite(ref);
        setInviteRef(ref);
        setPreview(p);
        setScopes(p.share_scopes);
        setAgreed(false);
      } catch (err) {
        setError(t(`Errors.${familyErrorKey(err)}`));
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  useEffect(() => {
    getFamilyStatus()
      .then((s) => {
        setStatus(s);
        const initial: InviteRef | null = route.params?.linkId
          ? { linkId: route.params.linkId }
          : route.params?.code
            ? { code: route.params.code.trim() }
            : null;
        if (s.enabled && s.age_band === "13_17" && initial) load(initial);
      })
      .catch((err) => setError(t(`Errors.${familyErrorKey(err)}`)));
  }, [route.params?.code, route.params?.linkId, load, t]);

  async function accept() {
    if (!inviteRef || !preview || !scopes) return;
    setBusy("accept");
    setError(null);
    try {
      await acceptInvite(inviteRef, scopes, preview.consent_text_version);
      Alert.alert(t("Accept.accepted", { name: preview.parent_name ?? t("Accept.yourParent") }));
      navigation.navigate("Settings");
    } catch (err) {
      setError(t(`Errors.${familyErrorKey(err)}`));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!inviteRef) return;
    setBusy("reject");
    setError(null);
    try {
      await rejectInvite(inviteRef);
      Alert.alert(t("Accept.rejected"));
      navigation.goBack();
    } catch (err) {
      setError(t(`Errors.${familyErrorKey(err)}`));
    } finally {
      setBusy(null);
    }
  }

  if (!status && !error) {
    return (
      <View style={[styles.screen, { justifyContent: "center" }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // lib/family/inviteBlockReason (same as web) — includes under-13.
  const blocked = status ? inviteBlockReason(status) : null;
  const notice =
    blocked === "unavailable"
      ? t("Unavailable.description")
      : blocked === "adult"
        ? t("Errors.adultCannotBeLinked")
        : blocked === "need_birth_year"
          ? t("Errors.birthYearRequired")
          : blocked === "under_13"
            ? t("Errors.under13")
            : null;

  if (notice || !status) {
    return (
      <View style={[styles.screen, styles.container]}>
        <View style={styles.card}>
          <Text style={notice ? styles.hint : styles.errorText}>{notice ?? error}</Text>
        </View>
      </View>
    );
  }

  if (!preview || !scopes) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.hint}>{t("Accept.pageDescription")}</Text>
          <Text style={styles.label}>{t("Accept.codeLabel")}</Text>
          <TextInput
            style={[styles.input, { letterSpacing: 3, fontFamily: "monospace" }]}
            value={codeInput}
            onChangeText={(v) => setCodeInput(v.toUpperCase())}
            placeholder="XXXX-XXXX"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={styles.hint}>{t("Accept.codeHelper")}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <ModernButton
            title={t("Accept.continue")}
            onPress={() => load({ code: codeInput.trim() })}
            loading={busy === "load"}
            disabled={!codeInput.trim()}
          />
        </View>
      </ScrollView>
    );
  }

  const parentName = preview.parent_name ?? t("Accept.yourParent");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("Accept.inviteFrom", { name: parentName })}</Text>
        <Text style={styles.hint}>
          {t("Accept.expires", { date: new Date(preview.expires_at * 1000).toLocaleDateString(i18n.language) })}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("Accept.scopesTitle", { name: parentName })}</Text>
        <Text style={styles.hint}>{t("Accept.scopesHelper")}</Text>
        <ScopeToggleList value={scopes} onChange={setScopes} allowed={preview.share_scopes} disabled={busy != null} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("Accept.consentTitle")}</Text>
        {[t("Accept.consentPoint1", { name: parentName }), t("Accept.consentPoint2"), t("Accept.consentPoint3"), t("Accept.consentPoint4")].map(
          (line) => (
            <Text key={line} style={styles.hint}>
              • {line}
            </Text>
          ),
        )}
        <Text style={styles.label}>{t("Accept.consentVersion", { version: preview.consent_text_version })}</Text>
        <View style={styles.row}>
          <Text style={[styles.body, { flex: 1 }]}>{t("Accept.agree", { name: parentName })}</Text>
          <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      <View style={styles.buttonRow}>
        <ModernButton
          style={styles.flexButton}
          title={t("Accept.accept")}
          onPress={accept}
          loading={busy === "accept"}
          disabled={!agreed || busy != null}
        />
        <ModernButton
          style={styles.flexButton}
          title={t("Accept.reject")}
          variant="outline"
          onPress={reject}
          loading={busy === "reject"}
          disabled={busy != null}
        />
      </View>
    </ScrollView>
  );
}
