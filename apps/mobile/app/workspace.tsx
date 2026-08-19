import { useQuery } from '@tanstack/react-query'
import { router, useNavigation } from 'expo-router'
import { useEffect } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeIcon } from '@/components/native-icon'
import { selectedSessionTarget, sessionDisplayTitle } from '@/components/session-drawer-logic'
import { NativeBrandMark } from '@/components/native-brand-mark'
import { WorkspaceComposer } from '@/components/workspace-composer'
import { WorkspaceShell } from '@/components/workspace-shell'
import { workspaceKeyboardVerticalOffset } from '@/components/workspace-shell-logic'
import { useConnectionStore } from '@/state/connection'
import { useSessionSelectionStore } from '@/state/session-selection'
import { mobileTheme } from '@/theme'
import type { MobilePromptContent } from '@/types/mobile'

export default function WorkspaceScreen(): React.JSX.Element {
  const navigation = useNavigation<{ openDrawer: () => void }>()
  const insets = useSafeAreaInsets()
  const connection = useConnectionStore(state => state.connection)
  const selectedSessionId = useSessionSelectionStore(state => state.selectedSessionId)
  const selectSessionId = useSessionSelectionStore(state => state.selectSession)
  const clearSelection = useSessionSelectionStore(state => state.clearSelection)
  const sessions = useQuery({
    queryKey: ['session-list', connection?.gatewayUrl, connection?.deviceId],
    enabled: Boolean(connection),
    queryFn: () => new MobileApi(requireConnection(connection)).listSessions(),
  })
  const selectedSession = selectedSessionTarget(sessions.data?.items ?? [], selectedSessionId)
  useEffect(() => {
    if (!connection) clearSelection()
  }, [clearSelection, connection])
  const selectSession = (sessionId: string): void => {
    selectSessionId(sessionId)
    router.push({ pathname: '/session/[sessionId]', params: { sessionId } })
  }
  const send = async (content: MobilePromptContent): Promise<void> => {
    if (selectedSession === undefined || !connection) {
      Alert.alert('选择会话', '请先选择一个会话后再发送。')
      return
    }
    await new MobileApi(connection).sendMessage(selectedSession.sessionId, content)
    router.push({ pathname: '/session/[sessionId]', params: { sessionId: selectedSession.sessionId } })
  }

  return (
    <WorkspaceShell
      title="DeepSeek Harness"
      rightAction={<Status connected={Boolean(connection)} />}
      headerMeta={
        <View style={s.headerMeta}>
          <Text style={s.headerMetaLabel}>工作区</Text>
          <Text style={s.headerMetaHint}>{connection ? '已连接桌面端' : '尚未连接桌面端'}</Text>
        </View>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? workspaceKeyboardVerticalOffset(insets.top, true) : 0}
        style={s.canvas}
      >
        <View style={s.hero}>
          <View style={s.titleRow}>
            <NativeBrandMark size={30} />
            <Text style={s.title}>探索未至之境</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>预览版</Text>
            </View>
          </View>
          <View style={s.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selectedSession === undefined ? '选择会话' : `当前会话：${sessionDisplayTitle(selectedSession)}`
              }
              onPress={() => navigation.openDrawer()}
              style={({ pressed }) => [s.control, pressed && s.pressed]}
            >
              <NativeIcon name="chat-bubble-outline" size={16} color={mobileTheme.colors.inkMuted} />
              <Text numberOfLines={1} style={s.controlText}>
                {selectedSession === undefined ? '选择会话' : sessionDisplayTitle(selectedSession)}
              </Text>
              <NativeIcon name="expand-more" size={18} color={mobileTheme.colors.inkMuted} />
            </Pressable>
            <View
              accessible
              accessibilityLabel="标准模式（仅支持）"
              accessibilityState={{ disabled: true }}
              style={s.disabledControl}
            >
              <NativeIcon name="tune" size={16} color={mobileTheme.colors.inkMuted} />
              <Text style={s.controlText}>标准模式（仅支持）</Text>
            </View>
          </View>
          <Text style={s.detail}>{workspaceDetail(connection, sessions, selectedSession !== undefined)}</Text>
        </View>
        <WorkspaceComposer
          agentPreset={selectedSession?.agentPreset}
          onSend={send}
          sessionId={selectedSession?.sessionId}
          disabled={!connection || sessions.isFetching || sessions.isError || selectedSession === undefined}
        />
      </KeyboardAvoidingView>
    </WorkspaceShell>
  )
}

function Status({ connected }: { connected: boolean }): React.JSX.Element {
  return (
    <View style={s.status}>
      <View style={[s.dot, !connected && s.offline]} />
      <Text style={s.statusText}>{connected ? '已连接' : '未连接'}</Text>
    </View>
  )
}

function requireConnection(connection: ReturnType<typeof useConnectionStore.getState>['connection']) {
  if (!connection) throw new Error('请先连接桌面端。')
  return connection
}

function workspaceDetail(
  connection: ReturnType<typeof useConnectionStore.getState>['connection'],
  sessions: ReturnType<typeof useQuery<Awaited<ReturnType<MobileApi['listSessions']>>>>,
  hasSelectedSession: boolean,
): string {
  if (!connection) return '请先连接桌面端。'
  if (sessions.isPending) return '正在加载桌面工作区…'
  if (sessions.isError) return `桌面工作区加载失败：${errorMessage(sessions.error)}`
  const count = sessions.data?.items.length ?? 0
  if (count === 0) return '桌面端暂无会话，请在桌面端创建会话。'
  return hasSelectedSession ? `已连接桌面端 · ${count} 个会话` : `已连接桌面端 · ${count} 个会话，请先选择会话。`
}

function errorMessage(error: unknown): string {
  return mobileErrorMessage(error, '请稍后重试。')
}

const s = StyleSheet.create({
  canvas: { flex: 1, justifyContent: 'space-between' },
  hero: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: mobileTheme.spacing.lg,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: mobileTheme.spacing.sm,
    justifyContent: 'center',
  },
  title: { color: mobileTheme.colors.ink, fontSize: 26, fontWeight: '500' },
  badge: {
    backgroundColor: mobileTheme.colors.accentSoft,
    borderColor: '#c9d9fb',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: mobileTheme.colors.accentText, fontSize: 12, fontWeight: '600' },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: mobileTheme.spacing.sm,
    justifyContent: 'center',
    marginTop: mobileTheme.spacing.lg,
  },
  control: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: mobileTheme.radius.pill,
    borderWidth: 0,
    flexDirection: 'row',
    gap: 7,
    height: 32,
    paddingHorizontal: 11,
  },
  disabledControl: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    height: 32,
    opacity: 0.72,
    paddingHorizontal: 11,
  },
  controlText: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '500', maxWidth: 190 },
  detail: {
    color: mobileTheme.colors.inkMuted,
    fontSize: 12,
    marginTop: mobileTheme.spacing.md,
    textAlign: 'center',
  },
  status: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  dot: { backgroundColor: mobileTheme.colors.success, borderRadius: 4, height: 7, width: 7 },
  offline: { backgroundColor: mobileTheme.colors.inkFaint },
  statusText: { color: mobileTheme.colors.inkMuted, fontSize: 11 },
  headerMeta: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  headerMetaLabel: { color: mobileTheme.colors.ink, fontSize: 12, fontWeight: '600' },
  headerMetaHint: { color: mobileTheme.colors.inkMuted, fontSize: 11 },
  pressed: { opacity: 0.62 },
})
