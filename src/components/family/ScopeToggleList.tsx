import { useMemo } from "react";
import { Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SCOPE_KEYS, type ScopeKey, type ShareScopes } from "../../lib/api/family";
import { useTheme } from "../../theme/ThemeContext";
import { makeFamilyStyles } from "./familyStyles";

// One switch per data category a parent can be shown. `allowed` limits which
// can be turned on (on accept, a child can only narrow what was asked for);
// `pending` marks categories a parent has requested. Web equivalent:
// src/components/family/ScopeCheckboxList.tsx.
export function ScopeToggleList({
  value,
  onChange,
  allowed,
  pending,
  disabled,
}: {
  value: ShareScopes;
  onChange: (next: ShareScopes) => void;
  allowed?: Partial<Record<ScopeKey, boolean>>;
  pending?: Partial<Record<ScopeKey, boolean>> | null;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeFamilyStyles(colors), [colors]);
  const { t } = useTranslation("Family");

  return (
    <View style={{ gap: 12 }}>
      {SCOPE_KEYS.map((key) => {
        const isAllowed = allowed ? allowed[key] === true : true;
        return (
          <View key={key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.body, !isAllowed && { color: colors.mutedForeground }]}>
                {t(`Scopes.${key}.label`)}
                {pending?.[key] ? `  · ${t("Scopes.requested")}` : ""}
              </Text>
              <Text style={styles.hint}>{t(`Scopes.${key}.description`)}</Text>
            </View>
            <Switch
              value={value[key]}
              disabled={disabled || !isAllowed}
              onValueChange={(checked) => onChange({ ...value, [key]: checked })}
              trackColor={{ true: colors.primary, false: colors.border }}
              accessibilityLabel={t(`Scopes.${key}.label`)}
            />
          </View>
        );
      })}
    </View>
  );
}
