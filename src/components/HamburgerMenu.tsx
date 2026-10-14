import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { AppStackParamList } from "../navigation/AppNavigator";
import { useTheme } from "../theme/ThemeContext";
import type { ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";
import { getUserProfile } from "../lib/api/users";
import { getFamilyStatus } from "../lib/api/family";
import { showParentDashboardEntry } from "../lib/family/parentNav";

const ITEM_ROUTES: (keyof AppStackParamList)[] = ["Insights", "Settings", "Study", "Exercise", "Personal", "Billing"];

// No icon library on mobile — glyphs stand in, same convention as
// HabitsScreen's EVENT_TYPE_GLYPH and Insights' METRIC_GLYPH.
const ITEM_GLYPH: Partial<Record<keyof AppStackParamList, string>> = {
  Insights: "📊",
  Settings: "⚙️",
  Study: "📖",
  Exercise: "🏋️",
  Personal: "👤",
  Billing: "💳",
  ParentDashboard: "👪",
};

const PANEL_WIDTH = Math.min(320, Dimensions.get("window").width * 0.82);

// Replaces the old bottom-tab "More" screen — same five destinations, now
// reached from a hamburger button on every tab root header instead of
// taking up a whole tab slot.
//
// RN's built-in <Modal animationType="slide"> only ever slides up from the
// bottom regardless of how the content inside is laid out — there's no
// "slide from the side" option on the component itself. To get a real
// right-side drawer, the Modal here just provides the overlay/backdrop
// (animationType="none") and an Animated.View is driven manually with
// translateX, off-screen (PANEL_WIDTH) to 0 on open and back on close.
export function HamburgerMenu() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation(["Nav", "UI"]);
  // Adults who can invite also get "Family" (the parent dashboard).
  const [showFamily, setShowFamily] = useState(false);
  const routes: (keyof AppStackParamList)[] = showFamily ? [...ITEM_ROUTES.slice(0, -1), "ParentDashboard", ...ITEM_ROUTES.slice(-1)] : ITEM_ROUTES;
  const items = routes.map((route) => ({
    route,
    label: route === "ParentDashboard" ? t("Nav:family") : t(`Nav:${route.toLowerCase()}`),
    glyph: ITEM_GLYPH[route] ?? "•",
  }));
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const [visible, setVisible] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getUserProfile()
      .then((p) => setProfileName(p.nickname || p.email))
      .catch(() => {});
    getFamilyStatus()
      .then((s) => setShowFamily(showParentDashboardEntry(s)))
      .catch(() => {});
  }, []);

  function open() {
    setVisible(true);
  }

  function close(after?: () => void) {
    Animated.parallel([
      Animated.timing(translateX, { toValue: PANEL_WIDTH, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      after?.();
    });
  }

  useEffect(() => {
    if (!visible) return;
    translateX.setValue(PANEL_WIDTH);
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [visible, translateX, backdropOpacity]);

  function go(route: keyof AppStackParamList) {
    close(() => navigation.navigate(route as never));
  }

  const initial = (profileName ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <AnimatedPressable
        style={styles.button}
        onPress={open}
        borderless
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <View style={styles.friesIcon}>
          <View style={[styles.friesBar, styles.friesBarLong]} />
          <View style={[styles.friesBar, styles.friesBarMedium]} />
          <View style={[styles.friesBar, styles.friesBarShort]} />
        </View>
      </AnimatedPressable>

      <Modal visible={visible} animationType="none" transparent onRequestClose={() => close()}>
        <View style={styles.container}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
          </Pressable>

          <Animated.View style={[styles.panel, { width: PANEL_WIDTH, transform: [{ translateX }] }]}>
            <SafeAreaView style={styles.panelInner} edges={["top", "right", "bottom"]}>
              <View style={styles.panelHeader}>
                {/* No matching web key for this panel's own heading (web has
                    no equivalent drawer with its own "Menu" title). */}
                <Text style={styles.panelTitle}>Menu</Text>
                <Pressable onPress={() => close()} hitSlop={8}>
                  <Text style={styles.closeText}>{t("UI:close")}</Text>
                </Pressable>
              </View>

              <AnimatedPressable style={styles.profileCard} onPress={() => go("Settings")}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profileName ?? "—"}
                </Text>
              </AnimatedPressable>

              <View style={styles.list}>
                {items.map((item, index) => (
                  <AnimatedPressable
                    key={item.route}
                    style={[styles.row, index === items.length - 1 && styles.rowLast]}
                    onPress={() => go(item.route)}
                  >
                    <View style={styles.rowIconWrap}>
                      <Text style={styles.rowIcon}>{item.glyph}</Text>
                    </View>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    <Text style={styles.chevron}>{">"}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    friesIcon: { width: 18, height: 14, justifyContent: "space-between" },
    friesBar: { height: 2.5, borderRadius: 2, backgroundColor: colors.foreground },
    friesBarLong: { width: 18 },
    friesBarMedium: { width: 13 },
    friesBarShort: { width: 8 },
    container: { flex: 1, flexDirection: "row" },
    // Slightly tinted rather than flat black — reads closer to a frosted
    // scrim than a plain dim, same intent as the web hamburger's
    // backdrop-blur even though RN has no real blur without a native
    // package (see panel's translucent background below for the same
    // reasoning).
    backdrop: { flex: 1, backgroundColor: "rgba(5,11,42,0.45)" },
    panel: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      // Translucent instead of solid `colors.card` — the closest glass look
      // achievable without a native blur module (react-native's Modal
      // already composites over the live screen, so a translucent color
      // here genuinely shows a dimmed version of whatever's behind it,
      // unlike a blur it won't soften that content, just tint through it).
      backgroundColor: `${colors.card}E0`,
      borderTopLeftRadius: 24,
      borderBottomLeftRadius: 24,
      borderLeftWidth: 1,
      borderColor: "rgba(255,255,255,0.14)",
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: -4, height: 0 },
      elevation: 12,
    },
    panelInner: { flex: 1 },
    panelHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    panelTitle: { fontSize: 16, fontWeight: "600", color: colors.foreground },
    closeText: { fontSize: 14, color: colors.navTint, fontWeight: "500" },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 20,
      marginTop: 16,
      padding: 14,
      borderRadius: 20,
      backgroundColor: colors.muted,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.navTint,
    },
    avatarText: { color: colors.primaryForeground, fontSize: 18, fontWeight: "700" },
    profileName: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.foreground },
    list: { marginTop: 12, paddingHorizontal: 20 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    rowIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.muted,
    },
    rowIcon: { fontSize: 15 },
    rowLabel: { flex: 1, fontSize: 16, fontWeight: "500", color: colors.foreground },
    chevron: { color: colors.mutedForeground, fontSize: 16 },
  });
}
