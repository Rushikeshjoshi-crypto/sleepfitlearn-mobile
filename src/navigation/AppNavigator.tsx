import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "../screens/HomeScreen";
import SleepScreen from "../screens/SleepScreen";
import HabitsScreen from "../screens/HabitsScreen";
import TrendsScreen from "../screens/TrendsScreen";
import InsightsScreen from "../screens/InsightsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import StudyScreen from "../screens/StudyScreen";
import ExerciseScreen from "../screens/ExerciseScreen";
import PersonalScreen from "../screens/PersonalScreen";
import BillingScreen from "../screens/BillingScreen";
import ParentDashboardScreen from "../screens/ParentDashboardScreen";
import ChildDetailScreen from "../screens/ChildDetailScreen";
import InviteChildScreen from "../screens/InviteChildScreen";
import AcceptInviteScreen from "../screens/AcceptInviteScreen";
import HeartRateMeasureScreen from "../screens/HeartRateMeasureScreen";
import ConnectionsScreen from "../screens/ConnectionsScreen";
import { PendingInviteNavigator } from "../components/family/PendingInviteNavigator";
import { useTheme } from "../theme/ThemeContext";
import { BackButton } from "../components/BackButton";

export type AppTabParamList = {
  Home: undefined;
  Sleep: undefined;
  Habits: undefined;
  Trends: undefined;
};

// The five screens formerly reached via the bottom-tab "More" screen — now
// pushed from the hamburger menu (see components/HamburgerMenu.tsx) instead
// of taking up a tab slot.
export type AppStackParamList = {
  Tabs: undefined;
  Insights: undefined;
  Settings: undefined;
  Study: undefined;
  Exercise: undefined;
  Personal: undefined;
  Billing: undefined;
  // Parent control (family) — reached from Settings → Family, or the
  // sleepfitlearn://family/accept deep link for AcceptInvite.
  ParentDashboard: undefined;
  ChildDetail: { linkId: string; childName: string | null };
  InviteChild: undefined;
  // code: from an invite link / typed; linkId: from Settings → Family → Invites for you.
  AcceptInvite: { code?: string; linkId?: string } | undefined;
  // Camera heart rate (fingertip over the camera + flash) — from Personal.
  HeartRateMeasure: undefined;
  Connections: undefined;
};

const TAB_ICONS: Record<keyof AppTabParamList, string> = {
  Home: "🏠",
  Sleep: "🌙",
  Habits: "✅",
  Trends: "📈",
};

const Tab = createBottomTabNavigator<AppTabParamList>();
const Stack = createNativeStackNavigator<AppStackParamList>();

function AppTabs() {
  const { colors } = useTheme();
  const { t } = useTranslation("Nav");
  const TAB_LABELS: Record<keyof AppTabParamList, string> = {
    Home: t("home"),
    Sleep: t("sleep"),
    Habits: t("habits"),
    Trends: t("trends"),
  };
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.navTint,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          height: 68,
          paddingTop: 10,
          paddingBottom: 12,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 12,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarLabel: TAB_LABELS[route.name as keyof AppTabParamList],
        tabBarIcon: ({ focused }) => (
          <View style={[tabIconStyles.iconWrap, focused && { backgroundColor: `${colors.navTint}1A` }]}>
            <Text style={[tabIconStyles.glyph, focused ? tabIconStyles.glyphActive : tabIconStyles.glyphInactive]}>
              {TAB_ICONS[route.name as keyof AppTabParamList]}
            </Text>
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Sleep" component={SleepScreen} />
      <Tab.Screen name="Habits" component={HabitsScreen} />
      <Tab.Screen name="Trends" component={TrendsScreen} />
    </Tab.Navigator>
  );
}

const tabIconStyles = StyleSheet.create({
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: { fontSize: 18 },
  glyphActive: { opacity: 1 },
  glyphInactive: { opacity: 0.6 },
});

export default function AppNavigator() {
  const { colors } = useTheme();
  const { t } = useTranslation("Nav");

  // Native back-arrow header, shown only on these pushed detail screens —
  // the tab roots (Home/Sleep/Habits/Trends) render their own in-content
  // AppHeader and have nothing to go "back" to.
  const detailScreenOptions = {
    headerShown: true,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.navTint,
    headerTitleStyle: { color: colors.foreground },
    // No matching web key — browser back navigation has no equivalent label.
    headerBackTitle: "Back",
    headerLeft: () => <BackButton />,
    animation: "slide_from_right" as const,
  };

  const { t: tFamily } = useTranslation("Family");
  const { t: tHeart } = useTranslation("HeartCamera");
  const { t: tHabits } = useTranslation("Habits");

  return (
    <>
    <PendingInviteNavigator />
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={AppTabs} />
      <Stack.Screen name="Insights" component={InsightsScreen} options={{ ...detailScreenOptions, title: t("insights") }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ ...detailScreenOptions, title: t("settings") }} />
      <Stack.Screen name="Study" component={StudyScreen} options={{ ...detailScreenOptions, title: t("study") }} />
      <Stack.Screen name="Exercise" component={ExerciseScreen} options={{ ...detailScreenOptions, title: t("exercise") }} />
      <Stack.Screen name="Personal" component={PersonalScreen} options={{ ...detailScreenOptions, title: t("personal") }} />
      <Stack.Screen name="Billing" component={BillingScreen} options={{ ...detailScreenOptions, title: t("billing") }} />
      <Stack.Screen name="ParentDashboard" component={ParentDashboardScreen} options={{ ...detailScreenOptions, title: tFamily("Parent.pageTitle") }} />
      <Stack.Screen
        name="ChildDetail"
        component={ChildDetailScreen}
        options={({ route }) => ({ ...detailScreenOptions, title: route.params.childName ?? tFamily("Parent.unnamedChild") })}
      />
      <Stack.Screen name="InviteChild" component={InviteChildScreen} options={{ ...detailScreenOptions, title: tFamily("Invite.title") }} />
      <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} options={{ ...detailScreenOptions, title: tFamily("Accept.pageTitle") }} />
      <Stack.Screen name="HeartRateMeasure" component={HeartRateMeasureScreen} options={{ ...detailScreenOptions, title: tHeart("title") }} />
      <Stack.Screen name="Connections" component={ConnectionsScreen} options={{ ...detailScreenOptions, title: tHabits("connectionsTitle") }} />
    </Stack.Navigator>
    </>
  );
}
