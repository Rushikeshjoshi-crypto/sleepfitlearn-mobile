import "react-native-get-random-values";
import { useEffect, useState } from "react";
import { ActivityIndicator, StatusBar, View } from "react-native";
import { DarkTheme as NavDarkTheme, DefaultTheme as NavDefaultTheme, NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/lib/aws/AuthContext";
import AuthNavigator from "./src/navigation/AuthNavigator";
import AppNavigator from "./src/navigation/AppNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { initI18n } from "./src/i18n";
import { ProfileGate } from "./src/components/family/ProfileGate";
import { ForegroundSync } from "./src/components/ForegroundSync";
import { navigationRef, startInviteLinkCapture } from "./src/lib/family/inviteLinks";

// Shown while i18next loads the persisted language choice from AsyncStorage
// and initializes — kept inside ThemeProvider (but outside AuthProvider) so
// it can use the real theme colors, same loading-spinner look as Root's own
// auth-loading state below.
function I18nLoadingGate() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function Root() {
  const { loading, isAuthenticated } = useAuth();
  const { colors, resolvedScheme } = useTheme();

  const navTheme = {
    ...(resolvedScheme === "dark" ? NavDarkTheme : NavDefaultTheme),
    colors: {
      ...(resolvedScheme === "dark" ? NavDarkTheme.colors : NavDefaultTheme.colors),
      primary: colors.primary,
      background: colors.background,
      card: colors.card,
      text: colors.foreground,
      border: colors.border,
      notification: colors.destructive,
    },
  };

  // Family invite deep links are parked until someone is signed in (see
  // lib/family/inviteLinks.ts); other URLs (Stripe's return) are ignored there.
  useEffect(() => startInviteLinkCapture(), []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar barStyle={resolvedScheme === "dark" ? "light-content" : "dark-content"} />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        {isAuthenticated ? (
          <ProfileGate>
            {/* Foreground sync only starts once the age/profile check passed. */}
            <ForegroundSync />
            <AppNavigator />
          </ProfileGate>
        ) : (
          <AuthNavigator />
        )}
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().then(() => setI18nReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {i18nReady ? (
          <AuthProvider>
            <Root />
          </AuthProvider>
        ) : (
          <I18nLoadingGate />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
