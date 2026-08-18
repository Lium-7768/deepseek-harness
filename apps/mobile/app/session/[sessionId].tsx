import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { NativeActionButton } from '@/components/native-action-button'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeMarkdown } from '@/components/native-markdown'
import { NativeToolCard } from '@/components/native-tool-card'
import { NativeIcon } from '@/components/native-icon'
import { WorkspaceComposer } from '@/components/workspace-composer'
import { WorkspaceShell } from '@/components/workspace-shell'
import { workspaceKeyboardVerticalOffset } from '@/components/workspace-shell-logic'
import { ContextRows, TrajectoryPanel, WorkbenchTabs, type WorkbenchTab } from '@/components/session-workbench'
import { readPermissionSelect } from '@/components/session-composer-logic'
import { messageActionLayout, type MessageActionAlignment } from '@/components/session-message-logic'
import { sessionStatisticsLine } from '@/components/session-stats-logic'
import { useConnectionStore } from '@/state/connection'
import { useRouteSessionSelection } from '@/state/session-selection'
import { mobileTheme } from '@/theme'
import {
  projectVisibleMessages,
  type SharedEventItem,
  type SharedMessagePresentation,
} from '@deepseek-ai/dsh-client-ui-shared'

export default function SessionScreen(): React.JSX.Element {
  const { sessionId: rawSessionId, draft } = useLocalSearchParams<{
    sessionId?: string | string[]
    draft?: string | string[]
  }>()
  const sessionId = firstParam(rawSessionId)
  const connection = useConnectionStore(state => state.connection)
  const insets = useSafeAreaInsets()
  const client = useMemo(() => (connection ? new MobileApi(connection) : undefined), [connection])
  const queryClient = useQueryClient()
  const listRef = useRef<FlatList<SharedMessagePresentation>>(null)
  const submittedDraft = useRef<string | undefined>(undefined)
  const [since, setSince] = useState(0)
  const [liveItems, setLiveItems] = useState<SharedEventItem[]>([])
  const [tab, setTab] = useState<WorkbenchTab>('chat')
  const ready = Boolean(client && sessionId)
  const history = useQuery({
    queryKey: ['session-history', sessionId],
    enabled: ready,
    queryFn: () => {
      if (!client || !sessionId) throw new Error('请先连接桌面端并从会话列表打开会话。')
      return client.sessionHistory(sessionId)
    },
  })
  const events = useQuery({
    queryKey: ['session-events', sessionId, since],
    enabled: ready,
    queryFn: () => {
      if (!client || !sessionId) throw new Error('请先连接桌面端并从会话列表打开会话。')
      return client.sessionEvents(sessionId, since)
    },
    refetchInterval: 2500,
  })
  const interactions = useQuery({
    queryKey: ['session-interactions', sessionId],
    enabled: ready,
    queryFn: () => {
      if (!client || !sessionId) throw new Error('请先连接桌面端并从会话列表打开会话。')
      return client.pendingInteractions(sessionId)
    },
    refetchInterval: 2500,
  })
  const sessionList = useQuery({
    queryKey: ['session-list-for-session', connection?.gatewayUrl, connection?.deviceId],
    enabled: Boolean(connection),
    queryFn: () => {
      if (!client) throw new Error('请先连接桌面端。')
      return client.listSessions()
    },
  })
  const models = useQuery({
    queryKey: ['session-models', connection?.gatewayUrl, connection?.deviceId, sessionId],
    enabled: ready,
    queryFn: () => {
      if (!client || !sessionId) throw new Error('请先连接桌面端并从会话列表打开会话。')
      return client.sessionModels(sessionId)
    },
  })
  const send = useMutation({
    mutationFn: (text: string) => {
      if (!client || !sessionId) throw new Error('请先连接桌面端并从会话列表打开会话。')
      return client.sendMessage(sessionId, text)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] }),
    onError: error => Alert.alert('消息发送失败', withErrorContext('消息未发送，请稍后重试', error)),
  })
  const cancel = useMutation({
    mutationFn: () => {
      if (!client || !sessionId) throw new Error('请先连接桌面端并从会话列表打开会话。')
      return client.cancelSession(sessionId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session-events', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] })
    },
    onError: error => Alert.alert('停止任务失败', withErrorContext('任务未停止，请稍后重试', error)),
  })
  const sendMessage = useRef(send.mutate)
  sendMessage.current = send.mutate

  useRouteSessionSelection(sessionId)

  useEffect(() => {
    submittedDraft.current = undefined
    setSince(0)
    setLiveItems([])
  }, [sessionId])

  useEffect(() => {
    const historyMaxSeq = Math.max(
      ...(history.data?.items ?? []).flatMap(item => (typeof item.seq === 'number' ? [item.seq] : [])),
      0,
    )
    if (historyMaxSeq > 0) setSince(current => Math.max(current, historyMaxSeq))
  }, [history.data])

  useEffect(() => {
    const value = firstParam(draft)
    if (!client || !sessionId || !value || submittedDraft.current === value) return
    submittedDraft.current = value
    sendMessage.current(value)
  }, [client, draft, sessionId])

  useEffect(() => {
    const incoming = events.data?.items ?? []
    if (!incoming.length) return
    setLiveItems(current => mergeEventItems(current, incoming))
    const nextCursor = Math.max(...incoming.flatMap(item => (typeof item.seq === 'number' ? [item.seq] : [])))
    if (Number.isFinite(nextCursor)) setSince(current => Math.max(current, nextCursor))
  }, [events.data])

  const sourceItems = useMemo(
    () => mergeEventItems(history.data?.items ?? [], liveItems),
    [history.data?.items, liveItems],
  )
  const messages = useMemo(() => projectVisibleMessages(sourceItems), [sourceItems])
  const actions = interactions.data?.items.length ?? 0
  const status = events.data?.status ?? '正在连接'
  const displayStatus = connection ? status : 'disconnected'

  return (
    <WorkspaceShell title="会话" rightAction={<ConnectionStatus status={displayStatus} />}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? workspaceKeyboardVerticalOffset(insets.top, false) : 0}
        style={s.canvas}
      >
        {!connection ? (
          <UnavailableState message="请先连接桌面端。" action="去连接" onPress={() => router.replace('/connect')} />
        ) : !sessionId ? (
          <UnavailableState
            message="缺少会话标识，请从会话列表打开。"
            action="返回工作区"
            onPress={() => router.replace('/workspace')}
          />
        ) : (
          <>
            <WorkbenchTabs tab={tab} onChange={setTab} />
            {actions > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="查看待处理操作"
                onPress={() => router.push({ pathname: '/session/[sessionId]/interactions', params: { sessionId } })}
                style={({ pressed }) => [s.action, pressed && s.pressed]}
              >
                <NativeIcon name="warning-amber" size={18} color={mobileTheme.colors.warning} />
                <Text style={s.actionText}>{actions} 项操作需要处理</Text>
                <NativeIcon name="chevron-right" size={18} color={mobileTheme.colors.inkMuted} />
              </Pressable>
            ) : null}
            {history.isError ? (
              <ErrorNotice
                text={withErrorContext('会话历史加载失败', history.error)}
                onRetry={() => void history.refetch()}
              />
            ) : null}
            {events.isError ? (
              <ErrorNotice
                text={withErrorContext('实时事件加载失败，正在重试', events.error)}
                onRetry={() => void events.refetch()}
              />
            ) : null}
            {interactions.isError ? (
              <ErrorNotice
                text={withErrorContext('待处理操作加载失败，正在重试', interactions.error)}
                onRetry={() => void interactions.refetch()}
              />
            ) : null}
            {tab === 'trajectory' ? <TrajectoryPanel items={sourceItems} /> : null}
            {tab === 'chat' ? <ContextRows items={sourceItems} /> : null}
            <FlatList
              style={tab === 'chat' ? s.listView : s.hidden}
              ref={listRef}
              data={messages}
              keyExtractor={(item, index) => `message-${item.sourceSeq ?? index}`}
              renderItem={({ item }) => <MessageRow item={item} />}
              contentContainerStyle={s.list}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                history.isPending ? (
                  <Text style={s.empty}>正在加载会话消息…</Text>
                ) : (
                  <Text style={s.empty}>此会话暂无可见消息。</Text>
                )
              }
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
            {tab === 'chat' ? (
              <LocalizedSessionStats items={sourceItems} projectionValues={history.data?.projections?.values} />
            ) : null}
            <WorkspaceComposer
              agentPreset={sessionList.data?.items.find(item => item.sessionId === sessionId)?.agentPreset}
              model={models.data?.current}
              placeholder="在这里输入消息…"
              onSend={text => send.mutateAsync(text).then(() => undefined)}
              onCancel={() => cancel.mutate()}
              permissions={readPermissionSelect(history.data?.projections?.values.permissions)}
              sessionId={sessionId}
              cancelling={cancel.isPending}
              disabled={!ready}
              sending={send.isPending}
              running={status === 'running'}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </WorkspaceShell>
  )
}

function MessageRow({ item }: { item: SharedMessagePresentation }): React.JSX.Element {
  if (item.kind === 'user')
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}>
          <Text selectable style={s.userText}>
            {item.text}
          </Text>
        </View>
        <MessageActions alignment="user" text={item.text} />
      </View>
    )
  if (item.kind === 'tool')
    return (
      <View style={s.toolRow}>
        <NativeToolCard presentation={item} />
      </View>
    )
  return (
    <View style={s.assistantRow}>
      <NativeMarkdown
        markdown={item.text}
        onCopyCode={async (code) => {
          await Clipboard.setStringAsync(code)
        }}
      />
      <MessageActions alignment="assistant" text={item.text} />
    </View>
  )
}

function MessageActions({ alignment, text }: { alignment: MessageActionAlignment; text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const copy = async (): Promise<void> => {
    if (copied) return
    try {
      await Clipboard.setStringAsync(text)
      setCopied(true)
      setCopyFailed(false)
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, 1200)
    } catch {
      setCopyFailed(true)
      void AccessibilityInfo.announceForAccessibility('复制失败，请重试。')
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? '消息已复制' : copyFailed ? '复制失败，请重试' : '复制消息'}
      accessibilityState={{ selected: copied }}
      onPress={() => void copy()}
      hitSlop={8}
      style={({ pressed }) => [messageActionLayout(alignment), pressed && s.pressed]}
    >
      <NativeIcon
        name={copied ? 'check' : 'content-copy'}
        size={16}
        color={
          copied ? mobileTheme.colors.success : copyFailed ? mobileTheme.colors.danger : mobileTheme.colors.inkMuted
        }
      />
    </Pressable>
  )
}

function ErrorNotice({ text, onRetry }: { text: string; onRetry: () => void }): React.JSX.Element {
  return (
    <View style={s.errorNotice}>
      <Text style={s.error}>{text}</Text>
      <NativeActionButton label="重新加载" icon="refresh" variant="secondary" onPress={onRetry} />
    </View>
  )
}

function UnavailableState({
  message,
  action,
  onPress,
}: {
  message: string
  action: string
  onPress: () => void
}): React.JSX.Element {
  return (
    <View style={s.unavailable}>
      <NativeIcon name="link-off" size={28} color={mobileTheme.colors.inkFaint} />
      <Text style={s.unavailableText}>{message}</Text>
      <NativeActionButton label={action} icon="arrow-forward" onPress={onPress} style={s.unavailableAction} />
    </View>
  )
}

function ConnectionStatus({ status }: { status: string }): React.JSX.Element {
  const disconnected = status === 'disconnected'
  const label = disconnected
    ? '未连接'
    : status === 'idle'
      ? '空闲'
      : status === 'running'
        ? '处理中'
        : status === 'waiting'
          ? '等待确认'
          : '正在连接'
  return (
    <View style={s.status}>
      <View style={[s.statusDot, disconnected && s.statusOffline]} />
      <Text style={s.statusText}>{label}</Text>
    </View>
  )
}

function LocalizedSessionStats({
  items,
  projectionValues,
}: {
  items: SharedEventItem[]
  projectionValues: Record<string, unknown> | undefined
}): React.JSX.Element | null {
  const line = sessionStatisticsLine(projectionValues, items)
  return line === undefined ? null : (
    <View style={s.stats}>
      <Text numberOfLines={1} style={s.statsText}>
        {line}
      </Text>
    </View>
  )
}

function mergeEventItems(...sources: ReadonlyArray<ReadonlyArray<SharedEventItem>>): SharedEventItem[] {
  const items = new Map<string, SharedEventItem>()
  for (const source of sources) {
    for (const item of source) {
      const key = typeof item.seq === 'number' ? `seq:${item.seq}` : `event:${JSON.stringify(item.event)}`
      items.set(key, item)
    }
  }
  return [...items.values()].sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))
}

function withErrorContext(prefix: string, error: unknown): string {
  const detail = mobileErrorMessage(error, '请稍后重试。')
  return `${prefix}：${detail}`
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value.find(item => item.trim()) : value
  const normalized = candidate?.trim()
  return normalized || undefined
}

const s = StyleSheet.create({
  canvas: { flex: 1 },
  hidden: { display: 'none' },
  action: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.warningSoft,
    borderBottomColor: '#efd9a5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionText: { color: mobileTheme.colors.warning, flex: 1, fontSize: 13, fontWeight: '600' },
  error: { color: mobileTheme.colors.danger, padding: 12 },
  errorNotice: { gap: 6, paddingHorizontal: 12 },
  unavailable: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 28 },
  unavailableText: { color: mobileTheme.colors.inkMuted, fontSize: 14, textAlign: 'center' },
  unavailableAction: { minWidth: 132 },
  listView: { flex: 1 },
  list: {
    gap: mobileTheme.spacing.lg,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: mobileTheme.spacing.lg,
  },
  empty: { color: mobileTheme.colors.inkMuted, paddingVertical: 24, textAlign: 'center' },
  assistantRow: { gap: mobileTheme.spacing.lg, maxWidth: '100%' },
  userRow: { alignItems: 'flex-end', gap: mobileTheme.spacing.xs, maxWidth: '100%' },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: mobileTheme.colors.userBubble,
    borderRadius: mobileTheme.radius.bubble,
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userText: { color: mobileTheme.colors.ink, fontSize: 16, lineHeight: 24 },
  toolRow: { maxWidth: '100%' },
  stats: { paddingHorizontal: 14, paddingVertical: 4 },
  statsText: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 20, textAlign: 'center' },
  status: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  statusDot: { backgroundColor: mobileTheme.colors.success, borderRadius: 4, height: 7, width: 7 },
  statusOffline: { backgroundColor: mobileTheme.colors.inkFaint },
  statusText: { color: mobileTheme.colors.inkMuted, fontSize: 11 },
  headerMeta: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  headerMetaLabel: { color: mobileTheme.colors.ink, fontSize: 12, fontWeight: '600' },
  headerMetaHint: {
    color: mobileTheme.colors.inkMuted,
    flexShrink: 1,
    fontSize: 11,
    marginLeft: 12,
    textAlign: 'right',
  },
  pressed: { opacity: 0.62 },
})
