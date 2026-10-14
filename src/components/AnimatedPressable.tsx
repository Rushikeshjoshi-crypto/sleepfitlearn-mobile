import { useRef, type ReactNode } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { duration } from "../theme/palettes";
import { useTheme } from "../theme/ThemeContext";

// Animate the Pressable itself (not a wrapping View) so `style` — flex,
// flexDirection, padding, everything a caller passes — behaves exactly like
// a plain Pressable/View would. An earlier version wrapped children in a
// separate Animated.View and gave IT the style instead, which meant flex:1
// segments/buttons never got their real size (they shrank to content width)
// and multi-child rows lost their intended flexDirection — this is the fix.
const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

// Shared press-feedback wrapper — a subtle scale-down on press-in, spring
// back on release, plus Android's native ripple (mobile's equivalent of a
// desktop hover state — there is no hover on touch). Every tappable surface
// in the app (buttons, cards, list rows, tab items) should go through this
// instead of a bare Pressable/TouchableOpacity so the feel is consistent.
// Uses RN's built-in Animated API + Pressable's built-in android_ripple only
// (no reanimated/gesture-handler dependency).
export function AnimatedPressable({
  children,
  style,
  scaleTo = 0.96,
  rippleColor,
  borderless = false,
  ...pressableProps
}: Omit<PressableProps, "children" | "style"> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  rippleColor?: string;
  borderless?: boolean;
}) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.timing(scale, { toValue: scaleTo, duration: duration.pressIn, useNativeDriver: true }).start();
  }

  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  }

  return (
    <AnimatedPressableBase
      android_ripple={
        pressableProps.disabled
          ? undefined
          : { color: rippleColor ?? `${colors.foreground}1F`, borderless }
      }
      {...pressableProps}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(e) => {
        onPressIn();
        pressableProps.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        onPressOut();
        pressableProps.onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressableBase>
  );
}
