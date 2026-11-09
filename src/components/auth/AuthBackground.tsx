import type { ReactNode } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";

// Same photos as the web auth pages (src/assets/auth-bg.jpg, auth-signup-bg.jpg),
// resized for phones. Decorative; a dark wash keeps the card and text readable.
const IMAGES = {
  login: require("../../../assets/images/auth-bg.jpg"),
  signup: require("../../../assets/images/auth-signup-bg.jpg"),
};

export function AuthBackground({ variant = "login", children }: { variant?: keyof typeof IMAGES; children: ReactNode }) {
  return (
    <ImageBackground source={IMAGES[variant]} style={styles.bg} resizeMode="cover" accessibilityRole="none">
      <View style={styles.wash} pointerEvents="none" />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#121212" },
  wash: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.6)" },
});
