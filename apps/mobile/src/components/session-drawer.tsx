import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MobileApi } from '@/api/mobile-api'
import { NativeBrandMark } from '@/components/native-brand-mark'
import { NativeIcon } from '@/components/native-icon'
import { NativeListRow } from '@/components/native-list'
import {
  hasWorkspaceData,
  sessionIdFromRoute,
  sessionRows,
  sessionTimeLabel,
  sortSessions,
  visibleWorkspaceRows,
  type SessionDrawerRow,
} from '@/components/session-drawer-logic'
import type { SessionSummary } from '@/types/mobile'
import { useConnectionStore } from '@/state/connection'
import { useSessionSelectionStore } from '@/state/session-selection'
import { mobileTheme } from '@/theme'

/**
 * Renders the root Expo Router drawer content for session navigation.
 *
 * The root drawer owns opening, closing, and animation. This component owns only
 * the session query and the list presentation, so the workspace cannot mount a
 * second modal drawer.
 *
 * @param props - Navigation state and helpers supplied by the root drawer.
 * @returns The native session drawer content.
 */
export function SessionDrawer(props: DrawerContentComponentProps): React.JSX.Element {
  const { navigation, state } = props
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [expandedViewSection, setExpandedViewSection] = useState<'group' | 'sort' | undefined>()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<'workspace' | 'flat'>('workspace')
  const [collapsedWorkspaceKeys, setCollapsedWorkspaceKeys] = useState<Set<string>>(() => new Set())
  const connection = useConnectionStore(value => value.connection)
  const selectSession = useSessionSelectionStore(value => value.selectSession)
  const query = useQuery({
    queryKey: ['sessions', connection?.gatewayUrl, connection?.deviceId],
    enabled: Boolean(connection),
    queryFn: () => new MobileApi(requireConnection(connection)).listSessions(),
  })
  const currentSessionId = currentSessionFromState(state)
  const archivedSessionIds = useMemo(
    () => new Set(query.data?.archivedSessionIds ?? []),
    [query.data?.archivedSessionIds],
  )
  const sessions = useMemo(
    () => (query.data?.items ?? []).filter(item => !archivedSessionIds.has(item.sessionId)),
    [archivedSessionIds, query.data?.items],
  )
  const workspaces = query.data?.workspaces ?? []
  const filteredSessions = useMemo(() => {
    const term = search.trim().toLowerCase()
    const matches = term
      ? sessions.filter(
        item =>
          String(item.title ?? '')
            .toLowerCase()
            .includes(term) || item.sessionId.toLowerCase().includes(term),
      )
      : sessions
    return sortSessions(matches, 'updated')
  }, [search, sessions])
  const workspaceDataAvailable = hasWorkspaceData(workspaces)
  const visibleSessions = showAll || search.trim() !== '' ? filteredSessions : filteredSessions.slice(0, 5)
  const remaining = Math.max(0, filteredSessions.length - visibleSessions.length)
  const rows = useMemo<SessionDrawerRow[]>(
    () => sessionRows(visibleSessions, workspaces, groupBy),
    [groupBy, visibleSessions, workspaces],
  )
  const visibleRows = useMemo(() => visibleWorkspaceRows(rows, collapsedWorkspaceKeys), [collapsedWorkspaceKeys, rows])

  const closeDrawer = (): void => navigation.closeDrawer()
  const openSession = (sessionId: string): void => {
    closeDrawer()
    selectSession(sessionId)
    if (sessionId !== currentSessionId) router.push({ pathname: '/session/[sessionId]', params: { sessionId } })
  }
  const openSettings = (): void => {
    closeDrawer()
    if (state.routes[state.index]?.name !== 'settings') router.push('/settings')
  }
  const toggleWorkspace = (workspaceKey: string): void =>
    setCollapsedWorkspaceKeys((current) => {
      const next = new Set(current)
      if (next.has(workspaceKey)) next.delete(workspaceKey)
      else next.add(workspaceKey)
      return next
    })

  return (
    <SafeAreaView edges={['top', 'left', 'bottom']} style={styles.drawerSafe}>
      <View style={styles.drawerFrame}>
        <DrawerContentScrollView
          {...props}
          contentContainerStyle={styles.drawerContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              tintColor={mobileTheme.colors.accent}
              refreshing={query.isFetching}
              onRefresh={() => void query.refetch()}
            />
          }
          style={styles.drawerScroll}
        >
          <View style={styles.brandRow}>
            <View style={styles.brand}>
              <NativeBrandMark size={24} />
              <Text numberOfLines={1} style={styles.brandWord}>
                deepseek
              </Text>
              <Text style={styles.brandTag}>HARNESS</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭会话列表"
              hitSlop={8}
              onPress={closeDrawer}
              style={({ pressed }) => [styles.topIcon, pressed && styles.pressed]}
            >
              <NativeIcon name="close" size={22} color={mobileTheme.colors.inkMuted} />
            </Pressable>
          </View>

          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="新会话（桌面端专属）"
            accessibilityState={{ disabled: true }}
            style={[styles.newSession, styles.disabledAction]}
          >
            <NativeIcon name="note-add" size={21} color={mobileTheme.colors.inkFaint} />
            <View style={styles.newSessionTextWrap}>
              <Text style={styles.newSessionTextDisabled}>新会话</Text>
              <Text style={styles.newSessionHint}>请在桌面端创建</Text>
            </View>
          </View>

          <View style={styles.workspaceHeader}>
            <Text style={styles.workspaceTitle}>{groupBy === 'workspace' ? '工作区' : '会话'}</Text>
            <View style={styles.workspaceActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="搜索会话"
                hitSlop={4}
                onPress={() => setSearchOpen(value => !value)}
                style={({ pressed }) => [styles.actionIcon, pressed && styles.pressed]}
              >
                <NativeIcon name="search" size={21} color={mobileTheme.colors.inkMuted} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={optionsOpen ? '收起分组和排序选项' : '展开分组和排序选项'}
                hitSlop={4}
                onPress={() => {
                  setOptionsOpen(value => !value)
                  setExpandedViewSection(undefined)
                }}
                style={({ pressed }) => [styles.actionIcon, pressed && styles.pressed]}
              >
                <NativeIcon name={optionsOpen ? 'expand-less' : 'tune'} size={21} color={mobileTheme.colors.inkMuted} />
              </Pressable>
              <View
                accessible
                accessibilityLabel="添加工作区（桌面端专属）"
                accessibilityState={{ disabled: true }}
                style={[styles.actionIcon, styles.disabledAction]}
              >
                <NativeIcon name="create-new-folder" size={21} color={mobileTheme.colors.inkFaint} />
              </View>
            </View>
          </View>

          {optionsOpen ? (
            <View accessible accessibilityLabel="会话视图设置" style={styles.compactOptions}>
              <NativeListRow
                title="分组方式"
                description={groupBy === 'workspace' ? '按工作区' : '单列表'}
                accessibilityRole="button"
                onPress={() => setExpandedViewSection(value => (value === 'group' ? undefined : 'group'))}
                right={
                  <NativeIcon
                    name={expandedViewSection === 'group' ? 'expand-less' : 'chevron-right'}
                    size={18}
                    color={mobileTheme.colors.inkMuted}
                  />
                }
              />
              {expandedViewSection === 'group' ? (
                <View style={styles.compactChoices}>
                  <OptionRow
                    label={workspaceDataAvailable ? '按工作区' : '按工作区（仅未分组）'}
                    selected={groupBy === 'workspace'}
                    onPress={() => {
                      setGroupBy('workspace')
                      setExpandedViewSection(undefined)
                    }}
                  />
                  <OptionRow
                    label="单列表"
                    selected={groupBy === 'flat'}
                    onPress={() => {
                      setGroupBy('flat')
                      setExpandedViewSection(undefined)
                    }}
                  />
                </View>
              ) : null}
              <View style={styles.optionDivider} />
              <NativeListRow
                title="排序方式"
                description="最近更新"
                accessibilityRole="button"
                onPress={() => setExpandedViewSection(value => (value === 'sort' ? undefined : 'sort'))}
                right={
                  <NativeIcon
                    name={expandedViewSection === 'sort' ? 'expand-less' : 'chevron-right'}
                    size={18}
                    color={mobileTheme.colors.inkMuted}
                  />
                }
              />
              {expandedViewSection === 'sort' ? (
                <View style={styles.compactChoices}>
                  <OptionRow label="最近更新" selected onPress={() => setExpandedViewSection(undefined)} />
                  <View
                    accessible
                    accessibilityLabel="手动排序（暂不支持）"
                    accessibilityState={{ disabled: true }}
                    style={styles.disabledOptionRow}
                  >
                    <Text style={styles.disabledOptionLabel}>手动排序（暂不支持）</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
          {searchOpen ? (
            <View style={styles.searchBox}>
              <NativeIcon name="search" size={18} color={mobileTheme.colors.inkMuted} />
              <TextInput
                accessibilityLabel="搜索会话"
                autoFocus
                onChangeText={setSearch}
                placeholder="搜索会话"
                placeholderTextColor={mobileTheme.colors.inkFaint}
                style={styles.searchInput}
                value={search}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="清除搜索"
                hitSlop={4}
                onPress={() => setSearch('')}
                style={styles.clearSearch}
              >
                <NativeIcon name="close" size={18} color={mobileTheme.colors.inkMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.listArea}>
            <View style={styles.list}>
              {rows.length === 0 ? (
                query.isFetching ? (
                  <ActivityIndicator color={mobileTheme.colors.accent} style={styles.emptyState} />
                ) : (
                  <Text style={styles.emptyState}>
                    {query.isError
                      ? '会话加载失败，请稍后重试。'
                      : search.trim() !== ''
                        ? '无匹配会话。'
                        : '暂无会话。'}
                  </Text>
                )
              ) : (
                visibleRows.map(item =>
                  item.kind === 'workspace' ? (
                    <WorkspaceItem
                      key={item.key}
                      workspaceKey={item.key}
                      label={item.label}
                      collapsed={collapsedWorkspaceKeys.has(item.key)}
                      onPress={() => toggleWorkspace(item.key)}
                    />
                  ) : (
                    <SessionItem
                      key={item.key}
                      session={item.session}
                      selected={item.session.sessionId === currentSessionId}
                      onPress={() => openSession(item.session.sessionId)}
                    />
                  ),
                )
              )}
              {remaining > 0 || showAll ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAll ? '收起会话' : `展开其余 ${remaining} 个会话`}
                  onPress={() => setShowAll(value => !value)}
                  style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                >
                  <Text style={styles.expandText}>{showAll ? '收起' : `展开其余 ${remaining} 个会话`}</Text>
                  <NativeIcon
                    name={showAll ? 'expand-less' : 'expand-more'}
                    size={18}
                    color={mobileTheme.colors.inkMuted}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        </DrawerContentScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="打开设置"
          onPress={openSettings}
          style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
        >
          <NativeIcon name="settings" size={21} color={mobileTheme.colors.ink} />
          <Text style={styles.settingsText}>设置</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function WorkspaceItem({
  workspaceKey,
  label,
  collapsed,
  onPress,
}: {
  workspaceKey: string
  label: string
  collapsed: boolean
  onPress: () => void
}): React.JSX.Element {
  const ungrouped = workspaceKey === 'workspace:ungrouped'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${collapsed ? '展开' : '收起'}${label}`}
      accessibilityState={{ expanded: !collapsed }}
      onPress={onPress}
      style={({ pressed }) => [styles.folder, pressed && styles.pressed]}
    >
      <NativeIcon name={collapsed ? 'chevron-right' : 'expand-more'} size={18} color={mobileTheme.colors.inkMuted} />
      <NativeIcon
        name={collapsed ? 'folder-close' : 'folder-open'}
        size={20}
        color={ungrouped ? mobileTheme.colors.inkMuted : mobileTheme.colors.accent}
      />
      <Text numberOfLines={1} style={styles.folderText}>
        {label}
      </Text>
    </Pressable>
  )
}

function SessionItem({
  session,
  selected,
  onPress,
}: {
  session: SessionSummary
  selected: boolean
  onPress: () => void
}): React.JSX.Element {
  const title = typeof session.title === 'string' && session.title.trim() ? session.title : '新会话'
  const time = sessionTimeLabel(session)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开会话 ${title}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: 1, bottom: 1 }}
      style={({ pressed }) => [styles.session, selected && styles.selected, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={styles.sessionTitle}>
        {title}
      </Text>
      <Text numberOfLines={1} style={styles.sessionTime}>
        {time}
      </Text>
    </Pressable>
  )
}

function OptionRow({
  label,
  selected,
  disabled = false,
  onPress,
}: {
  label: string
  selected: boolean
  disabled?: boolean
  onPress?: () => void
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, disabled && styles.disabledOptionRow, pressed && styles.pressed]}
    >
      <Text style={disabled ? styles.disabledOptionLabel : styles.optionLabel}>{label}</Text>
      {selected ? <NativeIcon name="check" size={17} color={mobileTheme.colors.accentText} /> : null}
    </Pressable>
  )
}

function currentSessionFromState(state: DrawerContentComponentProps['state']): string | undefined {
  return sessionIdFromRoute(state.routes[state.index])
}

function requireConnection(connection: ReturnType<typeof useConnectionStore.getState>['connection']) {
  if (!connection) throw new Error('请先连接桌面端。')
  return connection
}

const styles = StyleSheet.create({
  drawerFrame: { backgroundColor: mobileTheme.colors.drawerBackground, flex: 1, position: 'relative' },
  drawerSafe: { backgroundColor: mobileTheme.colors.drawerBackground, flex: 1 },
  drawerScroll: { backgroundColor: mobileTheme.colors.drawerBackground },
  drawerContent: { flexGrow: 1, paddingBottom: 64, paddingTop: mobileTheme.spacing.xs },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
    justifyContent: 'space-between',
    paddingLeft: 4,
    paddingVertical: 8,
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 6, minWidth: 0 },
  brandWord: { color: mobileTheme.colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: -1 },
  brandTag: {
    backgroundColor: mobileTheme.colors.ink,
    borderRadius: mobileTheme.radius.xs,
    color: mobileTheme.colors.textOnAccent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  topIcon: {
    alignItems: 'center',
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.iconButton,
  },
  newSession: {
    alignItems: 'center',
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.bubble,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: mobileTheme.touch.controlHeight,
    marginBottom: 8,
  },
  newSessionTextWrap: { alignItems: 'center', gap: 1 },
  newSessionTextDisabled: { color: mobileTheme.colors.inkMuted, fontSize: 15, fontWeight: '600' },
  newSessionHint: { color: mobileTheme.colors.inkFaint, fontSize: 10 },
  workspaceHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  workspaceTitle: { color: mobileTheme.colors.inkMuted, fontSize: 14, lineHeight: 20 },
  workspaceActions: { flexDirection: 'row', gap: 4 },
  actionIcon: {
    alignItems: 'center',
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.iconButton,
  },
  clearSearch: {
    alignItems: 'center',
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.iconButton,
  },
  disabledAction: { opacity: 0.45 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  searchInput: { color: mobileTheme.colors.ink, flex: 1, fontSize: 14, height: 36 },
  listArea: { flexGrow: 1 },
  list: { flexGrow: 1, paddingBottom: 52 },
  folder: {
    alignItems: 'center',
    borderRadius: mobileTheme.radius.card,
    flexDirection: 'row',
    gap: mobileTheme.spacing.xs,
    marginBottom: mobileTheme.spacing.xxs,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.xs,
  },
  folderText: { color: mobileTheme.colors.ink, fontSize: mobileTheme.typography.bodyLarge, fontWeight: '500' },
  session: {
    alignItems: 'center',
    borderRadius: mobileTheme.radius.card,
    flexDirection: 'row',
    gap: mobileTheme.spacing.sm,
    marginLeft: mobileTheme.spacing.md,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.md,
  },
  selected: { backgroundColor: mobileTheme.colors.surfaceActive },
  sessionTitle: { color: mobileTheme.colors.ink, flex: 1, fontSize: 14 },
  sessionTime: { color: mobileTheme.colors.inkMuted, fontSize: 11 },
  emptyState: { color: mobileTheme.colors.inkMuted, paddingHorizontal: 8, paddingVertical: 24, textAlign: 'center' },
  expandButton: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingHorizontal: 12, paddingVertical: 12 },
  expandText: { color: mobileTheme.colors.inkMuted, fontSize: 13 },
  optionsTitle: {
    color: mobileTheme.colors.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 9,
    paddingTop: 5,
    paddingBottom: 3,
  },
  compactOptions: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: mobileTheme.spacing.sm,
    overflow: 'hidden',
  },
  compactChoices: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    gap: mobileTheme.spacing.xxs,
    paddingVertical: mobileTheme.spacing.xs,
  },
  optionDivider: { backgroundColor: mobileTheme.colors.border, height: StyleSheet.hairlineWidth },
  inlineOptions: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: mobileTheme.spacing.sm,
    overflow: 'hidden',
    paddingVertical: mobileTheme.spacing.xs,
  },
  inlineOptionSection: { gap: mobileTheme.spacing.xxs, paddingVertical: mobileTheme.spacing.xxs },
  optionRow: {
    alignItems: 'center',
    borderRadius: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingHorizontal: 9,
  },
  optionLabel: { color: mobileTheme.colors.ink, fontSize: 13 },
  disabledOptionRow: {
    alignItems: 'center',
    borderRadius: 7,
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 9,
  },
  disabledOptionLabel: { color: mobileTheme.colors.inkFaint, fontSize: 13 },
  menuSeparator: { backgroundColor: mobileTheme.colors.border, height: StyleSheet.hairlineWidth, marginVertical: 6 },
  addWorkspace: {
    alignItems: 'center',
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    marginTop: 6,
    paddingHorizontal: 9,
    paddingTop: 10,
  },
  disabledWorkspaceText: { color: mobileTheme.colors.inkFaint, fontSize: 13, fontWeight: '600' },
  settings: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    flexDirection: 'row',
    gap: mobileTheme.spacing.sm,
    left: 0,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.md,
    position: 'absolute',
    right: 0,
  },
  settingsText: { color: mobileTheme.colors.ink, fontSize: 15 },
  pressed: { opacity: 0.62 },
})
