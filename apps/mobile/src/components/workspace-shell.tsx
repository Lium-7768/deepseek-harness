import type { PropsWithChildren } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from 'expo-router'
import { mobileTheme } from '@/theme'
import { NativeIcon } from '@/components/native-icon'
import { NativeBrandMark } from '@/components/native-brand-mark'
import { workspaceHeaderMinHeight } from '@/components/workspace-shell-logic'

type DrawerNavigation = { openDrawer: () => void }

type WorkspaceShellProps = {
  title?: string
  titleLeading?: React.ReactNode
  titleAccessory?: React.ReactNode
  titleAccessibilityLabel?: string
  onTitlePress?: () => void
  showBrand?: boolean
  leftAction?: React.ReactNode
  rightAction?: React.ReactNode
  /** Optional compact metadata row used by session/workspace headers. */
  headerMeta?: React.ReactNode
  showMenu?: boolean
}

/**
 * Provides the shared safe-area and header frame for screens inside the root drawer.
 * @param children - Screen content rendered below the header.
 * @param title - Header title.
 * @param titleLeading - Optional compact element rendered before the title.
 * @param titleAccessory - Optional compact element rendered beside the title.
 * @param titleAccessibilityLabel - Screen-reader label for an interactive title.
 * @param onTitlePress - Optional action that makes the title row a native button.
 * @param showBrand - Whether the standard product mark is rendered before the title.
 * @param leftAction - Optional replacement for the drawer menu button.
 * @param rightAction - Optional action rendered at the trailing edge.
 * @param headerMeta - Optional second-row metadata rendered below the top row.
 * @param showMenu - Whether the leading drawer menu is available.
 * @returns The shell frame.
 */
export function WorkspaceShell({
  children,
  title,
  titleLeading,
  titleAccessory,
  titleAccessibilityLabel,
  onTitlePress,
  showBrand = true,
  leftAction,
  rightAction,
  headerMeta,
  showMenu = true,
}: PropsWithChildren<WorkspaceShellProps>): React.JSX.Element {
  const navigation = useNavigation<DrawerNavigation>()
  const insets = useSafeAreaInsets()
  const hasHeaderMeta = headerMeta !== undefined
  const menu = showMenu ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="打开会话列表"
      onPress={() => navigation.openDrawer()}
      hitSlop={4}
      style={({ pressed }) => [s.icon, pressed && s.pressed]}
    >
      <NativeIcon name="menu" size={22} color={mobileTheme.colors.ink} />
    </Pressable>
  ) : null
  const titleContent = (
    <View style={s.titleGroup}>
      {titleLeading ? <View style={s.titleLeading}>{titleLeading}</View> : null}
      <Text numberOfLines={1} style={s.title}>
        {title ?? 'DeepSeek Harness'}
      </Text>
      {titleAccessory}
    </View>
  )
  return (
    <View style={[s.safe, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={s.root}>
        <View style={[s.header, { minHeight: workspaceHeaderMinHeight(hasHeaderMeta), paddingTop: insets.top }]}>
          <View style={s.headerTop}>
            {leftAction ?? menu}
            {showBrand ? (
              <View accessibilityElementsHidden style={s.brandAnchor}>
                <NativeBrandMark size={20} />
              </View>
            ) : null}
            {onTitlePress === undefined ? (
              titleContent
            ) : (
              <Pressable
                accessibilityLabel={titleAccessibilityLabel ?? title ?? 'DeepSeek Harness'}
                accessibilityRole="button"
                hitSlop={4}
                onPress={onTitlePress}
                style={({ pressed }) => [s.titleButton, pressed && s.pressed]}
              >
                {titleContent}
              </Pressable>
            )}
            <View style={s.right}>{rightAction}</View>
          </View>
          {hasHeaderMeta ? <View style={s.metaRow}>{headerMeta}</View> : null}
        </View>
        <View style={[s.content, { paddingBottom: insets.bottom }]}>{children}</View>
      </View>
    </View>
  )
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: mobileTheme.colors.background },
  root: { flex: 1 },
  header: { borderBottomColor: mobileTheme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: mobileTheme.chrome.headerHeight,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  icon: { alignItems: 'center', minHeight: 36, minWidth: 36, justifyContent: 'center' },
  brandAnchor: { alignItems: 'center', height: 28, justifyContent: 'center', marginHorizontal: 4, width: 28 },
  titleButton: { flex: 1, minWidth: 0 },
  titleGroup: { alignItems: 'center', flex: 1, flexDirection: 'row', minWidth: 0 },
  titleLeading: { alignItems: 'center', marginRight: 7 },
  title: { color: mobileTheme.colors.ink, flexShrink: 1, fontSize: 16, fontWeight: '500' },
  right: { alignItems: 'flex-end', minWidth: 36 },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: mobileTheme.chrome.headerMetaHeight,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  content: { flex: 1 },
  pressed: { opacity: 0.58 },
})
