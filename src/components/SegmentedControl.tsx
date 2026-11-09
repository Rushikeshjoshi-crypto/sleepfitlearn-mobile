import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { radius, type ColorPalette } from "../theme/palettes";
import { AnimatedPressable } from "./AnimatedPressable";

export type SegmentedControlOption<T extends string> = { value: T; label: string };

const PADDING = 4;

// Shared segmented control with an animated sliding pill indicator — replaces
// the hand-rolled "toggleRow/tabRow" pattern duplicated across Trends, Study,
// and Habits (each rebuilt the same flat two-button row with an instant
// background swap on press instead of a sliding transition).
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;

  const segmentWidth = containerWidth > 0 ? (containerWidth - PADDING * 2) / options.length : 0;
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (segmentWidth <= 0) return;
    Animated.timing(indicatorX, {
      toValue: selectedIndex * segmentWidth,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [selectedIndex, segmentWidth, indicatorX]);

  function onLayout(e: LayoutChangeEvent) {
    setContainerWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {segmentWidth > 0 && (
        <Animated.View
          style={[styles.indicator, { width: segmentWidth, transform: [{ translateX: indicatorX }] }]}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <AnimatedPressable key={option.value} style={styles.segment} onPress={() => onChange(option.value)}>
            <Text style={[styles.label, selected && styles.labelActive]}>{option.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      backgroundColor: colors.soft,
      borderRadius: radius.md,
      padding: PADDING,
      minHeight: 44,
    },
    indicator: {
      position: "absolute",
      top: PADDING,
      bottom: PADDING,
      left: PADDING,
      borderRadius: radius.sm,
      backgroundColor: colors.primary,
    },
    segment: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
    label: { fontSize: 14, fontWeight: "700", color: colors.mutedForeground },
    labelActive: { color: colors.primaryForeground },
  });
}
