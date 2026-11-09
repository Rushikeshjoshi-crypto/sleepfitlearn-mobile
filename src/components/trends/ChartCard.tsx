import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeContext";
import { radius, typography, type ColorPalette } from "../../theme/palettes";
import { CHART_HEIGHT } from "./chartScale";

// Mobile counterpart of the web app's src/components/trends/charts/ChartCard.tsx.
// headerRight is the small "latest value / change" block of the Vitals cards.
export function ChartCard({
  title,
  unit,
  headerRight,
  isLoading,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  unit?: string;
  headerRight?: ReactNode;
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
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
          {unit ? <Text style={styles.unit}> ({unit})</Text> : null}
        </Text>
        {headerRight}
      </View>
      {isLoading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.orange} />
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
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 12,
    },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
    title: { flex: 1, fontSize: typography.sectionTitle.fontSize + 2, fontWeight: "800", color: colors.foreground },
    unit: { fontSize: 12, fontWeight: "400", color: colors.mutedForeground },
    placeholder: { height: CHART_HEIGHT, alignItems: "center", justifyContent: "center" },
    empty: { borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 12 },
    emptyText: { fontSize: 13, color: colors.mutedForeground, textAlign: "center" },
  });
}
