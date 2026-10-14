import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { typography, type ColorPalette } from "../../theme/palettes";
import { CHART_HEIGHT } from "./chartScale";

// Mobile counterpart of the web app's src/components/trends/charts/ChartCard.tsx.
export function ChartCard({
  title,
  unit,
  isLoading,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  unit?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("Trends");

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {title}
        {unit ? <Text style={styles.unit}> ({unit})</Text> : null}
      </Text>
      {isLoading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.navTint} />
        </View>
      ) : isEmpty ? (
        <View style={[styles.placeholder, styles.empty]}>
          <Text style={styles.emptyText}>{emptyMessage ?? t("noDataYet")}</Text>
        </View>
      ) : (
        children
      )}
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
      padding: 16,
      gap: 10,
    },
    title: { fontSize: typography.sectionTitle.fontSize, fontWeight: "600", color: colors.foreground },
    unit: { fontSize: 12, fontWeight: "400", color: colors.mutedForeground },
    placeholder: { height: CHART_HEIGHT, alignItems: "center", justifyContent: "center" },
    empty: { borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 12 },
    emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center" },
  });
}
