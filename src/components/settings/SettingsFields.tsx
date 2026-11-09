import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../theme/ThemeContext";
import { radius, type ColorPalette } from "../../theme/palettes";
import { AnimatedPressable } from "../AnimatedPressable";

function PencilIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20h9" />
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

// One titled block of the form: heading, hint, then a tinted panel of fields.
export function SettingsSection({
  title,
  hint,
  children,
  onSectionLayout,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  onSectionLayout?: (y: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View onLayout={(e) => onSectionLayout?.(e.nativeEvent.layout.y)}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.sectionHint}>{hint}</Text>
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.label}>{children}</Text>;
}

// A value set at sign-up that Settings can't change (name, email, phone).
export function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, styles.boxLocked]}>
        <Text style={styles.valueMuted} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Text style={styles.fieldHint}>{hint}</Text>
    </View>
  );
}

// Field with a pencil button while locked; the pencil opens it for editing.
export function EditBox({
  label,
  editing,
  canEdit = true,
  onEdit,
  editLabel,
  children,
}: {
  label: string;
  editing: boolean;
  canEdit?: boolean;
  onEdit: () => void;
  editLabel: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View>
        {children}
        {!editing && canEdit && (
          <AnimatedPressable style={styles.pencil} onPress={onEdit} accessibilityRole="button" accessibilityLabel={editLabel} hitSlop={6}>
            <PencilIcon color={colors.mutedForeground} />
          </AnimatedPressable>
        )}
      </View>
    </View>
  );
}

export function SettingsInput({ locked, ...props }: TextInputProps & { locked?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TextInput
      style={[styles.box, styles.input, locked && styles.boxLocked, locked && styles.inputLocked]}
      placeholderTextColor={colors.mutedForeground}
      {...props}
      editable={!locked && props.editable !== false}
    />
  );
}

// Tappable box that shows a value (gender, language, country pickers).
export function PickerBox({
  value,
  placeholder,
  onPress,
  disabled,
  locked,
}: {
  value: string | null;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <AnimatedPressable style={[styles.box, locked && styles.boxLocked]} onPress={onPress} disabled={disabled || locked} scaleTo={0.99}>
      <Text style={value ? (locked ? styles.valueMuted : styles.value) : styles.placeholder} numberOfLines={1}>
        {value || placeholder || ""}
      </Text>
    </AnimatedPressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2, color: colors.foreground },
    sectionHint: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
    panel: { marginTop: 12, gap: 16, padding: 14, borderRadius: radius.lg, backgroundColor: colors.soft },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: "600", color: colors.foreground },
    fieldHint: { fontSize: 12, color: colors.mutedForeground },
    box: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    boxLocked: { opacity: 0.85 },
    input: { fontSize: 16, color: colors.foreground, paddingVertical: 10 },
    inputLocked: { color: colors.mutedForeground, paddingRight: 52 },
    value: { fontSize: 16, color: colors.foreground },
    valueMuted: { fontSize: 15, color: colors.mutedForeground },
    placeholder: { fontSize: 16, color: colors.mutedForeground },
    pencil: {
      position: "absolute",
      right: 6,
      top: 6,
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.soft,
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
