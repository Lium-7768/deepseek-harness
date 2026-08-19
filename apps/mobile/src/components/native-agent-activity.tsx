import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { NativeIcon } from '@/components/native-icon'
import { mobileTheme } from '@/theme'
import type { MobileGoalRef, MobileGoalView, MobileJobView, MobileSubagentEntry } from '@/types/mobile'

type MobileChildSubagentEntry = Extract<MobileSubagentEntry, { kind: 'child' }>
type MobileContinuableSubagentEntry = MobileChildSubagentEntry & { mode: 'continuable' }

/** Reads the desktop-owned `goal` projection without creating a second mobile goal store. */
export function goalFromProjection(values: Record<string, unknown> | undefined): MobileGoalView | undefined {
  const projection = asRecord(values?.goal)
  const candidate = asRecord(projection?.goal) ?? projection
  if (candidate === undefined) return undefined
  const id = text(candidate.id)
  const objective = text(candidate.objective)
  const revision = candidate.revision
  const phase = candidate.phase
  if (id === undefined || objective === undefined || typeof revision !== 'number' || !Number.isInteger(revision)) return undefined
  if (phase !== 'active' && phase !== 'paused' && phase !== 'blocked' && phase !== 'complete') return undefined
  const blocked = asRecord(candidate.blockedReason)
  const blockedMessage = text(blocked?.message)
  return {
    id,
    revision,
    objective,
    phase,
    ...(blockedMessage === undefined ? {} : { blockedReason: { message: blockedMessage } }),
  }
}

/** Renders the desktop Goal projection and only forwards the Web GoalBar's four existing mutations. */
export function NativeGoalBar({
  goal,
  pending,
  onMutate,
}: {
  goal: MobileGoalView | undefined
  pending: boolean
  onMutate: (action: 'edit' | 'pause' | 'resume' | 'clear', ref: MobileGoalRef, objective?: string) => void
}): React.JSX.Element | null {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  useEffect(() => {
    setEditing(false)
    setDraft(goal?.objective ?? '')
  }, [goal?.id, goal?.objective])
  if (goal === undefined || goal.phase === 'complete') return null
  const ref = { id: goal.id, revision: goal.revision }
  const status = goal.phase === 'active' ? '执行中' : goal.phase === 'paused' ? '已暂停' : '已阻塞'
  const save = () => {
    const objective = draft.trim()
    if (objective === '') return
    onMutate('edit', ref, objective)
    setEditing(false)
  }
  return (
    <View style={[styles.goal, goal.phase === 'blocked' && styles.goalBlocked]}>
      <View style={styles.goalHeader}>
        <View style={styles.goalTitle}>
          <NativeIcon name="goal" size={16} color={mobileTheme.colors.accentText} />
          <Text style={styles.goalStatus}>{status}</Text>
        </View>
        <View style={styles.goalActions}>
          {goal.phase === 'active' ? (
            <GoalIconButton label="暂停目标" icon="stop" disabled={pending} onPress={() => onMutate('pause', ref)} />
          ) : goal.phase === 'paused' ? (
            <GoalIconButton label="继续目标" icon="arrow-forward" disabled={pending} onPress={() => onMutate('resume', ref)} />
          ) : null}
          <GoalIconButton label="编辑目标" icon="edit" disabled={pending} onPress={() => setEditing(current => !current)} />
          <GoalIconButton label="清除目标" icon="close" disabled={pending} onPress={() => onMutate('clear', ref)} />
        </View>
      </View>
      {editing ? (
        <View style={styles.editor}>
          <TextInput
            accessibilityLabel="目标内容"
            editable={!pending}
            multiline
            onChangeText={setDraft}
            style={styles.goalInput}
            value={draft}
          />
          <View style={styles.editorActions}>
            <Pressable accessibilityRole="button" disabled={pending} onPress={() => setEditing(false)} style={styles.textAction}>
              <Text style={styles.textActionLabel}>取消</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={pending || draft.trim() === ''} onPress={save} style={styles.textAction}>
              <Text style={[styles.textActionLabel, styles.textActionPrimary]}>保存</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.goalObjective}>{goal.objective}</Text>
      )}
      {goal.blockedReason?.message ? <Text style={styles.goalReason}>{goal.blockedReason.message}</Text> : null}
    </View>
  )
}

/** Displays the same host-owned job summary and direct-child catalog used by the desktop Web header. */
export function NativeAgentActivity({
  jobs,
  subagents,
  interruptingId,
  onOpenSubagent,
  onInterruptSubagent,
}: {
  jobs: MobileJobView[]
  subagents: MobileSubagentEntry[]
  interruptingId?: string
  onOpenSubagent: (entry: MobileChildSubagentEntry) => void
  onInterruptSubagent: (entry: MobileContinuableSubagentEntry) => void
}): React.JSX.Element | null {
  const children = subagents.filter((entry): entry is MobileChildSubagentEntry => entry.kind === 'child')
  const diagnostics = subagents.filter((entry): entry is Extract<MobileSubagentEntry, { kind: 'diagnostic' }> => entry.kind === 'diagnostic')
  if (jobs.length === 0 && children.length === 0 && diagnostics.length === 0) return null
  return (
    <View style={styles.activity}>
      {jobs.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>后台任务</Text>
          {jobs.map(job => <JobRow key={job.id} job={job} />)}
        </View>
      ) : null}
      {children.length > 0 || diagnostics.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>子 Agent</Text>
          {children.map(entry => (
            <View key={entry.id} style={styles.subagentRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`打开子 Agent：${entry.label ?? entry.id}`}
                onPress={() => onOpenSubagent(entry)}
                style={({ pressed }) => [styles.subagentMain, pressed && styles.pressed]}
              >
                <NativeIcon name="smart-toy" size={16} color={mobileTheme.colors.accentText} />
                <View style={styles.subagentCopy}>
                  <Text numberOfLines={1} style={styles.subagentLabel}>{entry.label ?? entry.id}</Text>
                  <Text style={styles.subagentMeta}>{entry.activity === 'running' ? '运行中' : '空闲'} · {entry.mode === 'continuable' ? '可继续' : '一次性'}</Text>
                </View>
                <NativeIcon name="chevron-right" size={16} color={mobileTheme.colors.inkMuted} />
              </Pressable>
              {entry.mode === 'continuable' && entry.activity === 'running' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`停止子 Agent：${entry.label ?? entry.id}`}
                  accessibilityState={{ busy: interruptingId === entry.id }}
                  disabled={interruptingId !== undefined}
                  onPress={() => onInterruptSubagent({ ...entry, mode: 'continuable' })}
                  style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
                >
                  <NativeIcon name="stop" size={14} color={mobileTheme.colors.danger} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {diagnostics.map(entry => <Text key={entry.id} style={styles.diagnostic}>子 Agent {entry.id} 当前不可用（{entry.reason}）。</Text>)}
        </View>
      ) : null}
    </View>
  )
}

function GoalIconButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string
  icon: 'stop' | 'arrow-forward' | 'edit' | 'close'
  disabled: boolean
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconAction, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <NativeIcon name={icon} size={15} color={mobileTheme.colors.inkMuted} />
    </Pressable>
  )
}

function JobRow({ job }: { job: MobileJobView }): React.JSX.Element {
  const live = job.status === 'running' || job.status === 'stopping'
  return (
    <View style={styles.jobRow}>
      <View style={[styles.dot, live ? styles.dotLive : styles.dotIdle]} />
      <View style={styles.jobCopy}>
        <Text numberOfLines={1} style={styles.jobLabel}>{job.label || job.kind}</Text>
        <Text numberOfLines={1} style={styles.jobMeta}>{job.detail ?? job.status}</Text>
      </View>
      <Text style={styles.jobKind}>{job.kind}</Text>
    </View>
  )
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

const styles = StyleSheet.create({
  goal: {
    backgroundColor: mobileTheme.colors.accentSoft,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  goalBlocked: { backgroundColor: mobileTheme.colors.warningSoft },
  goalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  goalTitle: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  goalStatus: { color: mobileTheme.colors.accentText, fontSize: 12, fontWeight: '700' },
  goalActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  iconAction: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  goalObjective: { color: mobileTheme.colors.ink, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  goalReason: { color: mobileTheme.colors.warning, fontSize: 12, lineHeight: 18 },
  editor: { gap: 8 },
  goalInput: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.borderStrong,
    borderRadius: mobileTheme.radius.control,
    borderWidth: 1,
    color: mobileTheme.colors.ink,
    minHeight: 70,
    padding: 9,
    textAlignVertical: 'top',
  },
  editorActions: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'flex-end' },
  textAction: { minHeight: mobileTheme.touch.minTarget, justifyContent: 'center', paddingHorizontal: 4 },
  textActionLabel: { color: mobileTheme.colors.inkMuted, fontSize: 13, fontWeight: '600' },
  textActionPrimary: { color: mobileTheme.colors.accentText },
  activity: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  section: { gap: 7 },
  sectionTitle: { color: mobileTheme.colors.inkMuted, fontSize: 12, fontWeight: '700' },
  jobRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 30 },
  dot: { borderRadius: 4, height: 7, width: 7 },
  dotLive: { backgroundColor: mobileTheme.colors.success },
  dotIdle: { backgroundColor: mobileTheme.colors.inkFaint },
  jobCopy: { flex: 1, gap: 1 },
  jobLabel: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '600' },
  jobMeta: { color: mobileTheme.colors.inkMuted, fontSize: 12 },
  jobKind: { color: mobileTheme.colors.inkFaint, fontSize: 11 },
  subagentRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  subagentMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minHeight: mobileTheme.touch.minTarget },
  subagentCopy: { flex: 1, gap: 1 },
  subagentLabel: { color: mobileTheme.colors.ink, fontSize: 13, fontWeight: '600' },
  subagentMeta: { color: mobileTheme.colors.inkMuted, fontSize: 12 },
  stopButton: { alignItems: 'center', height: mobileTheme.touch.iconButton, justifyContent: 'center', width: mobileTheme.touch.iconButton },
  diagnostic: { color: mobileTheme.colors.warning, fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.62 },
})
