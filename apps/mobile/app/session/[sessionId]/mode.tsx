import { useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { NativeSection } from '@/components/native-list'
import { NativeSelectionRow } from '@/components/native-selection'
import { modeOptionDisabled, selectionOptionDisabled } from '@/components/session-route-logic'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useConnectionStore } from '@/state/connection'
import { useRouteSessionSelection } from '@/state/session-selection'
import { mobileTheme } from '@/theme'

/** Lists the real Agent presets and commits a mode change through the DSH API. */
export default function SessionModeScreen(): React.JSX.Element {
  const { sessionId: rawSessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>()
  const sessionId = firstParam(rawSessionId)
  useRouteSessionSelection(sessionId)
  const connection = useConnectionStore(state => state.connection)
  const client = connection === undefined ? undefined : new MobileApi(connection)
  const presets = useQuery({
    queryKey: ['session-mode-presets', connection?.gatewayUrl, connection?.deviceId],
    enabled: client !== undefined,
    queryFn: () => requireClient(client).agentPresets(),
  })
  const sessions = useQuery({
    queryKey: ['session-mode-session', connection?.gatewayUrl, connection?.deviceId],
    enabled: client !== undefined,
    queryFn: () => requireClient(client).listSessions(),
  })
  const current = sessions.data?.items.find(item => item.sessionId === sessionId)
  const blank = current?.blank === true
  const [submitting, setSubmitting] = useState<string | undefined>(undefined)

  const presetItems = presets.data?.presets ?? []
  return (
    <WorkspaceShell
      leftAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回会话"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}
        >
          <NativeIcon name="arrow-back" color={mobileTheme.colors.ink} size={20} />
        </Pressable>
      }
      showMenu={false}
      title="选择智能体模式"
    >
      <FlatList
        contentContainerStyle={styles.list}
        data={presetItems.length === 0 ? [] : [presetItems]}
        keyExtractor={() => 'mode-presets'}
        ListEmptyComponent={
          <StateView
            loading={presets.isPending}
            error={presets.error}
            onRetry={() => void presets.refetch()}
            text="桌面端没有可用的智能体模式。"
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>选择智能体模式</Text>
            <Text style={styles.description}>
              {sessions.isError
                ? '无法读取当前会话状态，暂时无法切换模式。'
                : sessions.isPending
                  ? '正在读取当前会话状态…'
                  : blank
                    ? '空白会话可以切换模式；切换结果会记录到会话日志。'
                    : '会话已经开始，智能体模式已锁定。请在设置中修改新会话默认模式。'}
            </Text>
            {sessions.isError ? (
              <>
                <Text style={styles.error}>{mobileErrorMessage(sessions.error, '会话状态加载失败，请稍后重试。')}</Text>
                <NativeActionButton
                  label="重新加载会话状态"
                  icon="refresh"
                  variant="secondary"
                  onPress={() => void sessions.refetch()}
                />
              </>
            ) : null}
          </View>
        }
        renderItem={({ item: modeItems }) => (
          <NativeSection>
            {modeItems.map((item) => {
              const selected =
                item.id === current?.agentPreset || (current?.agentPreset === undefined && item.isDefault)
              const disabled =
                modeOptionDisabled({
                  sessionsPending: sessions.isPending,
                  sessionsError: sessions.isError,
                  blank,
                  broken: item.broken !== undefined,
                }) || selectionOptionDisabled(submitting !== undefined)
              return (
                <NativeSelectionRow
                  key={item.id}
                  accessibilityLabel={
                    (item.name ?? item.id) + (selected ? '，当前模式' : '') + (disabled ? '，不可用' : '')
                  }
                  description={item.broken ?? item.description ?? (item.trust === 'system' ? '内置模式' : '自定义模式')}
                  disabled={disabled}
                  loading={submitting === item.id}
                  onPress={() => {
                    if (client === undefined || sessionId === undefined || submitting !== undefined) return
                    setSubmitting(item.id)
                    void client
                      .selectSessionPreset(sessionId, item.id)
                      .then(() => router.back())
                      .catch(error =>
                        Alert.alert('模式切换失败', mobileErrorMessage(error, '无法切换智能体模式，请稍后重试。')),
                      )
                      .finally(() => setSubmitting(undefined))
                  }}
                  preserveDisabledReadability={!blank && !sessions.isPending && !sessions.isError}
                  selected={selected}
                  title={item.name ?? item.id}
                />
              )
            })}
          </NativeSection>
        )}
      />
    </WorkspaceShell>
  )
}

function StateView({
  loading,
  error,
  onRetry,
  text,
}: {
  loading: boolean
  error: unknown
  onRetry: () => void
  text: string
}): React.JSX.Element {
  if (loading) return <Text style={styles.state}>正在加载智能体模式…</Text>
  if (error !== null && error !== undefined)
    return (
      <View style={styles.stateBlock}>
        <Text style={styles.error}>{mobileErrorMessage(error, '智能体模式加载失败，请稍后重试。')}</Text>
        <NativeActionButton label="重新加载" icon="refresh" variant="secondary" onPress={onRetry} />
      </View>
    )
  return <Text style={styles.state}>{text}</Text>
}

function requireClient(client: MobileApi | undefined): MobileApi {
  if (client === undefined) throw new Error('请先连接桌面端。')
  return client
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value.find(item => item.trim()) : value
  return candidate?.trim() || undefined
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  list: { padding: 16, paddingBottom: 28 },
  header: { gap: 6, marginBottom: 4 },
  title: { color: mobileTheme.colors.ink, fontSize: 22, fontWeight: '700' },
  description: { color: mobileTheme.colors.inkMuted, lineHeight: 20 },
  state: { color: mobileTheme.colors.inkMuted, padding: 18, textAlign: 'center' },
  stateBlock: { alignItems: 'center', gap: 10, padding: 18 },
  error: { color: mobileTheme.colors.danger, padding: 18 },
})
