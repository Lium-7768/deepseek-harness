import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { NativeIcon, type NativeIconName } from '@/components/native-icon'
import type { NativeConversationRow } from '@/components/session-conversation-logic'
import { mobileTheme } from '@/theme'
import type { SharedMessagePresentation } from '@deepseek-ai/dsh-client-ui-shared'

type Variant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'web' | 'other'
type ToolRow = Extract<NativeConversationRow, { kind: 'tool' }>
type ToolCardModel = {
  output?: string
  state: 'completed' | 'failed' | 'running'
  summary?: string
  toolInput?: string
  toolName: string
}

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
  other: ['sparkle', '工具'],
}

/**
 * Renders one desktop-derived tool lifecycle as a compact native conversation row.
 *
 * @param props.presentation - Legacy shared projection used by the subagent view.
 * @param props.row - Full primary-session projection with desktop tool metadata.
 * @returns An expandable compact tool row.
 */
export function NativeToolCard({ presentation, row }: { presentation?: SharedMessagePresentation; row?: ToolRow }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const model = useMemo<ToolCardModel>(() => {
    if (row !== undefined) {
      return {
        state: row.state,
        toolName: row.toolName,
        ...(row.summary === undefined ? {} : { summary: row.summary }),
        ...(row.toolInput === undefined ? {} : { toolInput: row.toolInput }),
        ...(row.output === undefined ? {} : { output: row.output }),
      }
    }
    return {
      state: presentation?.toolState ?? 'running',
      toolName: presentation?.toolName ?? '工具调用',
      ...(presentation?.toolInput === undefined ? {} : { toolInput: presentation.toolInput }),
      ...(presentation?.toolOutput === undefined ? {} : { output: presentation.toolOutput }),
      ...(presentation?.text ? { summary: presentation.text } : {}),
    }
  }, [presentation, row])
  const [icon, fallbackTitle] = useMemo(() => META[variantFor(model.toolName)], [model.toolName])
  const title = model.toolName || fallbackTitle
  const stateLabel = model.state === 'completed' ? '已完成' : model.state === 'failed' ? '失败' : '运行中'
  const hasDetails = Boolean(model.toolInput || model.output)
  return (
    <View style={[styles.root, model.state === 'failed' && styles.failedRoot]}>
      <Pressable
        accessibilityRole={hasDetails ? 'button' : undefined}
        accessibilityLabel={`${title}工具${stateLabel}`}
        accessibilityState={{ busy: model.state === 'running', expanded: hasDetails ? expanded : undefined }}
        disabled={!hasDetails}
        onPress={() => setExpanded(value => !value)}
        style={({ pressed }) => [styles.row, hasDetails && pressed && styles.pressed]}
      >
        <NativeIcon name={icon} size={15} color={model.state === 'failed' ? mobileTheme.colors.danger : mobileTheme.colors.inkMuted} />
        <Text numberOfLines={1} style={styles.label}>
          Tool call
        </Text>
        <Text style={styles.separator}>·</Text>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {model.summary ? (
          <>
            <Text style={styles.separator}>·</Text>
            <Text numberOfLines={1} style={styles.summary}>
              {model.summary}
            </Text>
          </>
        ) : null}
        <View style={styles.state}>
          <View
            style={[
              styles.dot,
              model.state === 'completed' ? styles.completedDot : model.state === 'failed' ? styles.failedDot : styles.runningDot,
            ]}
          />
          {hasDetails ? <NativeIcon name={expanded ? 'expand-less' : 'expand-more'} size={15} color={mobileTheme.colors.inkFaint} /> : null}
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.details}>
          {model.toolInput ? <ToolPayload label="IN" text={model.toolInput} /> : null}
          {model.toolInput && model.output ? <View style={styles.divider} /> : null}
          {model.output ? <ToolPayload label="OUT" text={model.output} failed={model.state === 'failed'} /> : null}
        </View>
      ) : null}
    </View>
  )
}

function ToolPayload({ label, text, failed = false }: { label: 'IN' | 'OUT'; text: string; failed?: boolean }): React.JSX.Element {
  return (
    <View style={styles.payload}>
      <Text style={styles.payloadLabel}>{label}</Text>
      <ScrollView nestedScrollEnabled style={styles.payloadScroll} showsVerticalScrollIndicator>
        <Text selectable style={[styles.detailText, failed && styles.failedDetailText]}>
          {text}
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { borderLeftColor: 'transparent', borderLeftWidth: 2 },
  failedRoot: { borderLeftColor: mobileTheme.colors.danger },
  row: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 32, paddingHorizontal: 2, paddingVertical: 4 },
  pressed: { opacity: 0.62 },
  label: { color: mobileTheme.colors.inkMuted, fontSize: 12 },
  separator: { color: mobileTheme.colors.inkFaint, fontSize: 12 },
  title: { color: mobileTheme.colors.inkMuted, fontSize: 12 },
  summary: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 12 },
  state: { alignItems: 'center', flexDirection: 'row', gap: 4, marginLeft: 'auto' },
  dot: { borderRadius: 4, height: 7, width: 7 },
  runningDot: { backgroundColor: mobileTheme.colors.warning },
  completedDot: { backgroundColor: mobileTheme.colors.success },
  failedDot: { backgroundColor: mobileTheme.colors.danger },
  details: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: mobileTheme.radius.control,
    marginBottom: 6,
    marginLeft: 20,
    padding: mobileTheme.spacing.sm,
  },
  divider: { backgroundColor: mobileTheme.colors.border, height: StyleSheet.hairlineWidth },
  payload: { gap: 4 },
  payloadLabel: { color: mobileTheme.colors.inkFaint, fontSize: 10, fontWeight: '800' },
  payloadScroll: { maxHeight: 208 },
  detailText: { color: mobileTheme.colors.ink, fontFamily: 'Menlo', fontSize: 12, lineHeight: 18 },
  failedDetailText: { color: mobileTheme.colors.danger },
})
