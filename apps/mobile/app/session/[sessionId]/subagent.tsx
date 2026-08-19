import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { NativeMarkdown } from '@/components/native-markdown'
import { NativeToolCard } from '@/components/native-tool-card'
import { WorkspaceComposer } from '@/components/workspace-composer'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useConnectionStore } from '@/state/connection'
import { mobileTheme } from '@/theme'
import { projectVisibleMessages, type SharedMessagePresentation } from '@deepseek-ai/dsh-client-ui-shared'

/** Renders one desktop-owned direct child without treating the child as an ordinary root session. */
export default function SubagentSessionScreen(): React.JSX.Element {
  const { sessionId, parentSessionId, mode } = useLocalSearchParams<{
    sessionId?: string | string[]
    parentSessionId?: string | string[]
    mode?: string | string[]
  }>()
  const childId = firstParam(sessionId)
  const parentId = firstParam(parentSessionId)
  const childMode = firstParam(mode) === 'continuable' ? 'continuable' : firstParam(mode) === 'one-shot' ? 'one-shot' : undefined
  const connection = useConnectionStore(state => state.connection)
  const client = useMemo(() => (connection ? new MobileApi(connection) : undefined), [connection])
  const queryClient = useQueryClient()
  const ready = client !== undefined && childId !== undefined && parentId !== undefined && childMode !== undefined
  const history = useQuery({
    queryKey: ['subagent-history', parentId, childId, childMode],
    enabled: ready,
    queryFn: () => {
      if (!client || !parentId || !childId || !childMode) throw new Error('子 Agent 地址无效。')
      return client.subagentHistory(parentId, childId, childMode)
    },
  })
  const send = useMutation({
    mutationFn: async (content: Parameters<MobileApi['sendSubagentMessage']>[2]) => {
      if (!client || !parentId || !childId) throw new Error('子 Agent 地址无效。')
      return client.sendSubagentMessage(parentId, childId, content)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['subagent-history', parentId, childId, childMode] }),
    onError: error => Alert.alert('消息发送失败', withErrorContext('子 Agent 未收到消息', error)),
  })
  const interrupt = useMutation({
    mutationFn: async () => {
      if (!client || !parentId || !childId) throw new Error('子 Agent 地址无效。')
      return client.interruptSubagent(parentId, childId)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['session-subagents', parentId] }),
    onError: error => Alert.alert('停止子 Agent 失败', withErrorContext('停止请求未发送', error)),
  })
  const messages = useMemo(() => projectVisibleMessages(history.data?.items ?? []), [history.data?.items])
  const title = childMode === 'continuable' ? '子 Agent' : '子 Agent（只读）'

  return (
    <WorkspaceShell
      title={title}
      showMenu={false}
      leftAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回会话"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <NativeIcon name="arrow-back" color={mobileTheme.colors.ink} size={20} />
        </Pressable>
      }
    >
      {!ready ? (
        <Unavailable text="缺少子 Agent 地址或桌面连接，请返回父会话后重试。" />
      ) : (
        <View style={styles.canvas}>
          <View style={styles.notice}>
            <NativeIcon name="smart-toy" size={16} color={mobileTheme.colors.accentText} />
            <Text style={styles.noticeText}>
              {childMode === 'continuable' ? '此会话通过父 Agent 的桌面权限继续执行。' : '一次性子 Agent 的历史可查看，但不能继续发送消息。'}
            </Text>
            {childMode === 'continuable' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="停止子 Agent"
                accessibilityState={{ busy: interrupt.isPending }}
                disabled={interrupt.isPending}
                onPress={() => interrupt.mutate()}
                style={({ pressed }) => [styles.stopAction, pressed && styles.pressed]}
              >
                <NativeIcon name="stop" size={15} color={mobileTheme.colors.danger} />
              </Pressable>
            ) : null}
          </View>
          {history.isError ? <ErrorNotice text={withErrorContext('子 Agent 历史加载失败', history.error)} onRetry={() => void history.refetch()} /> : null}
          <FlatList
            data={messages}
            keyExtractor={(item, index) => `subagent-message-${item.sourceSeq ?? index}`}
            renderItem={({ item }) => <MessageRow item={item} />}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{history.isPending ? '正在加载子 Agent 历史…' : '此子 Agent 暂无可见消息。'}</Text>}
          />
          {childMode === 'continuable' ? (
            <WorkspaceComposer
              disabled={!ready}
              placeholder="向子 Agent 发送消息…"
              onSend={content => send.mutateAsync(content).then(() => undefined)}
              sending={send.isPending}
            />
          ) : null}
        </View>
      )}
    </WorkspaceShell>
  )
}

function MessageRow({ item }: { item: SharedMessagePresentation }): React.JSX.Element {
  if (item.kind === 'user')
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}><Text selectable style={styles.userText}>{item.text}</Text></View>
      </View>
    )
  if (item.kind === 'tool') return <NativeToolCard presentation={item} />
  return <NativeMarkdown markdown={item.text} onCopyCode={async (code) => { await Clipboard.setStringAsync(code) }} />
}

function ErrorNotice({ text, onRetry }: { text: string; onRetry: () => void }): React.JSX.Element {
  return (
    <View style={styles.errorNotice}>
      <Text style={styles.error}>{text}</Text>
      <NativeActionButton label="重新加载" icon="refresh" variant="secondary" onPress={onRetry} />
    </View>
  )
}

function Unavailable({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.unavailable}>
      <NativeIcon name="link-off" size={28} color={mobileTheme.colors.inkFaint} />
      <Text style={styles.unavailableText}>{text}</Text>
      <NativeActionButton label="返回会话" icon="arrow-back" variant="secondary" onPress={() => router.back()} />
    </View>
  )
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value.find(item => item.trim()) : value
  const normalized = candidate?.trim()
  return normalized || undefined
}

function withErrorContext(prefix: string, error: unknown): string {
  return `${prefix}：${mobileErrorMessage(error, '请稍后重试。')}`
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  headerAction: { alignItems: 'center', height: mobileTheme.touch.iconButton, justifyContent: 'center', width: mobileTheme.touch.iconButton },
  notice: { alignItems: 'center', backgroundColor: mobileTheme.colors.accentSoft, flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  noticeText: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 12, lineHeight: 18 },
  stopAction: { alignItems: 'center', height: mobileTheme.touch.iconButton, justifyContent: 'center', width: mobileTheme.touch.iconButton },
  list: { gap: mobileTheme.spacing.lg, paddingHorizontal: mobileTheme.spacing.lg, paddingVertical: mobileTheme.spacing.lg },
  userRow: { alignItems: 'flex-end' },
  userBubble: { backgroundColor: mobileTheme.colors.userBubble, borderRadius: mobileTheme.radius.bubble, maxWidth: '82%', paddingHorizontal: 16, paddingVertical: 10 },
  userText: { color: mobileTheme.colors.ink, fontSize: 16, lineHeight: 24 },
  empty: { color: mobileTheme.colors.inkMuted, paddingVertical: 24, textAlign: 'center' },
  errorNotice: { gap: 6, padding: 12 },
  error: { color: mobileTheme.colors.danger },
  unavailable: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 28 },
  unavailableText: { color: mobileTheme.colors.inkMuted, fontSize: 14, textAlign: 'center' },
  pressed: { opacity: 0.62 },
})
