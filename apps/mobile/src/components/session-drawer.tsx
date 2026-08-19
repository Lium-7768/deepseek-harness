import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MobileApi } from '@/api/mobile-api'
import { NativeBrandMark } from '@/components/native-brand-mark'
import { NativeIcon } from '@/components/native-icon'
import { NativeListRow } from '@/components/native-list'
import {
  hasWorkspaceData,
  sessionDisplayTitle,
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
  const debouncedSearch = useDebouncedText(search.trim(), 250)
  const [expandedViewSection, setExpandedViewSection] = useState<'group' | 'sort' | undefined>()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<'workspace' | 'flat'>('workspace')
  const [collapsedWorkspaceKeys, setCollapsedWorkspaceKeys] = useState<Set<string>>(() => new Set())
  const [expandedWorkspaceSessionKeys, setExpandedWorkspaceSessionKeys] = useState<Set<string>>(() => new Set())
  const [expandedSessionId, setExpandedSessionId] = useState<string | undefined>()
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | undefined>()
  const connection = useConnectionStore(value => value.connection)
  const selectSession = useSessionSelectionStore(value => value.selectSession)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['session-list', connection?.gatewayUrl, connection?.deviceId],
    enabled: Boolean(connection),
    queryFn: () => new MobileApi(requireConnection(connection)).listSessions(),
  })
  const contentSearch = useQuery({
    queryKey: ['session-search', connection?.gatewayUrl, connection?.deviceId, debouncedSearch],
    enabled: Boolean(connection) && debouncedSearch.length > 0,
    queryFn: () => new MobileApi(requireConnection(connection)).searchSessions(debouncedSearch),
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
  const searchActive = search.trim().length > 0
  const sessionById = useMemo(() => new Map(sessions.map(item => [item.sessionId, item])), [sessions])
  const searchedSessions = useMemo(
    () =>
      (contentSearch.data?.items ?? []).flatMap((hit) => {
        const session = sessionById.get(hit.sessionId)
        return session === undefined ? [] : [{ ...session, searchSnippet: hit.snippet }]
      }),
    [contentSearch.data?.items, sessionById],
  )
  const filteredSessions = useMemo(
    () => sortSessions(searchActive ? searchedSessions : sessions, 'updated'),
    [searchActive, searchedSessions, sessions],
  )
  const workspaceDataAvailable = hasWorkspaceData(workspaces)
  const rows = useMemo<Exclude<SessionDrawerRow, { kind: 'overflow' }>[]>(
    () => sessionRows(filteredSessions, workspaces, searchActive ? 'flat' : groupBy, currentSessionId),
    [currentSessionId, groupBy, searchActive, filteredSessions, workspaces],
  )
  const visibleRows = useMemo(
    () => visibleWorkspaceRows(rows, collapsedWorkspaceKeys, expandedWorkspaceSessionKeys),
    [collapsedWorkspaceKeys, expandedWorkspaceSessionKeys, rows],
  )

  const closeDrawer = (): void => navigation.closeDrawer()
  const openSession = (sessionId: string): void => {
    closeDrawer()
    if (connection !== undefined) void selectSession(connection, sessionId)
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
  const toggleWorkspaceSessions = (workspaceKey: string): void =>
    setExpandedWorkspaceSessionKeys((current) => {
      const next = new Set(current)
      if (next.has(workspaceKey)) next.delete(workspaceKey)
      else next.add(workspaceKey)
      return next
    })
  const refreshSessions = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['session-list', connection?.gatewayUrl, connection?.deviceId] }),
    ])
  }
  const createSession = async (): Promise<void> => {
    try {
      const created = await new MobileApi(requireConnection(connection)).createSession()
      await refreshSessions()
      openSession(created.sessionId)
    } catch (error) {
      Alert.alert('新建会话失败', error instanceof Error ? error.message : '请稍后重试。')
    }
  }
  const forkSession = async (sessionId: string): Promise<void> => {
    try {
      const created = await new MobileApi(requireConnection(connection)).forkSession(sessionId)
      await refreshSessions()
      setExpandedSessionId(undefined)
      openSession(created.sessionId)
    } catch (error) {
      Alert.alert('分叉会话失败', error instanceof Error ? error.message : '请稍后重试。')
    }
  }
  const archiveSession = async (sessionId: string): Promise<void> => {
    try {
      await new MobileApi(requireConnection(connection)).archiveSession(sessionId)
      await refreshSessions()
      setExpandedSessionId(undefined)
      if (sessionId === currentSessionId) router.replace('/workspace')
    } catch (error) {
      Alert.alert('归档会话失败', error instanceof Error ? error.message : '请稍后重试。')
    }
  }
  const deleteWorkspace = async (workspaceId: string): Promise<void> => {
    try {
      await new MobileApi(requireConnection(connection)).deleteWorkspace(workspaceId)
      await refreshSessions()
      setExpandedWorkspaceId(undefined)
    } catch (error) {
      Alert.alert('移除工作区失败', error instanceof Error ? error.message : '请稍后重试。')
    }
  }
  const confirmDeleteWorkspace = (workspaceId: string, title: string): void => {
    Alert.alert('移除工作区', `“${title}”将不再显示为分组；桌面文件夹和所有会话记录不会被删除。`, [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => void deleteWorkspace(workspaceId) },
    ])
  }
  const confirmArchive = (session: SessionSummary): void => {
    const title = typeof session.title === 'string' && session.title.trim() ? session.title : '新会话'
    Alert.alert('归档会话', `“${title}”将从桌面和手机的活动会话列表中移除。`, [
      { text: '取消', style: 'cancel' },
      { text: '归档', style: 'destructive', onPress: () => void archiveSession(session.sessionId) },
    ])
  }

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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新会话"
            disabled={!connection}
            onPress={() => void createSession()}
            style={({ pressed }) => [styles.newSession, !connection && styles.disabledAction, pressed && styles.pressed]}
          >
            <NativeIcon name="note-add" size={21} color={connection ? mobileTheme.colors.accent : mobileTheme.colors.inkFaint} />
            <View style={styles.newSessionTextWrap}>
              <Text style={connection ? styles.newSessionText : styles.newSessionTextDisabled}>新会话</Text>
              <Text style={styles.newSessionHint}>{connection ? '在当前桌面端创建' : '请先连接桌面端'}</Text>
            </View>
          </Pressable>

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
                placeholder="搜索所有会话内容"
                placeholderTextColor={mobileTheme.colors.inkFaint}
                maxLength={500}
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
                      : searchActive && contentSearch.isPending
                        ? '正在搜索会话内容…'
                        : searchActive && contentSearch.isError
                          ? '搜索会话内容失败，请稍后重试。'
                          : searchActive
                            ? '未找到匹配内容。'
                            : '暂无会话。'}
                  </Text>
                )
              ) : (
                visibleRows.map(item =>
                  item.kind === 'workspace' ? (
                    <View key={item.key}>
                      <WorkspaceItem
                        workspaceKey={item.key}
                        label={item.label}
                        collapsed={collapsedWorkspaceKeys.has(item.key)}
                        onPress={() => toggleWorkspace(item.key)}
                        onLongPress={
                          item.workspace === undefined
                            ? undefined
                            : () =>
                              setExpandedWorkspaceId(current =>
                                current === item.workspace?.workspaceId ? undefined : item.workspace?.workspaceId,
                              )
                        }
                      />
                      {item.workspace !== undefined && expandedWorkspaceId === item.workspace.workspaceId ? (
                        <View accessible accessibilityLabel="工作区操作" style={styles.sessionActions}>
                          <NativeListRow
                            title="重命名工作区"
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({
                                pathname: '/workspace/[workspaceId]/rename',
                                params: { workspaceId: item.workspace?.workspaceId ?? '', title: item.workspace?.title ?? item.label },
                              })
                            }
                            right={<NativeIcon name="edit" size={18} color={mobileTheme.colors.inkMuted} />}
                          />
                          <NativeListRow
                            title="移除工作区"
                            description="保留桌面文件夹和会话记录"
                            accessibilityRole="button"
                            onPress={() => confirmDeleteWorkspace(item.workspace?.workspaceId ?? '', item.workspace?.title ?? item.label)}
                            right={<NativeIcon name="folder-close" size={18} color={mobileTheme.colors.danger} />}
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : item.kind === 'overflow' ? (
                    <Pressable
                      key={item.key}
                      accessibilityRole="button"
                      accessibilityLabel={item.expanded ? '收起会话' : `展开其余 ${item.hiddenCount} 个会话`}
                      accessibilityState={{ expanded: item.expanded }}
                      onPress={() => toggleWorkspaceSessions(item.workspaceKey)}
                      style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.expandText}>{item.expanded ? '收起' : `展开其余 ${item.hiddenCount} 个会话`}</Text>
                      <NativeIcon
                        name={item.expanded ? 'expand-less' : 'expand-more'}
                        size={18}
                        color={mobileTheme.colors.inkMuted}
                      />
                    </Pressable>
                  ) : (
                    <View key={item.key}>
                      <SessionItem
                        session={item.session}
                        selected={item.session.sessionId === currentSessionId}
                        onPress={() => openSession(item.session.sessionId)}
                        onLongPress={() =>
                          setExpandedSessionId(current =>
                            current === item.session.sessionId ? undefined : item.session.sessionId,
                          )
                        }
                      />
                      {expandedSessionId === item.session.sessionId ? (
                        <View accessible accessibilityLabel="会话操作" style={styles.sessionActions}>
                          <NativeListRow
                            title="重命名"
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({ pathname: '/session/[sessionId]/rename', params: { sessionId: item.session.sessionId } })
                            }
                            right={<NativeIcon name="edit" size={18} color={mobileTheme.colors.inkMuted} />}
                          />
                          <NativeListRow
                            title="分叉会话"
                            accessibilityRole="button"
                            onPress={() => void forkSession(item.session.sessionId)}
                            right={<NativeIcon name="route" size={18} color={mobileTheme.colors.inkMuted} />}
                          />
                          <NativeListRow
                            title="归档会话"
                            accessibilityRole="button"
                            onPress={() => confirmArchive(item.session)}
                            right={<NativeIcon name="folder-close" size={18} color={mobileTheme.colors.danger} />}
                          />
                        </View>
                      ) : null}
                    </View>
                  ),
                )
              )}
              {searchActive && contentSearch.data?.hasMore ? <Text style={styles.searchHint}>结果较多，请使用更具体的关键词。</Text> : null}
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
  onLongPress,
}: {
  workspaceKey: string
  label: string
  collapsed: boolean
  onPress: () => void
  onLongPress?: () => void
}): React.JSX.Element {
  const ungrouped = workspaceKey === 'workspace:ungrouped'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${collapsed ? '展开' : '收起'}${label}`}
      accessibilityState={{ expanded: !collapsed }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
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
  onLongPress,
}: {
  session: SessionSummary
  selected: boolean
  onPress: () => void
  onLongPress: () => void
}): React.JSX.Element {
  const title = sessionDisplayTitle(session)
  const time = sessionTimeLabel(session)
  const snippet = typeof session.searchSnippet === 'string' ? session.searchSnippet : undefined
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`打开会话 ${title}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      hitSlop={{ top: 1, bottom: 1 }}
      style={({ pressed }) => [styles.session, selected && styles.selected, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={styles.sessionTitle}>
        {title}
      </Text>
      <Text numberOfLines={snippet === undefined ? 1 : 2} style={styles.sessionTime}>
        {snippet ?? time}
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

function useDebouncedText(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, value])
  return debounced
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
  newSessionText: { color: mobileTheme.colors.ink, fontSize: 15, fontWeight: '600' },
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
  sessionActions: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: mobileTheme.spacing.xs,
    marginHorizontal: mobileTheme.spacing.sm,
    overflow: 'hidden',
  },
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
  searchHint: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, paddingVertical: 8 },
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
