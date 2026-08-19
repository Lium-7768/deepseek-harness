import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { NativeListRow, NativeSection } from '@/components/native-list'
import { settingsSectionIcon } from '@/components/settings-logic'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useConnectionStore } from '@/state/connection'
import type { MobileSettingsNamespaceView, MobileSettingsPayload } from '@/types/mobile'
import { mobileTheme } from '@/theme'

type SettingsSection = 'general' | 'models' | 'plugins' | 'presets'

/** Renders native settings list/detail screens backed by the desktop settings seam. */
export default function SettingsScreen(): React.JSX.Element {
  const { section: rawSection, preset: rawPreset } = useLocalSearchParams<{
    section?: string | string[]
    preset?: string | string[]
  }>()
  const section = parseSection(firstParam(rawSection))
  const preset = firstParam(rawPreset)
  const connection = useConnectionStore(state => state.connection)
  const leftAction =
    section === undefined ? undefined : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回设置"
        hitSlop={8}
        onPress={() => router.back()}
        style={styles.back}
      >
        <NativeIcon name="arrow-back" color={mobileTheme.colors.ink} size={20} />
      </Pressable>
    )
  return (
    <WorkspaceShell leftAction={leftAction} showMenu={section === undefined} title={sectionTitle(section)}>
      {connection === undefined ? (
        <ConnectionCard connection={connection} />
      ) : section === undefined ? (
        <SettingsIndex connection={connection} />
      ) : section === 'general' ? (
        <GeneralSettings connection={connection} />
      ) : section === 'models' ? (
        <ModelSettings connection={connection} />
      ) : section === 'plugins' ? (
        <PluginSettings connection={connection} />
      ) : (
        <PresetSettings connection={connection} selectedPreset={preset} />
      )}
    </WorkspaceShell>
  )
}

function SettingsIndex({
  connection,
}: {
  connection: ReturnType<typeof useConnectionStore.getState>['connection']
}): React.JSX.Element {
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>管理桌面端运行时和移动端连接</Text>
      </View>
      <SettingRow title="通用设置" description="默认模式、权限和桌面端行为" section="general" />
      <SettingRow title="模型" description="查看提供方与模型目录；API 密钥需在桌面端维护" section="models" />
      <SettingRow title="插件" description="移动端仅查看，插件安装和配置需在桌面端完成" section="plugins" />
      <SettingRow title="智能体预设" description="查看预设，并为仍为空白的会话选择模式" section="presets" />
      <ConnectionCard connection={connection} />
    </ScrollView>
  )
}

function SettingRow({
  title,
  description,
  section,
}: {
  title: string
  description: string
  section: SettingsSection
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push({ pathname: '/settings', params: { section } })}
      style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
    >
      <NativeIcon name={settingsSectionIcon(section)} color={mobileTheme.colors.accentText} size={21} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <NativeIcon name="chevron-right" color={mobileTheme.colors.inkMuted} size={20} />
    </Pressable>
  )
}

function GeneralSettings({
  connection,
}: {
  connection: NonNullable<ReturnType<typeof useConnectionStore.getState>['connection']>
}): React.JSX.Element {
  const client = new MobileApi(connection)
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['mobile-settings', connection.gatewayUrl, connection.deviceId],
    queryFn: () => client.settingsDescribe(),
  })
  const presets = useQuery({
    queryKey: ['mobile-agent-presets', connection.gatewayUrl, connection.deviceId],
    queryFn: () => client.agentPresets(),
  })
  const [saving, setSaving] = useState(false)
  const writable = settings.data?.writable === true
  const presetDefault =
    readString(readRecord(namespaceValue(settings.data, 'agent-presets'))?.default) ??
    presets.data?.presets.find(item => item.isDefault)?.id
  const permissionDefault =
    readString(readRecord(namespaceValue(settings.data, 'permission'))?.defaultPreset) ?? 'workspace-write'
  const theme = readString(readRecord(namespaceValue(settings.data, 'ui-theme'))?.preference) ?? 'light'
  const save = (ns: string, patch: Record<string, unknown>, success: string): void => {
    const descriptor = namespace(settings.data, ns)
    setSaving(true)
    void client
      .settingsUpdate({ ns, patch, ...(descriptor === undefined ? {} : { expectedRevision: descriptor.revision }) })
      .then(() => {
        void queryClient.invalidateQueries({
          queryKey: ['mobile-settings', connection.gatewayUrl, connection.deviceId],
        })
        Alert.alert('设置已保存', success)
      })
      .catch(error => Alert.alert('设置保存失败', mobileErrorMessage(error, '无法保存设置，请稍后重试。')))
      .finally(() => setSaving(false))
  }
  if (settings.isPending || presets.isPending) return <CenteredState text="正在加载设置…" />
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>移动端只修改桌面端明确允许的设置；敏感配置仍由桌面端管理。</Text>
      </View>
      {settings.isError ? (
        <QueryErrorNotice
          text={mobileErrorMessage(settings.error, '设置加载失败，请稍后重试。')}
          onRetry={() => void settings.refetch()}
        />
      ) : null}
      {presets.isError ? (
        <QueryErrorNotice
          text={mobileErrorMessage(presets.error, '智能体预设加载失败，请稍后重试。')}
          onRetry={() => void presets.refetch()}
        />
      ) : null}
      <OptionSection title="新会话默认智能体模式" description="仅影响之后创建的会话。运行中的会话不会改变。">
        {presets.data?.presets.map(item => (
          <OptionRow
            key={item.id}
            label={item.name ?? item.id}
            description={item.broken ?? item.description ?? '内置模式'}
            selected={item.id === presetDefault}
            disabled={!writable || saving || item.broken !== undefined}
            onPress={() => save('agent-presets', { default: item.id }, '之后创建的会话将使用此模式。')}
          />
        ))}
        {presets.data?.presets.length === 0 ? <Text style={styles.muted}>桌面端未配置智能体预设。</Text> : null}
      </OptionSection>
      <OptionSection title="默认权限" description="仅影响之后创建的会话；当前会话的权限请求仍需逐项审批。">
        <OptionRow
          label="只读"
          description="禁止写入工作区"
          selected={permissionDefault === 'read-only'}
          disabled={!writable || saving}
          onPress={() => save('permission', { defaultPreset: 'read-only' }, '新会话默认使用只读权限。')}
        />
        <OptionRow
          label="工作区写入"
          description="允许在工作区内写入文件"
          selected={permissionDefault === 'workspace-write'}
          disabled={!writable || saving}
          onPress={() => save('permission', { defaultPreset: 'workspace-write' }, '新会话默认使用工作区写入权限。')}
        />
        <OptionRow
          label="完全访问"
          description="不限制工作区访问范围"
          selected={permissionDefault === 'danger-full-access'}
          disabled={!writable || saving}
          onPress={() =>
            confirmFullAccess(() =>
              save('permission', { defaultPreset: 'danger-full-access' }, '新会话默认使用完全访问权限。'),
            )
          }
        />
      </OptionSection>
      <ReadOnlySetting title="外观" value={themeLabel(theme)} detail="移动端当前固定浅色主题；请在桌面端修改主题。" />
      <ReadOnlySetting title="语言" value="中文" detail="移动端当前提供中文界面；桌面端语言设置不会改变移动端文案。" />
      <ReadOnlySetting
        title="忙碌时 Enter 键行为"
        value="排队发送"
        detail="移动端发送按钮不提供桌面端 Enter 行为切换。"
      />
      {!writable ? <Text style={styles.notice}>桌面端设置提供方为只读，修改控件已禁用。</Text> : null}
    </ScrollView>
  )
}

function ModelSettings({
  connection,
}: {
  connection: NonNullable<ReturnType<typeof useConnectionStore.getState>['connection']>
}): React.JSX.Element {
  const client = new MobileApi(connection)
  const providers = useQuery({
    queryKey: ['mobile-llm-providers', connection.gatewayUrl, connection.deviceId],
    queryFn: () => client.llmProviders(),
  })
  const models = useQuery({
    queryKey: ['mobile-llm-models', connection.gatewayUrl, connection.deviceId],
    queryFn: () => client.llmModels(),
  })
  if (providers.isPending || models.isPending) return <CenteredState text="正在加载模型目录…" />
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>移动端可以查看和选择会话模型；API 密钥、地址和提供方配置必须在桌面端完成。</Text>
      </View>
      {providers.isError ? (
        <QueryErrorNotice
          text={mobileErrorMessage(providers.error, '模型提供方加载失败，请稍后重试。')}
          onRetry={() => void providers.refetch()}
        />
      ) : null}
      {models.isError ? (
        <QueryErrorNotice
          text={mobileErrorMessage(models.error, '模型目录加载失败，请稍后重试。')}
          onRetry={() => void models.refetch()}
        />
      ) : null}
      <OptionSection title="模型提供方" description="提供方状态来自桌面端实时注册表。">
        {providers.data?.providers.map(provider => (
          <View key={provider.provider} style={styles.providerRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{provider.displayName}</Text>
              <Text style={styles.rowDescription}>{provider.provider}</Text>
            </View>
            <Text style={provider.active ? styles.active : styles.muted}>{provider.active ? '已启用' : '未启用'}</Text>
          </View>
        ))}
        {providers.data?.providers.length === 0 ? (
          <Text style={styles.muted}>桌面端没有已注册的模型提供方。</Text>
        ) : null}
      </OptionSection>
      <OptionSection title="可用模型" description="点击会话输入框底部的模型名称，可为当前会话选择模型。">
        {models.data?.groups.map(group => (
          <View key={group.id} style={styles.providerGroup}>
            <Text style={styles.groupTitle}>{group.name}</Text>
            {group.models.map(model => (
              <View key={model.id} style={styles.catalogRow}>
                <Text style={styles.rowTitle}>{model.name}</Text>
                <Text style={styles.rowDescription}>{model.description ?? model.id}</Text>
              </View>
            ))}
          </View>
        ))}
        {models.data?.groups.length === 0 ? <Text style={styles.muted}>当前没有可用模型。</Text> : null}
        {models.data?.failures.map(failure => (
          <Text key={failure.id} style={styles.warning}>
            {failure.name}：目录暂不可用。
          </Text>
        ))}
      </OptionSection>
      <ReadOnlySetting
        title="提供方编辑"
        value="桌面端专属"
        detail="移动端不会接收或保存 API 密钥，也不开放任意提供方配置。"
      />
    </ScrollView>
  )
}

function PluginSettings({
  connection,
}: {
  connection: NonNullable<ReturnType<typeof useConnectionStore.getState>['connection']>
}): React.JSX.Element {
  const client = new MobileApi(connection)
  const settings = useQuery({
    queryKey: ['mobile-settings', connection.gatewayUrl, connection.deviceId],
    queryFn: () => client.settingsDescribe(),
  })
  if (settings.isPending) return <CenteredState text="正在读取插件配置…" />
  if (settings.isError)
    return (
      <ErrorState
        error={settings.error}
        fallback="插件配置加载失败，请稍后重试。"
        onRetry={() => void settings.refetch()}
      />
    )
  const namespaces = settings.data.namespaces.filter(
    item =>
      !['ui-onboarding', 'ui-theme', 'locale', 'ui-conversation', 'agent-presets', 'permission'].includes(item.ns),
  )
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          移动端不安装、卸载或任意修改插件。下列配置命名空间仅用于确认桌面端已加载的能力。
        </Text>
      </View>
      <OptionSection title="桌面端配置命名空间" description="插件的完整配置表单和敏感字段只在桌面端提供。">
        {namespaces.map(item => (
          <View key={item.ns} style={styles.providerRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{pluginLabel(item.ns)}</Text>
              <Text style={styles.rowDescription}>{item.ns}</Text>
            </View>
            <Text style={styles.muted}>{item.applies === 'restart' ? '重启生效' : '实时生效'}</Text>
          </View>
        ))}
        {namespaces.length === 0 ? <Text style={styles.muted}>桌面端没有可展示的插件配置。</Text> : null}
      </OptionSection>
      <ReadOnlySetting title="插件管理" value="桌面端专属" detail="移动端没有可点击但不生效的插件管理入口。" />
    </ScrollView>
  )
}

function PresetSettings({
  connection,
  selectedPreset,
}: {
  connection: NonNullable<ReturnType<typeof useConnectionStore.getState>['connection']>
  selectedPreset?: string
}): React.JSX.Element {
  const client = new MobileApi(connection)
  const presets = useQuery({
    queryKey: ['mobile-agent-presets', connection.gatewayUrl, connection.deviceId],
    queryFn: () => client.agentPresets(),
  })
  const detail = useQuery({
    queryKey: ['mobile-agent-preset', connection.gatewayUrl, connection.deviceId, selectedPreset],
    enabled: selectedPreset !== undefined,
    queryFn: () => client.agentPreset(selectedPreset ?? ''),
  })
  if (presets.isPending) return <CenteredState text="正在加载智能体预设…" />
  if (presets.isError)
    return (
      <ErrorState
        error={presets.error}
        fallback="智能体预设加载失败，请稍后重试。"
        onRetry={() => void presets.refetch()}
      />
    )
  if (selectedPreset !== undefined)
    return (
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>{detail.data?.description ?? '只读查看预设内容。'}</Text>
        </View>
        {detail.isPending ? (
          <CenteredState text="正在读取预设…" />
        ) : detail.isError ? (
          <ErrorState
            error={detail.error}
            fallback="预设读取失败，请稍后重试。"
            onRetry={() => void detail.refetch()}
          />
        ) : (
          <Text selectable style={styles.code}>
            {detail.data?.content ?? '预设内容为空。'}
          </Text>
        )}
        <ReadOnlySetting title="编辑此预设" value="桌面端专属" detail="移动端不打开或修改本地预设文件。" />
      </ScrollView>
    )
  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>
          预设决定会话使用的工具和能力。点击可查看内容；新会话默认值在通用设置中修改。
        </Text>
      </View>
      {presets.data?.presets.map(item => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`查看 ${item.name ?? item.id}`}
          onPress={() => router.push({ pathname: '/settings', params: { section: 'presets', preset: item.id } })}
          style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
        >
          <NativeIcon
            name={item.trust === 'system' ? 'check' : 'description'}
            color={mobileTheme.colors.accentText}
            size={20}
          />
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>
              {item.name ?? item.id}
              {item.isDefault ? '（默认）' : ''}
            </Text>
            <Text style={styles.rowDescription}>
              {item.broken ?? item.description ?? (item.trust === 'system' ? '内置模式' : '自定义模式')}
            </Text>
          </View>
          <NativeIcon name="chevron-right" color={mobileTheme.colors.inkMuted} size={20} />
        </Pressable>
      ))}
      {presets.data?.presets.length === 0 ? <Text style={styles.muted}>桌面端没有可用的智能体预设。</Text> : null}
      {!presets.data?.authorable ? <Text style={styles.notice}>当前部署不支持在移动端创建自定义预设。</Text> : null}
    </ScrollView>
  )
}

function ConnectionCard({
  connection,
}: {
  connection: ReturnType<typeof useConnectionStore.getState>['connection']
}): React.JSX.Element {
  const forgetConnection = useConnectionStore(state => state.forgetConnection)
  const [forgetting, setForgetting] = useState(false)
  const disconnect = (): void => {
    Alert.alert('忘记此桌面端？', '这只会移除手机上的凭据。如需阻止后续访问，请在桌面端撤销设备。', [
      { text: '取消', style: 'cancel' },
      {
        text: '忘记',
        style: 'destructive',
        onPress: () => {
          setForgetting(true)
          void forgetConnection()
            .then(() => router.replace('/connect'))
            .catch(error => Alert.alert('忘记连接失败', mobileErrorMessage(error, '无法移除本机凭据，请稍后重试。')))
            .finally(() => setForgetting(false))
        },
      },
    ])
  }
  return (
    <View style={styles.connectionCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>桌面端连接</Text>
        <View style={styles.connected}>
          <View style={[styles.dot, connection ? styles.dotConnected : styles.dotDisconnected]} />
          <Text style={[styles.connectedText, !connection && styles.disconnectedText]}>
            {connection ? '已连接' : '未连接'}
          </Text>
        </View>
      </View>
      <Text style={styles.label}>移动网关</Text>
      <Text selectable style={styles.value}>
        {connection?.gatewayUrl ?? '未连接'}
      </Text>
      <Text style={styles.label}>设备 ID</Text>
      <Text selectable style={styles.value}>
        {connection?.deviceId ?? '未连接'}
      </Text>
      {connection ? (
        <NativeActionButton
          label="忘记此桌面端"
          icon="link-off"
          variant="danger"
          loading={forgetting}
          disabled={forgetting}
          onPress={disconnect}
          style={styles.actionButton}
        />
      ) : (
        <NativeActionButton
          label="连接桌面端"
          icon="link"
          onPress={() => router.replace('/connect')}
          style={styles.actionButton}
        />
      )}
    </View>
  )
}

function confirmFullAccess(onConfirm: () => void): void {
  Alert.alert('启用完全访问？', '这会让之后创建的会话不受工作区范围限制地访问文件。', [
    { text: '取消', style: 'cancel' },
    { text: '继续', style: 'destructive', onPress: onConfirm },
  ])
}

function OptionSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <NativeSection title={title}>
      <Text style={styles.sectionDescription}>{description}</Text>
      {children}
    </NativeSection>
  )
}

function OptionRow({
  label,
  description,
  selected,
  disabled,
  onPress,
}: {
  label: string
  description: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <NativeListRow
      accessibilityRole="radio"
      description={description}
      disabled={disabled}
      onPress={onPress}
      right={selected ? <NativeIcon name="check" color={mobileTheme.colors.accentText} size={20} /> : null}
      selected={selected}
      title={label}
    />
  )
}

function ReadOnlySetting({
  title,
  value,
  detail,
}: {
  title: string
  value: string
  detail: string
}): React.JSX.Element {
  return (
    <NativeListRow
      accessibilityLabel={`${title}：${value}。${detail}`}
      description={detail}
      right={<Text style={styles.muted}>{value}</Text>}
      title={title}
    />
  )
}
function CenteredState({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={mobileTheme.colors.accent} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  )
}

function ErrorState({
  error,
  fallback,
  onRetry,
}: {
  error: unknown
  fallback: string
  onRetry?: () => void
}): React.JSX.Element {
  return (
    <View style={styles.center}>
      <Text style={styles.error}>{mobileErrorMessage(error, fallback)}</Text>
      {onRetry ? <NativeActionButton label="重新加载" icon="refresh" variant="secondary" onPress={onRetry} /> : null}
    </View>
  )
}

function QueryErrorNotice({ text, onRetry }: { text: string; onRetry: () => void }): React.JSX.Element {
  return (
    <View accessibilityRole="alert" style={styles.queryError}>
      <NativeIcon name="error-outline" color={mobileTheme.colors.danger} size={17} />
      <View style={styles.queryErrorBody}>
        <Text style={styles.error}>{text}</Text>
        <NativeActionButton label="重新加载" icon="refresh" variant="secondary" onPress={onRetry} />
      </View>
    </View>
  )
}

function namespace(payload: MobileSettingsPayload | undefined, ns: string): MobileSettingsNamespaceView | undefined {
  return payload?.namespaces.find(item => item.ns === ns)
}

function namespaceValue(payload: MobileSettingsPayload | undefined, ns: string): unknown {
  return namespace(payload, ns)?.value
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function themeLabel(value: string): string {
  if (value === 'dark') return '深色（桌面端）'
  if (value === 'system') return '跟随系统（桌面端）'
  return '浅色（桌面端）'
}

function pluginLabel(ns: string): string {
  const labels: Record<string, string> = {
    'llm-deepseek': 'DeepSeek 模型',
    'llm-pi-ai': 'Pi AI 模型',
    'web-search-deepseek': 'DeepSeek 网页搜索',
    shell: '终端',
    'agent-loop': '智能体循环',
  }
  return labels[ns] ?? ns
}

function parseSection(value: string | undefined): SettingsSection | undefined {
  return value === 'general' || value === 'models' || value === 'plugins' || value === 'presets' ? value : undefined
}

function sectionTitle(section: SettingsSection | undefined): string {
  if (section === 'general') return '通用设置'
  if (section === 'models') return '模型'
  if (section === 'plugins') return '插件'
  if (section === 'presets') return '智能体预设'
  return '设置'
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value.find(item => item.trim()) : value
  return candidate?.trim() || undefined
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  list: { gap: mobileTheme.spacing.sm, padding: mobileTheme.spacing.lg, paddingBottom: mobileTheme.spacing.xl },
  header: { gap: 4, marginBottom: mobileTheme.spacing.xs },
  subtitle: { color: mobileTheme.colors.inkMuted, fontSize: 14, lineHeight: 20 },
  settingRow: {
    alignItems: 'center',
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: mobileTheme.spacing.md,
    minHeight: mobileTheme.touch.minTarget,
    paddingVertical: mobileTheme.spacing.sm,
  },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: mobileTheme.colors.ink, fontSize: 15, fontWeight: '700' },
  rowDescription: { color: mobileTheme.colors.inkMuted, fontSize: 13, lineHeight: 18 },
  section: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  sectionTitle: { color: mobileTheme.colors.ink, fontSize: 16, fontWeight: '500', lineHeight: 24 },
  sectionDescription: { color: mobileTheme.colors.inkMuted, fontSize: 13, lineHeight: 18, marginBottom: 2 },
  optionRow: {
    alignItems: 'center',
    borderColor: mobileTheme.colors.border,
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 11,
  },
  optionSelected: { backgroundColor: mobileTheme.colors.surfaceActive, borderColor: '#b9d1ff' },
  optionDisabled: { opacity: 0.5 },
  readOnly: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12,
  },
  providerRow: {
    alignItems: 'center',
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
  },
  providerGroup: { gap: 7 },
  groupTitle: { color: mobileTheme.colors.inkMuted, fontSize: 13, fontWeight: '700' },
  catalogRow: { borderColor: mobileTheme.colors.border, borderRadius: 8, borderWidth: 1, gap: 3, padding: 10 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  connectionCard: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    gap: mobileTheme.spacing.sm,
    padding: mobileTheme.spacing.md,
  },
  cardTitle: { color: mobileTheme.colors.ink, fontSize: 16, fontWeight: '800' },
  connected: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  dot: { borderRadius: 4, height: 7, width: 7 },
  dotConnected: { backgroundColor: mobileTheme.colors.success },
  dotDisconnected: { backgroundColor: mobileTheme.colors.inkFaint },
  connectedText: { color: mobileTheme.colors.successText, fontSize: 11, fontWeight: '800' },
  disconnectedText: { color: mobileTheme.colors.inkMuted },
  label: { color: mobileTheme.colors.inkMuted, fontSize: 12, fontWeight: '700', marginTop: 7 },
  value: { color: mobileTheme.colors.ink, fontSize: 14, lineHeight: 20 },
  actionButton: { marginTop: 10, width: '100%' },
  muted: { color: mobileTheme.colors.inkMuted, fontSize: 13 },
  active: { color: mobileTheme.colors.successText, fontSize: 12, fontWeight: '700' },
  warning: { color: mobileTheme.colors.warningText, fontSize: 12 },
  notice: {
    backgroundColor: mobileTheme.colors.warningSoft,
    borderColor: '#efd9a5',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    color: mobileTheme.colors.warningText,
    lineHeight: 19,
    padding: 11,
  },
  code: {
    backgroundColor: mobileTheme.colors.codeBackground,
    borderRadius: 10,
    color: mobileTheme.colors.codeForeground,
    fontFamily: 'Menlo',
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  center: { alignItems: 'center', flex: 1, gap: 10, justifyContent: 'center', padding: 24 },
  error: { color: mobileTheme.colors.danger, lineHeight: 20 },
  queryError: {
    alignItems: 'flex-start',
    backgroundColor: mobileTheme.colors.dangerSoft,
    borderColor: '#efb5b0',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 11,
  },
  queryErrorBody: { flex: 1, gap: 8 },
  pressed: { opacity: 0.62 },
})
