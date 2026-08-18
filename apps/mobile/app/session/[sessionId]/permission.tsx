import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeListRow, NativeSection } from '@/components/native-list'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { permissionDescription, permissionLabel, readPermissionSelect } from '@/components/session-composer-logic'
import { permissionOptionsLocked } from '@/components/session-route-logic'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useConnectionStore } from '@/state/connection'
import { useRouteSessionSelection } from '@/state/session-selection'
import { mobileTheme } from '@/theme'

/** Lists the host-projected permission presets and submits the existing command path. */
export default function SessionPermissionScreen(): React.JSX.Element {
  const { sessionId: rawSessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>()
  const sessionId = firstParam(rawSessionId)
  useRouteSessionSelection(sessionId)
  const connection = useConnectionStore(state => state.connection)
  const client = connection === undefined ? undefined : new MobileApi(connection)
  const queryClient = useQueryClient()
  const [submitting, setSubmitting] = useState<string | undefined>(undefined)
  const history = useQuery({
    queryKey: ['session-history', sessionId],
    enabled: client !== undefined && sessionId !== undefined,
    queryFn: () => requireClient(client).sessionHistory(sessionId ?? ''),
  })
  const events = useQuery({
    queryKey: ['session-events', sessionId, 0],
    enabled: client !== undefined && sessionId !== undefined,
    queryFn: () => requireClient(client).sessionEvents(sessionId ?? '', 0),
    refetchInterval: 2500,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  })
  const permissions = readPermissionSelect(history.data?.projections?.values.permissions)
  const locked = permissionOptionsLocked({
    eventsError: events.isError,
    eventsPending: events.isPending,
    eventsStale: events.isStale,
    status: events.data?.status,
    submitting: submitting !== undefined,
  })

  const options = permissions?.options.filter(item => item.value !== 'custom') ?? []
  const choose = (value: string): void => {
    if (client === undefined || sessionId === undefined || locked || value === permissions?.currentValue) return
    if (value === 'danger-full-access') {
      Alert.alert('启用完全访问？', '这会允许当前会话不受工作区范围限制地访问文件。', [
        { text: '取消', style: 'cancel' },
        { text: '继续', style: 'destructive', onPress: () => submit(value) },
      ])
      return
    }
    submit(value)
  }

  const submit = (value: string): void => {
    if (client === undefined || sessionId === undefined || locked) return
    setSubmitting(value)
    void client
      .sendMessage(sessionId, [{ type: 'text', text: `/permission ${value}` }])
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] })
        void queryClient.invalidateQueries({ queryKey: ['session-events', sessionId] })
        router.back()
      })
      .catch(error => Alert.alert('权限切换失败', mobileErrorMessage(error, '无法切换权限，请稍后重试。')))
      .finally(() => setSubmitting(undefined))
  }

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
      title="选择权限"
    >
      <FlatList
        contentContainerStyle={styles.list}
        data={options.length === 0 ? [] : [options]}
        keyExtractor={() => 'permission-options'}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>选择权限</Text>
            <Text style={styles.description}>
              {events.isError
                ? '无法读取当前会话状态，暂时无法切换权限。'
                : permissions === undefined
                  ? '桌面端没有提供当前会话的权限投影，移动端不会猜测或修改权限。'
                  : locked
                    ? '会话状态正在确认或会话正在处理，权限暂时锁定。'
                    : '选择后会通过当前会话的 /permission 命令写入会话日志。'}
            </Text>
            {events.isError ? (
              <>
                <Text style={styles.error}>{mobileErrorMessage(events.error, '会话状态加载失败，请稍后重试。')}</Text>
                <NativeActionButton
                  label="重新加载会话状态"
                  icon="refresh"
                  variant="secondary"
                  onPress={() => void events.refetch()}
                />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          history.isPending ? (
            <Text style={styles.state}>正在加载权限…</Text>
          ) : history.isError ? (
            <View>
              <Text style={styles.error}>{mobileErrorMessage(history.error, '权限加载失败，请稍后重试。')}</Text>
              <NativeActionButton
                label="重新加载权限"
                icon="refresh"
                variant="secondary"
                onPress={() => void history.refetch()}
              />
            </View>
          ) : events.isError ? (
            <Text style={styles.error}>会话状态加载失败，权限选项已锁定。</Text>
          ) : (
            <Text style={styles.state}>当前会话没有可切换的权限预设。</Text>
          )
        }
        renderItem={({ item: optionItems }) => (
          <NativeSection>
            {optionItems.map((item) => {
              const selected = item.value === permissions?.currentValue
              const disabled = locked || item.value === 'custom'
              return (
                <NativeListRow
                  accessibilityLabel={
                    permissionLabel(item.value, item.name) +
                    (selected ? '，当前权限' : '') +
                    (disabled ? '，不可用' : '')
                  }
                  accessibilityRole="radio"
                  description={item.description ?? permissionDescription(item.value)}
                  disabled={disabled}
                  left={
                    <NativeIcon
                      name="admin-panel-settings"
                      size={20}
                      color={selected ? mobileTheme.colors.accentText : mobileTheme.colors.inkMuted}
                    />
                  }
                  onPress={() => choose(item.value)}
                  right={selected ? <NativeIcon name="check" color={mobileTheme.colors.accentText} size={20} /> : null}
                  selected={selected}
                  title={permissionLabel(item.value, item.name)}
                />
              )
            })}
          </NativeSection>
        )}
      />
    </WorkspaceShell>
  )
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
  error: { color: mobileTheme.colors.danger, padding: 18 },
})
