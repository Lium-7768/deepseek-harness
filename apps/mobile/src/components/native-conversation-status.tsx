import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { NativeIcon } from '@/components/native-icon'
import type { NativeConversationRow } from '@/components/session-conversation-logic'
import { mobileTheme } from '@/theme'

type ReasoningRow = Extract<NativeConversationRow, { kind: 'reasoning' }>
type RetryRow = Extract<NativeConversationRow, { kind: 'retry' }>
type TurnErrorRow = Extract<NativeConversationRow, { kind: 'turn-error' }>

/**
 * Renders a desktop-style Think disclosure with its first line visible by default.
 *
 * @param props.row - Durable assistant reasoning projection.
 * @returns Expandable native Think row.
 */
export function NativeReasoningRow({ row }: { row: ReasoningRow }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const summary = useMemo(() => row.text.trim().split('\n')[0] ?? '', [row.text])
  return (
    <View style={s.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="查看 Think 内容"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={({ pressed }) => [s.disclosureHeader, pressed && s.pressed]}
      >
        <NativeIcon name="smart-toy" size={15} color={mobileTheme.colors.inkMuted} />
        <Text style={s.disclosureTitle}>Think</Text>
        <Text style={s.separator}>·</Text>
        <Text numberOfLines={1} style={s.disclosureSummary}>
          {summary}
        </Text>
        <NativeIcon name={expanded ? 'expand-less' : 'expand-more'} size={15} color={mobileTheme.colors.inkFaint} />
      </Pressable>
      {expanded ? <Text selectable style={s.disclosureBody}>{row.text}</Text> : null}
    </View>
  )
}

/**
 * Renders one durable desktop model-retry disclosure.
 *
 * @param props.row - Retry number, delay, and upstream failure projection.
 * @returns Expandable native retry row.
 */
export function NativeRetryRow({ row }: { row: RetryRow }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const seconds = Math.max(1, Math.ceil(row.delayMs / 1_000))
  return (
    <View style={s.retry}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`已重试模型请求，第 ${row.retry} 次`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={({ pressed }) => [s.retryHeader, pressed && s.pressed]}
      >
        <NativeIcon name="refresh" size={14} color={mobileTheme.colors.inkMuted} />
        <Text style={s.retryText}>{`已重试模型请求（${row.retry}/${row.maxRetries}）· ${seconds}s`}</Text>
        <NativeIcon name={expanded ? 'expand-less' : 'expand-more'} size={15} color={mobileTheme.colors.inkFaint} />
      </Pressable>
      {expanded ? (
        <View style={s.retryDetails}>
          <Text style={s.retryDetailLabel}>重试延迟</Text>
          <Text style={s.retryDetail}>{`${Math.round(row.delayMs)}ms`}</Text>
          <Text style={s.retryDetailLabel}>失败原因</Text>
          <Text selectable style={s.retryDetail}>{row.failureMessage}</Text>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Renders a durable turn-level error without converting it to assistant prose.
 *
 * @param props.row - Desktop turn error projection.
 * @returns Native turn error notice.
 */
export function NativeTurnErrorRow({ row }: { row: TurnErrorRow }): React.JSX.Element {
  return (
    <View accessibilityRole="alert" style={s.error}>
      <View style={s.errorDot} />
      <View style={s.errorCopy}>
        <Text style={s.errorTitle}>本回合执行失败</Text>
        <Text style={s.errorMessage}>{row.message}</Text>
      </View>
      {row.code ? <Text selectable style={s.errorCode}>{row.code}</Text> : null}
    </View>
  )
}

/**
 * Mirrors the desktop running-turn footer outside Markdown and tool rows.
 *
 * @param props.startedAt - Durable `turn/start` time when available.
 * @returns Native live turn status.
 */
export function NativeTurnStatus({ startedAt }: { startedAt?: number }): React.JSX.Element {
  const [mountedAt] = useState(() => Date.now())
  const anchor = startedAt ?? mountedAt
  const [elapsed, setElapsed] = useState(() => Math.max(0, Date.now() - anchor))
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.max(0, Date.now() - anchor)), 1_000)
    return () => clearInterval(timer)
  }, [anchor])
  const showClock = elapsed >= 15_000
  return (
    <View accessibilityLiveRegion="polite" style={s.turnStatus}>
      <Text style={s.turnStatusText}>Deep diving...</Text>
      {showClock ? <Text style={s.turnClock}>{formatDuration(elapsed)}</Text> : null}
    </View>
  )
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000)
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}分${seconds % 60}秒` : `${seconds}秒`
}

const s = StyleSheet.create({
  disclosure: { gap: 4 },
  disclosureHeader: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 30, paddingHorizontal: 1 },
  disclosureTitle: { color: mobileTheme.colors.inkMuted, fontSize: 12 },
  separator: { color: mobileTheme.colors.inkFaint, fontSize: 12 },
  disclosureSummary: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 12 },
  disclosureBody: { color: mobileTheme.colors.ink, fontSize: 13, lineHeight: 21, paddingHorizontal: 20, paddingVertical: 6 },
  retry: { gap: 4 },
  retryHeader: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 30, paddingHorizontal: 1 },
  retryText: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 12 },
  retryDetails: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: mobileTheme.radius.control,
    gap: 3,
    marginLeft: 20,
    padding: mobileTheme.spacing.sm,
  },
  retryDetailLabel: { color: mobileTheme.colors.inkFaint, fontSize: 10, fontWeight: '700' },
  retryDetail: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 18 },
  error: { alignItems: 'flex-start', backgroundColor: mobileTheme.colors.dangerSoft, borderRadius: mobileTheme.radius.control, flexDirection: 'row', gap: 8, padding: mobileTheme.spacing.sm },
  errorDot: { backgroundColor: mobileTheme.colors.danger, borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { color: mobileTheme.colors.danger, fontSize: 12, fontWeight: '700' },
  errorMessage: { color: mobileTheme.colors.danger, fontSize: 12, lineHeight: 18 },
  errorCode: { color: mobileTheme.colors.danger, fontFamily: 'Menlo', fontSize: 10 },
  turnStatus: { alignItems: 'center', flexDirection: 'row', gap: 6, paddingVertical: 4 },
  turnStatusText: { color: mobileTheme.colors.accentText, fontSize: 13, fontWeight: '600' },
  turnClock: { color: mobileTheme.colors.inkMuted, fontSize: 12 },
  pressed: { opacity: 0.62 },
})
