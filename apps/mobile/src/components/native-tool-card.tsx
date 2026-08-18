import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { NativeIcon, type NativeIconName } from '@/components/native-icon'
import { mobileTheme } from '@/theme'
import type { SharedMessagePresentation } from '@deepseek-ai/dsh-client-ui-shared'
type Variant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'web' | 'other'
function variantFor(name?: string): Variant {
  const value = (name ?? '').toLowerCase()
  if (/search|grep|find/.test(value)) return 'search'
  if (/read|file|cat/.test(value)) return 'read'
  if (/bash|shell|terminal|command/.test(value)) return 'bash'
  if (/write|create/.test(value)) return 'write'
  if (/edit|patch|replace/.test(value)) return 'edit'
  if (/code|python|javascript/.test(value)) return 'code'
  if (/web|browser|fetch/.test(value)) return 'web'
  return 'other'
}
const META: Record<Variant, [NativeIconName, string]> = {
  search: ['search', '搜索'],
  read: ['description', '读取'],
  bash: ['terminal', '命令'],
  write: ['note-add', '写入'],
  edit: ['edit', '编辑'],
  code: ['code', '代码'],
  web: ['language', '网页'],
  other: ['build', '工具'],
}
export function NativeToolCard({ presentation }: { presentation: SharedMessagePresentation }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [icon, title] = useMemo(() => META[variantFor(presentation.toolName)], [presentation.toolName])
  const state = presentation.toolState ?? 'running'
  const stateLabel = state === 'completed' ? '已完成' : state === 'failed' ? '失败' : '运行中'
  const summary = presentation.toolInput ?? presentation.text
  const details = [
    presentation.toolInput ? `输入\n${presentation.toolInput}` : '',
    presentation.toolOutput ? `输出\n${presentation.toolOutput}` : presentation.text,
  ]
    .filter(Boolean)
    .join('\n\n')
  const hasDetails = details.length > 0
  const header = (
    <>
      <View style={[styles.icon, state === 'failed' && styles.failedIcon]}>
        <NativeIcon
          name={icon}
          size={16}
          color={state === 'failed' ? mobileTheme.colors.danger : mobileTheme.colors.accent}
        />
      </View>
      <View style={styles.titleStack}>
        <Text style={styles.title}>{title}</Text>
        <Text numberOfLines={expanded ? undefined : 1} style={styles.summary}>
          {summary || '暂无输出摘要'}
        </Text>
      </View>
      <View style={styles.stateStack}>
        <View
          style={[
            styles.dot,
            state === 'completed' ? styles.doneDot : state === 'failed' ? styles.failDot : styles.runningDot,
          ]}
        />
        <Text
          style={[
            styles.state,
            state === 'completed' ? styles.doneText : state === 'failed' ? styles.failText : styles.runningText,
          ]}
        >
          {stateLabel}
        </Text>
        {hasDetails ? (
          <NativeIcon name={expanded ? 'expand-less' : 'expand-more'} size={16} color={mobileTheme.colors.inkFaint} />
        ) : null}
      </View>
    </>
  )
  return (
    <View style={[styles.card, state === 'failed' && styles.failedCard]}>
      {hasDetails ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}工具${stateLabel}`}
          accessibilityState={{ busy: state === 'running' }}
          onPress={() => setExpanded(value => !value)}
          style={styles.header}
        >
          {header}
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityLabel={`${title}工具${stateLabel}`}
          accessibilityState={{ busy: state === 'running' }}
          style={styles.header}
        >
          {header}
        </View>
      )}
      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.detailLabel}>详情</Text>
          <Text selectable style={styles.detailText}>
            {details}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...mobileTheme.elevation.card,
  },
  failedCard: { borderColor: '#f0b7b0' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: mobileTheme.spacing.sm,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.md,
    paddingVertical: mobileTheme.spacing.xs,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
    borderRadius: mobileTheme.radius.control,
    height: mobileTheme.touch.compactIconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.compactIconButton,
  },
  failedIcon: { backgroundColor: mobileTheme.colors.dangerSoft },
  titleStack: { flex: 1, gap: 2 },
  title: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '600' },
  summary: { color: mobileTheme.colors.inkMuted, fontSize: 12, lineHeight: 16 },
  stateStack: { alignItems: 'flex-end', gap: 2, minWidth: 68 },
  dot: { borderRadius: 4, height: 7, width: 7 },
  runningDot: { backgroundColor: mobileTheme.colors.warning },
  doneDot: { backgroundColor: mobileTheme.colors.success },
  failDot: { backgroundColor: mobileTheme.colors.danger },
  state: { color: mobileTheme.colors.inkMuted, fontSize: 9, fontWeight: '800' },
  runningText: { color: mobileTheme.colors.warningText },
  doneText: { color: mobileTheme.colors.successText },
  failText: { color: mobileTheme.colors.danger },
  details: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: mobileTheme.spacing.xs,
    padding: mobileTheme.spacing.md,
  },
  detailLabel: { color: mobileTheme.colors.inkMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  detailText: { color: mobileTheme.colors.ink, fontFamily: 'Menlo', fontSize: 12, lineHeight: 18 },
})
