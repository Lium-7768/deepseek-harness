import { useQuery } from '@tanstack/react-query'
import { router, useNavigation } from 'expo-router'
import { useEffect, useRef } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeIcon } from '@/components/native-icon'
import { agentPresetLabel } from '@/components/session-composer-logic'
import { selectedSessionTarget, sessionDisplayTitle, sessionTimeLabel, workspaceForSession, workspaceLabel } from '@/components/session-drawer-logic'
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
  const restoreSelection = useSessionSelectionStore(state => state.restoreSelection)
  const restoredConnectionKey = useRef<string | undefined>(undefined)
  const sessions = useQuery({
    queryKey: ['session-list', connection?.gatewayUrl, connection?.deviceId],
    enabled: Boolean(connection),
    queryFn: () => new MobileApi(requireConnection(connection)).listSessions(),
  })
  const selectedSession = selectedSessionTarget(sessions.data?.items ?? [], selectedSessionId)
  const selectedWorkspace = workspaceForSession(sessions.data?.workspaces ?? [], selectedSession?.sessionId)
  const workspaceTitle = selectedWorkspace === undefined ? '工作区' : workspaceLabel(selectedWorkspace)
  useEffect(() => {
    if (connection === undefined) {
      restoredConnectionKey.current = undefined
      void clearSelection()
    }
  }, [clearSelection, connection])
  useEffect(() => {
    if (connection === undefined || sessions.data === undefined) return
    const connectionKey = `${connection.gatewayUrl}:${connection.deviceId}`
    if (restoredConnectionKey.current === connectionKey) return
    restoredConnectionKey.current = connectionKey
    void restoreSelection(
      connection,
      sessions.data.items.map(item => item.sessionId),
    )
  }, [connection, restoreSelection, sessions.data])
  useEffect(() => {
    if (connection !== undefined && sessions.data !== undefined && selectedSessionId !== undefined && selectedSession === undefined) {
      void clearSelection()
    }
  }, [clearSelection, connection, selectedSession, selectedSessionId, sessions.data])
  const selectSession = (sessionId: string): void => {
    if (connection === undefined) return
    void selectSessionId(connection, sessionId)
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
      showBrand={false}
      title={workspaceTitle}
      titleAccessibilityLabel={`打开工作区和会话列表：${workspaceTitle}`}
      titleAccessory={<NativeIcon name="chevron-down" size={17} color={mobileTheme.colors.inkMuted} />}
      titleLeading={<NativeIcon name="folder" size={21} color={mobileTheme.colors.ink} />}
      onTitlePress={() => navigation.openDrawer()}
      rightAction={
        <ModeTrigger
          agentPreset={selectedSession?.agentPreset}
          compact
          disabled={!connection}
          sessionId={selectedSession?.sessionId}
        />
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? workspaceKeyboardVerticalOffset(insets.top, true) : 0}
        style={s.canvas}
      >
        <View style={s.summary}>
          <Text style={s.summaryLabel}>{selectedSession === undefined ? '选择桌面会话' : '当前会话'}</Text>
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
            <ModeTrigger agentPreset={selectedSession?.agentPreset} disabled={!connection} sessionId={selectedSession?.sessionId} />
          </View>
          <Text style={s.detail}>
            {workspaceDetail(connection, sessions, selectedSession === undefined ? undefined : sessionTimeLabel(selectedSession))}
          </Text>
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

function ModeTrigger({
  agentPreset,
  compact = false,
  disabled,
  sessionId,
}: {
  agentPreset: string | undefined
  compact?: boolean
  disabled: boolean
  sessionId: string | undefined
}): React.JSX.Element {
  const label = agentPresetLabel(agentPreset)
  const openMode = (): void => {
    if (disabled) return
    if (sessionId !== undefined) {
      router.push({ pathname: '/session/[sessionId]/mode', params: { sessionId } })
      return
    }
    router.push('/settings?section=general')
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sessionId === undefined ? `设置新会话默认模式：${label}` : `选择智能体模式：${label}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={compact ? 5 : { top: 8, bottom: 8 }}
      onPress={openMode}
      style={({ pressed }) => [compact ? s.headerMode : s.modeControl, disabled && s.disabledControl, pressed && s.pressed]}
    >
      <NativeIcon name="agent-preset" size={compact ? 17 : 16} color={mobileTheme.colors.inkMuted} />
      <Text numberOfLines={1} style={compact ? s.headerModeText : s.controlText}>
        {label}
      </Text>
      <NativeIcon name="chevron-down" size={compact ? 15 : 17} color={mobileTheme.colors.inkMuted} />
    </Pressable>
  )
}

function requireConnection(connection: ReturnType<typeof useConnectionStore.getState>['connection']) {
  if (!connection) throw new Error('请先连接桌面端。')
  return connection
}

function workspaceDetail(
  connection: ReturnType<typeof useConnectionStore.getState>['connection'],
  sessions: ReturnType<typeof useQuery<Awaited<ReturnType<MobileApi['listSessions']>>>>,
  selectedTime: string | undefined,
): string {
  if (!connection) return '请先连接桌面端。'
  if (sessions.isPending) return '正在加载桌面工作区…'
  if (sessions.isError) return `桌面工作区加载失败：${errorMessage(sessions.error)}`
  const count = sessions.data?.items.length ?? 0
  if (count === 0) return '桌面端暂无会话，请在桌面端创建会话。'
  return selectedTime === undefined ? `已连接桌面端 · ${count} 个会话` : `最近更新 · ${selectedTime}`
}

function errorMessage(error: unknown): string {
  return mobileErrorMessage(error, '请稍后重试。')
}

const s = StyleSheet.create({
  canvas: { flex: 1, justifyContent: 'space-between' },
  summary: { gap: mobileTheme.spacing.sm, paddingHorizontal: mobileTheme.spacing.lg, paddingTop: mobileTheme.spacing.lg },
  summaryLabel: { color: mobileTheme.colors.inkMuted, fontSize: 12, fontWeight: '700' },
  controls: { alignItems: 'center', flexDirection: 'row', gap: mobileTheme.spacing.sm },
  control: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: 11,
  },
  modeControl: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: 11,
  },
  disabledControl: { opacity: 0.5 },
  controlText: { color: mobileTheme.colors.ink, flexShrink: 1, fontSize: 13, fontWeight: '500' },
  detail: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 18 },
  headerMode: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: mobileTheme.touch.minTarget, paddingHorizontal: 4 },
  headerModeText: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '600', maxWidth: 94 },
  pressed: { opacity: 0.62 },
})
