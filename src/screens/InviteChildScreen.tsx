import { useMemo, useState } from "react";
import { ScrollView, Share, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { createInvite, type CreatedInvite, type ShareScopes } from "../lib/api/family";
import { familyErrorKey } from "../lib/family/familyErrors";
import { useTheme } from "../theme/ThemeContext";
import { ModernButton } from "../components/ModernButton";
import { ScopeToggleList } from "../components/family/ScopeToggleList";
import { makeFamilyStyles } from "../components/family/familyStyles";
import { inviteShareLink } from "../lib/family/inviteShareLink";
import { ENV } from "../config/env";

type Props = NativeStackScreenProps<AppStackParamList, "InviteChild">;

const DEFAULT_SCOPES: ShareScopes = { sleep: true, exercise: true, study: true, personal: false, habits: false };

// No email is sent (SES isn't set up) — the parent shares the code via the
// system share sheet. The code is only shown here, once. Web equivalent:
// src/components/family/InviteChildDialog.tsx.
export default function InviteChildScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t, i18n } = useTranslation("Family");
  const [email, setEmail] = useState("");
  const [scopes, setScopes] = useState<ShareScopes>(DEFAULT_SCOPES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      setCreated(await createInvite(email.trim(), scopes));
    } catch (err) {
      setError(t(`Errors.${familyErrorKey(err)}`));
    } finally {
      setSubmitting(false);
    }
  }

  function share() {
    if (!created) return;
    // A web link (works without the app), never sleepfitlearn:// — see inviteShareLink.
    const link = inviteShareLink({
      code: created.invite_code,
      inviteUrl: created.invite_url,
      webAppUrl: ENV.webAppUrl,
      locale: i18n.language,
    });
    const lines = [t("Invite.shareText", { code: created.invite_code }), ...(link ? [link] : [])];
    Share.share({ title: t("Invite.shareTitle"), message: lines.join("\n\n") }).catch(() => {});
  }

  if (created) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("Invite.createdTitle")}</Text>
          <Text style={styles.hint}>{t("Invite.createdDescription", { email: created.link.invite_email ?? "" })}</Text>
          <View style={styles.codeBox}>
            <Text style={styles.label}>{t("Invite.codeLabel")}</Text>
            <Text style={styles.codeText} selectable>
              {created.invite_code}
            </Text>
          </View>
          <ModernButton title={t("Invite.share")} onPress={share} />
          <Text style={styles.hint}>{t("Invite.codeOnce")}</Text>
          <ModernButton title={t("Invite.done")} variant="outline" onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.hint}>{t("Invite.description")}</Text>
        <Text style={styles.label}>{t("Invite.emailLabel")}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={t("Invite.emailPlaceholder")}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Text style={styles.hint}>{t("Invite.emailHelper")}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("Invite.scopesLabel")}</Text>
        <Text style={styles.hint}>{t("Invite.scopesHelper")}</Text>
        <ScopeToggleList value={scopes} onChange={setScopes} disabled={submitting} />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <ModernButton title={t("Invite.create")} onPress={submit} loading={submitting} disabled={!email.trim()} />
    </ScrollView>
  );
}
