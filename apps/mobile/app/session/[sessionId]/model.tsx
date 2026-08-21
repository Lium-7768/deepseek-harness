import { useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeModelSelectionGroup, nativeModelSelectionKey } from '@/components/native-model-selection'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { selectionOptionDisabled, sessionDetailReturnTarget } from '@/components/session-route-logic'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useConnectionStore } from '@/state/connection'
import { useRouteSessionSelection } from '@/state/session-selection'
import { mobileTheme } from '@/theme'

/** Lists the session's real provider catalog and records a model selection. */
export default function SessionModelScreen(): React.JSX.Element {
  const { sessionId: rawSessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>()
  const sessionId = firstParam(rawSessionId)
  useRouteSessionSelection(sessionId)
  const connection = useConnectionStore(state => state.connection)
  const client = connection === undefined ? undefined : new MobileApi(connection)
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined)
  const models = useQuery({
    queryKey: ['session-models', connection?.gatewayUrl, connection?.deviceId, sessionId],
    enabled: client !== undefined && sessionId !== undefined,
    queryFn: () => requireClient(client).sessionModels(sessionId ?? ''),
  })
  const current = models.data?.current
  const activeKey = selectedModel ?? (current === undefined ? undefined : `${current.provider}:${current.model}`)
  const [submitting, setSubmitting] = useState<string | undefined>(undefined)

  return (
    <WorkspaceShell
      leftAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回会话"
          hitSlop={8}
          onPress={() => router.replace(sessionDetailReturnTarget(sessionId))}
          style={styles.back}
        >
          <NativeIcon name="arrow-back" color={mobileTheme.colors.ink} size={20} />
        </Pressable>
      }
      showMenu={false}
      title="选择模型"
    >
      <FlatList
        contentContainerStyle={styles.list}
        data={models.data?.groups ?? []}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <StateView
            loading={models.isPending}
            error={models.error}
            onRetry={() => void models.refetch()}
            text="桌面端没有可用模型。"
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>选择模型</Text>
            <Text style={styles.description}>模型选择会记录到当前会话日志，并由桌面端验证是否可用。</Text>
            {models.data?.routable === false ? <Text style={styles.error}>当前会话的模型路由不可用。</Text> : null}
            {models.data?.failures.map(failure => (
              <Text key={failure.id} style={styles.failure}>
                {failure.name}：模型目录加载失败。
              </Text>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <NativeModelSelectionGroup
            disabled={selectionOptionDisabled(submitting !== undefined)}
            group={item}
            onSelect={({ provider, model }) => {
              if (client === undefined || sessionId === undefined || submitting !== undefined) return
              const key = nativeModelSelectionKey(provider, model)
              const previous = activeKey
              setSelectedModel(key)
              setSubmitting(key)
              void client
                .selectSessionModel(sessionId, { provider, model })
                .then(() => router.replace(sessionDetailReturnTarget(sessionId)))
                .catch((error) => {
                  setSelectedModel(previous)
                  Alert.alert('模型切换失败', mobileErrorMessage(error, '无法切换模型，请稍后重试。'))
                })
                .finally(() => setSubmitting(undefined))
            }}
            selection={
              activeKey === undefined
                ? undefined
                : { provider: activeKey.slice(0, activeKey.indexOf(':')), model: activeKey.slice(activeKey.indexOf(':') + 1) }
            }
            submittingKey={submitting}
          />
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
  if (loading) return <Text style={styles.state}>正在加载模型目录…</Text>
  if (error !== null && error !== undefined)
    return (
      <View style={styles.stateBlock}>
        <Text style={styles.error}>{mobileErrorMessage(error, '模型目录加载失败，请稍后重试。')}</Text>
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
  list: { gap: 12, padding: 16, paddingBottom: 28 },
  header: { gap: 6, marginBottom: 4 },
  title: { color: mobileTheme.colors.ink, fontSize: 22, fontWeight: '700' },
  description: { color: mobileTheme.colors.inkMuted, lineHeight: 20 },
  state: { color: mobileTheme.colors.inkMuted, padding: 18, textAlign: 'center' },
  stateBlock: { alignItems: 'center', gap: 10, padding: 18 },
  error: { color: mobileTheme.colors.danger, paddingVertical: 4 },
  failure: { color: mobileTheme.colors.warning, fontSize: 12 },
})
