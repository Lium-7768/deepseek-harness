import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import { NativeIcon, type NativeIconName } from '@/components/native-icon'
import { mobileTheme } from '@/theme'

type NativeActionButtonProps = {
  label: string
  icon: NativeIconName
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

/** Renders a translated action with the mobile client's shared icon and button treatment.
 * @param props - Label, icon, action state, and press handler for the button.
 * @returns A native action button.
 */
export function NativeActionButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: NativeActionButtonProps): React.JSX.Element {
  const colors = buttonColors[variant]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, colors.button, style, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={colors.icon} /> : <NativeIcon name={icon} color={colors.icon} size={17} />}
      <Text style={[styles.label, colors.label]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: mobileTheme.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: mobileTheme.colors.accent, borderColor: mobileTheme.colors.accent },
  secondary: { backgroundColor: mobileTheme.colors.surface, borderColor: mobileTheme.colors.borderStrong },
  danger: { backgroundColor: mobileTheme.colors.dangerSoft, borderColor: '#efb5b0' },
  label: { fontSize: 14, fontWeight: '700' },
  primaryLabel: { color: '#ffffff' },
  secondaryLabel: { color: mobileTheme.colors.ink },
  dangerLabel: { color: mobileTheme.colors.danger },
  pressed: { opacity: 0.68 },
})

const buttonColors = {
  primary: { button: styles.primary, icon: '#ffffff', label: styles.primaryLabel },
  secondary: { button: styles.secondary, icon: mobileTheme.colors.ink, label: styles.secondaryLabel },
  danger: { button: styles.danger, icon: mobileTheme.colors.danger, label: styles.dangerLabel },
} as const
