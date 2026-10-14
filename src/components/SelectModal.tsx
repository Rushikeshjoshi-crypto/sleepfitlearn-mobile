import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, SafeAreaView, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme/ThemeContext";
import { typography, type ColorPalette } from "../theme/palettes";

export type SelectOption = { label: string; value: string; sublabel?: string };
export type SelectSection = { title: string; data: SelectOption[] };

// Case-insensitive substring match, same as web's filterSubjectGroupsByQuery
// (src/components/study/subjectSearch.ts) — sections left with zero matches
// are dropped entirely so they don't show as empty headers.
function filterSectionsByQuery(sections: SelectSection[], query: string): SelectSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => ({ ...section, data: section.data.filter((item) => item.label.toLowerCase().includes(q)) }))
    .filter((section) => section.data.length > 0);
}

// Stand-in for a native dropdown/select — RN has none built in, and adding
// @react-native-picker/picker means another native module + rebuild.
export default function SelectModal({
  visible,
  title,
  sections,
  onSelect,
  onClose,
  searchPlaceholder = "Search",
  showCustomOption = false,
  customOptionValue,
  customOptionLabel,
}: {
  visible: boolean;
  title: string;
  sections: SelectSection[];
  onSelect: (value: string) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  // Always shown last, unaffected by the search filter — matches web's
  // SubjectCombobox, which renders its "write your own subject" entry
  // outside the filtered/searched groups.
  showCustomOption?: boolean;
  customOptionValue?: string;
  customOptionLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation("UI");
  const [search, setSearch] = useState("");

  // Reset the search box each time the modal is (re)opened, rather than
  // leaving stale text from a previous open.
  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);

  const visibleSections = useMemo(() => filterSectionsByQuery(sections, search), [sections, search]);

  function choose(value: string) {
    onSelect(value);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.closeText}>{t("close")}</Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable style={styles.searchClear} onPress={() => setSearch("")} hitSlop={8}>
                <Text style={styles.searchClearText}>✕</Text>
              </Pressable>
            )}
          </View>

          <SectionList
            sections={visibleSections}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.emptyText}>No matches found.</Text>}
            renderSectionHeader={({ section }) =>
              section.title ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => choose(item.value)}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.sublabel && <Text style={styles.rowSublabel}>{item.sublabel}</Text>}
              </Pressable>
            )}
            ListFooterComponent={
              showCustomOption && customOptionValue
                ? () => (
                    <Pressable style={styles.row} onPress={() => choose(customOptionValue)}>
                      <Text style={styles.rowLabel}>{customOptionLabel}</Text>
                    </Pressable>
                  )
                : undefined
            }
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "75%" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.foreground },
  closeText: { color: colors.navTint, fontWeight: "500" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: typography.body.fontSize, color: colors.foreground },
  searchClear: { paddingLeft: 8, paddingVertical: 10 },
  searchClearText: { color: colors.mutedForeground, fontSize: 14 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, paddingHorizontal: 20, paddingVertical: 16 },
  sectionHeader: {
    fontSize: typography.label.fontSize,
    fontWeight: "600",
    color: colors.mutedForeground,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  row: { paddingVertical: 14, paddingHorizontal: 20 },
  rowLabel: { fontSize: 16, color: colors.foreground },
  rowSublabel: { fontSize: typography.bodySmall.fontSize, color: colors.mutedForeground, marginTop: 2 },
  });
}
