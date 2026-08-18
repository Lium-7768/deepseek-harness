import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { NativeIcon, type NativeIconName } from '@/components/native-icon'
import { mobileTheme } from '@/theme'
import type { SharedEventItem } from '@deepseek-ai/dsh-client-ui-shared'

export type WorkbenchTab = 'chat' | 'trajectory'

export function WorkbenchTabs({
  tab,
  onChange,
}: {
  tab: WorkbenchTab
  onChange: (tab: WorkbenchTab) => void
}): React.JSX.Element {
  return (
    <View style={s.tabs}>
      <Tab active={tab === 'chat'} icon="chat-bubble-outline" label="对话" onPress={() => onChange('chat')} />
      <Tab active={tab === 'trajectory'} icon="route" label="轨迹" onPress={() => onChange('trajectory')} />
    </View>
  )
}

function Tab({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean
  icon: NativeIconName
  label: string
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={{ top: 5, bottom: 5 }}
      onPress={onPress}
      style={[s.tab, active && s.tabActive]}
    >
      <NativeIcon name={icon} size={16} color={active ? mobileTheme.colors.accentText : mobileTheme.colors.inkMuted} />
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </Pressable>
  )
}

export function TrajectoryPanel({ items }: { items: SharedEventItem[] }): React.JSX.Element {
  const rows = items.filter(item => labelFor(item.event) !== undefined)
  return (
    <FlatList
      data={rows}
      keyExtractor={(item, index) => `trace-${item.seq ?? index}`}
      contentContainerStyle={s.panelList}
      renderItem={({ item }) => <TraceRow event={item.event} />}
      ListEmptyComponent={<Text style={s.empty}>当前会话还没有可显示的轨迹。</Text>}
    />
  )
}

function TraceRow({ event }: { event: Record<string, unknown> }): React.JSX.Element {
  const label = labelFor(event) ?? '事件'
  const detail = detailFor(event)
  return (
    <View style={s.traceRow}>
      <View style={s.traceIndex}>
        <NativeIcon name={traceIcon(event)} size={13} color={mobileTheme.colors.accentText} />
      </View>
      <View style={s.traceBody}>
        <Text style={s.traceLabel}>{label}</Text>
        {detail ? (
          <Text numberOfLines={3} style={s.traceDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function traceIcon(event: Record<string, unknown>) {
  const type = typeof event.type === 'string' ? event.type.toLowerCase() : ''
  if (type.startsWith('tool/')) return 'build'
  if (type.startsWith('assistant/')) return 'smart-toy'
  if (type.startsWith('user/')) return 'chat-bubble-outline'
  if (type.includes('approval') || type.includes('question')) return 'warning-amber'
  if (type === 'turn/end') return 'check'
  return 'route'
}
function labelFor(event: Record<string, unknown>): string | undefined {
  const type = typeof event.type === 'string' ? event.type : ''
  if (type.startsWith('tool/')) return '工具调用'
  if (type.startsWith('assistant/')) return '助手生成'
  if (type.startsWith('user/')) return '用户消息'
  if (type === 'turn/start') return '开始回合'
  if (type === 'turn/end') return '回合完成'
  if (type.includes('approval')) return '等待审批'
  if (type.includes('question')) return '等待回答'
  return undefined
}

function detailFor(event: Record<string, unknown>): string | undefined {
  const values = [event.summary, event.toolName, event.name]
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function SessionStats({ items }: { items: SharedEventItem[] }): React.JSX.Element {
  const turns = items.filter(item => item.event.type === 'turn/end').length
  const tools = items.filter(item => typeof item.event.type === 'string' && item.event.type.startsWith('tool/')).length
  const tokens = items.reduce((sum, item) => sum + tokenCount(item.event), 0)
  const parts = [`${turns} 轮`, `${tools} 步`]
  if (tokens > 0) parts.push(`${tokens.toLocaleString()} 个令牌`)
  return (
    <View style={s.stats}>
      <Text numberOfLines={1} style={s.statsText}>
        {parts.join('  ·  ')}
      </Text>
    </View>
  )
}

function tokenCount(event: Record<string, unknown>): number {
  const usage = event.usage
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) return 0
  const values = usage as Record<string, unknown>
  const input = values.inputTokens ?? values.promptTokens ?? values.prompt_tokens
  const output = values.outputTokens ?? values.completionTokens ?? values.completion_tokens
  const counted = (typeof input === 'number' ? input : 0) + (typeof output === 'number' ? output : 0)
  if (counted > 0) return counted
  const total = values.totalTokens ?? values.total_tokens
  return typeof total === 'number' ? total : 0
}

export function ContextRows({ items }: { items: SharedEventItem[] }): React.JSX.Element | null {
  const names = Array.from(new Set(items.flatMap(item => contextName(item.event))))
  if (!names.length) return null
  return (
    <View style={s.contextCompact}>
      {names.map(name => (
        <View key={name} style={s.contextCompactRow}>
          <NativeIcon name="description" size={15} color={mobileTheme.colors.inkMuted} />
          <Text numberOfLines={1} style={s.contextCompactText}>
            上下文注入 · {name}
          </Text>
        </View>
      ))}
    </View>
  )
}

function contextName(event: Record<string, unknown>): string[] {
  const type = typeof event.type === 'string' ? event.type.toLowerCase() : ''
  if (!type.includes('context')) return []
  const source = [event.sourceName, event.source, event.filename, event.fileName].find(
    value => typeof value === 'string' && value.trim(),
  )
  if (typeof source !== 'string') return []
  const name = source.split(/[\\/]/).at(-1)?.trim() ?? ''
  return name && !isInternalContextName(name) ? [name] : []
}

function isInternalContextName(name: string): boolean {
  return /agents\.md|system|prompt|skill|internal|mobilegatewayok/i.test(name)
}

const s = StyleSheet.create({
  tabs: {
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: mobileTheme.spacing.sm,
    paddingHorizontal: mobileTheme.spacing.sm,
  },
  tab: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.sm,
  },
  tabActive: { borderBottomColor: mobileTheme.colors.accent, borderBottomWidth: 2 },
  tabText: { color: mobileTheme.colors.inkMuted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: mobileTheme.colors.accentText },
  panelList: { gap: 10, padding: 14 },
  traceRow: { flexDirection: 'row', gap: 10 },
  traceIndex: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    marginTop: 2,
    width: 20,
  },
  traceBody: {
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: 3,
    paddingBottom: 12,
  },
  traceLabel: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '600' },
  traceDetail: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 18 },
  contextCompact: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  contextCompactRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  contextCompactText: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 12 },
  empty: { color: mobileTheme.colors.inkMuted, paddingVertical: 22, textAlign: 'center' },
  stats: { paddingHorizontal: 14, paddingVertical: 4 },
  statsText: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 20, textAlign: 'center' },
})
