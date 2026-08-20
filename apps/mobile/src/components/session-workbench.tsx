import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { NativeIcon, type NativeIconName } from '@/components/native-icon'
import {
  formatTrajectoryDuration,
  projectNativeTrajectoryActivities,
  type NativeTrajectoryActivity,
} from '@/components/session-trajectory-logic'
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

/**
 * Native counterpart to the desktop trajectory ledger. It projects durable
 * session events into compact operations rather than exposing wire-event names.
 */
export function TrajectoryPanel({ items }: { items: SharedEventItem[] }): React.JSX.Element {
  const activities = projectNativeTrajectoryActivities(items)
  return (
    <FlatList
      data={activities}
      keyExtractor={activity => activity.id}
      contentContainerStyle={s.panelList}
      renderItem={({ item }) => <TrajectoryActivityRow activity={item} />}
      ListEmptyComponent={<Text style={s.empty}>该会话尚无可展示的操作轨迹。</Text>}
    />
  )
}

function TrajectoryActivityRow({ activity }: { activity: NativeTrajectoryActivity }): React.JSX.Element {
  const stateLabel = activityStateLabel(activity)
  const detailLabel = activity.detail === undefined ? '' : `：${activity.detail}`
  const durationLabel = activity.durationMs === undefined ? '' : `，耗时 ${formatTrajectoryDuration(activity.durationMs)}`
  return (
    <View accessibilityLabel={`${activity.title}${stateLabel}${detailLabel}${durationLabel}`} style={s.activityWrap}>
      {activity.showTurn === true && activity.turn !== undefined ? (
        <Text style={s.turnLabel}>第 {activity.turn} 轮</Text>
      ) : null}
      <View style={s.activityRow}>
        <View style={[s.traceIndex, activity.state === 'failed' && s.traceIndexFailed]}>
          <NativeIcon name={activityIcon(activity)} size={13} color={activityColor(activity)} />
        </View>
        <View style={s.traceBody}>
          <View style={s.activityTitleRow}>
            <Text style={s.traceLabel}>{activity.title}</Text>
            {stateLabel ? <Text style={[s.state, activity.state === 'failed' && s.stateFailed]}>{stateLabel}</Text> : null}
          </View>
          {activity.detail ? (
            <Text selectable numberOfLines={3} style={s.traceDetail}>
              {activity.detail}
            </Text>
          ) : null}
        </View>
        {activity.durationMs !== undefined ? <Text style={s.duration}>{formatTrajectoryDuration(activity.durationMs)}</Text> : null}
      </View>
    </View>
  )
}

function activityIcon(activity: NativeTrajectoryActivity): NativeIconName {
  switch (activity.kind) {
    case 'assistant': return 'smart-toy'
    case 'compaction': return 'data'
    case 'context': return 'description'
    case 'error': return 'warning-amber'
    case 'question': return 'warning-amber'
    case 'reasoning': return 'think'
    case 'retry': return 'refresh'
    case 'tool': return 'build'
    case 'user': return 'chat-bubble-outline'
  }
}

function activityColor(activity: NativeTrajectoryActivity): string {
  if (activity.state === 'failed' || activity.kind === 'error') return mobileTheme.colors.danger
  if (activity.kind === 'question') return mobileTheme.colors.warning
  return mobileTheme.colors.accentText
}

function activityStateLabel(activity: NativeTrajectoryActivity): string | undefined {
  if (activity.state === 'running') return '进行中'
  if (activity.state === 'failed') return '失败'
  if (activity.kind === 'tool' && activity.state === 'completed') return '已完成'
  return undefined
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
  panelList: { gap: 8, padding: 14 },
  activityWrap: { gap: 5 },
  turnLabel: { color: mobileTheme.colors.inkMuted, fontSize: 12, fontWeight: '600', paddingLeft: 30 },
  activityRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  traceIndex: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
    borderRadius: 10,
    flexShrink: 0,
    height: 20,
    justifyContent: 'center',
    marginTop: 2,
    width: 20,
  },
  traceIndexFailed: { backgroundColor: mobileTheme.colors.dangerSoft },
  traceBody: {
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexShrink: 1,
    gap: 3,
    minWidth: 0,
    paddingBottom: 12,
  },
  activityTitleRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  traceLabel: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '600' },
  traceDetail: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 18 },
  state: { color: mobileTheme.colors.inkMuted, fontSize: 11, fontWeight: '500' },
  stateFailed: { color: mobileTheme.colors.danger },
  duration: { color: mobileTheme.colors.inkMuted, fontSize: 11, lineHeight: 20 },
  contextCompact: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  contextCompactRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  contextCompactText: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 12 },
  empty: { color: mobileTheme.colors.inkMuted, paddingVertical: 22, textAlign: 'center' },
})
