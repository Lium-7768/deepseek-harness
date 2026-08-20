import type { ReactNode } from 'react'
import type { AccessibilityRole } from 'react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { mobileTheme } from '@/theme'

export function NativeSection({ title, children }: { title?: string; children: ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

type NativeListRowProps = {
  title: string
  description?: string
  left?: ReactNode
  right?: ReactNode
  selected?: boolean
  disabled?: boolean
  preserveDisabledReadability?: boolean
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
  multiline?: boolean
}

export function NativeListRow({
  title,
  description,
  left,
  right,
  selected = false,
  disabled = false,
  preserveDisabledReadability = false,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  multiline = false,
}: NativeListRowProps): React.JSX.Element {
  const subdued = disabled && !preserveDisabledReadability
  const content = (
    <>
      <View style={[styles.left, multiline && styles.leftMultiline]}>
        {left ? <View style={[styles.leading, multiline && styles.leadingMultiline]}>{left}</View> : null}
        <View style={styles.copy}>
          <Text numberOfLines={multiline ? undefined : 1} style={[styles.title, subdued && styles.disabledText]}>
            {title}
          </Text>
          {description ? (
            <Text numberOfLines={multiline ? undefined : 2} style={[styles.description, subdued && styles.disabledText]}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      {right ? <View style={[styles.trailing, multiline && styles.trailingMultiline]}>{right}</View> : null}
    </>
  )
  if (!onPress)
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, selected }}
        style={[styles.row, multiline && styles.rowMultiline, selected && styles.selected, subdued && styles.disabled]}
      >
        {content}
      </View>
    )
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        multiline && styles.rowMultiline,
        selected && styles.selected,
        subdued && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  section: { gap: mobileTheme.spacing.xs, marginBottom: mobileTheme.spacing.lg },
  sectionTitle: {
    color: mobileTheme.colors.inkMuted,
    fontSize: mobileTheme.typography.caption,
    fontWeight: '600',
    paddingHorizontal: mobileTheme.spacing.sm,
    textTransform: 'uppercase',
  },
  sectionBody: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.md,
  },
  rowMultiline: { alignItems: 'flex-start', paddingVertical: mobileTheme.spacing.sm },
  left: { alignItems: 'center', flex: 1, flexDirection: 'row', minWidth: 0 },
  leftMultiline: { alignItems: 'flex-start' },
  leading: { alignItems: 'center', justifyContent: 'center', marginRight: mobileTheme.spacing.sm, width: 24 },
  leadingMultiline: { marginTop: 2 },
  copy: { flex: 1, gap: mobileTheme.spacing.xxs, minWidth: 0 },
  title: { color: mobileTheme.colors.ink, fontSize: mobileTheme.typography.body, fontWeight: '500' },
  description: { color: mobileTheme.colors.inkMuted, fontSize: mobileTheme.typography.caption, lineHeight: 17 },
  trailing: { alignItems: 'center', justifyContent: 'center', marginLeft: mobileTheme.spacing.sm },
  trailingMultiline: { marginTop: 2 },
  selected: { backgroundColor: mobileTheme.colors.accentSoft },
  disabled: { opacity: 0.52 },
  disabledText: { color: mobileTheme.colors.inkFaint },
  pressed: { opacity: 0.68 },
})
