import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { mobileTheme } from '@/theme'
import { NativeActionButton } from '@/components/native-action-button'
import { WorkspaceShell } from '@/components/workspace-shell'
import { workspaceKeyboardVerticalOffset } from '@/components/workspace-shell-logic'
import { NativeIcon } from '@/components/native-icon'
import { NativeMarkdown } from '@/components/native-markdown'
import {
  interactionListState,
  questionOptionAccessibility,
  type InteractionListState,
} from '@/components/interaction-state'
import { useConnectionStore } from '@/state/connection'
import { useRouteSessionSelection } from '@/state/session-selection'
import type {
  DshQuestion,
  PendingApprovalInteraction,
  PendingInteraction,
  PendingQuestionInteraction,
} from '@/types/mobile'

type AnswerDraft = Record<string, { selected: string[]; custom: string }>
type RespondHandler = (rpcId: string, result: unknown) => void

type InteractionCardProps = {
  interaction: PendingInteraction
  submitting: boolean
  onRespond: RespondHandler
}

type ApprovalCardProps = {
  interaction: PendingApprovalInteraction
  submitting: boolean
  onRespond: RespondHandler
}

type QuestionCardProps = {
  interaction: PendingQuestionInteraction
  submitting: boolean
  onRespond: RespondHandler
}

/** Presents current DSH approvals and questions as native, session-scoped controls. */
export default function InteractionsScreen(): React.JSX.Element {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const insets = useSafeAreaInsets()
  useRouteSessionSelection(typeof sessionId === 'string' ? sessionId : undefined)
  const connection = useConnectionStore(state => state.connection)
  const client = connection === undefined ? undefined : new MobileApi(connection)
  const queryClient = useQueryClient()
  const interactions = useQuery({
    queryKey: ['session-interactions', sessionId],
    enabled: client !== undefined && typeof sessionId === 'string' && sessionId.length > 0,
    queryFn: () => requireClient(client).pendingInteractions(requireSessionId(sessionId)),
  })
  const respond = useMutation({
    mutationFn: ({ rpcId, result }: { rpcId: string; result: unknown }) =>
      requireClient(client).respondToInteraction(rpcId, result),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session-interactions', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['session-events', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] })
    },
    onError: error => Alert.alert('响应发送失败', withErrorContext('无法发送响应', error)),
  })
  const listState = interactionListState({
    hasConnection: connection !== undefined,
    hasSessionId: typeof sessionId === 'string' && sessionId.length > 0,
    isLoading: interactions.isLoading,
    isError: interactions.isError,
    hasItems: (interactions.data?.items.length ?? 0) > 0,
  })

  return (
    <WorkspaceShell
      title="待处理操作"
      showMenu={false}
      leftAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回会话"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
        >
          <NativeIcon name="arrow-back" color={mobileTheme.colors.ink} size={20} />
        </Pressable>
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? workspaceKeyboardVerticalOffset(insets.top, false) : 0}
        style={styles.container}
      >
        <FlatList
          style={styles.container}
          data={interactions.data?.items ?? []}
          keyExtractor={interaction => interaction.rpcId}
          renderItem={({ item }) => (
            <InteractionCard
              interaction={item}
              submitting={respond.isPending}
              onRespond={(rpcId, result) => respond.mutate({ rpcId, result })}
            />
          )}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={interactions.isRefetching}
              onRefresh={() => void interactions.refetch()}
              tintColor={mobileTheme.colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={styles.title}>处理待办操作</Text>
              <Text style={styles.description}>以下请求来自已配对的桌面端 DSH 运行时。请查看详情后再响应。</Text>
            </View>
          }
          ListEmptyComponent={<InteractionListStateView query={interactions} state={listState} />}
        />
      </KeyboardAvoidingView>
    </WorkspaceShell>
  )
}

function InteractionListStateView({
  query,
  state,
}: {
  query: { error: Error | null; refetch: () => Promise<unknown> }
  state: InteractionListState
}): React.JSX.Element | null {
  if (state === 'ready') return null
  if (state === 'disconnected')
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>尚未连接桌面端</Text>
        <Text style={styles.emptyText}>请先完成配对，再查看待处理操作。</Text>
        <NativeActionButton label="去连接" icon="link" onPress={() => router.replace('/connect')} />
      </View>
    )
  if (state === 'invalid-session')
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>会话标识无效</Text>
        <Text style={styles.emptyText}>返回会话后重试。</Text>
        <NativeActionButton label="返回会话" icon="arrow-back" variant="secondary" onPress={() => router.back()} />
      </View>
    )
  if (state === 'loading')
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={mobileTheme.colors.accent} />
        <Text style={styles.emptyText}>正在加载待处理操作…</Text>
      </View>
    )
  if (state === 'error')
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>加载失败</Text>
        <Text style={styles.error}>{withErrorContext('待处理操作加载失败', query.error)}</Text>
        <NativeActionButton label="重新加载" icon="refresh" variant="secondary" onPress={() => void query.refetch()} />
      </View>
    )
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>暂无待处理操作</Text>
      <Text style={styles.emptyText}>新的权限请求或问题会显示在这里。</Text>
    </View>
  )
}

function InteractionCard({ interaction, submitting, onRespond }: InteractionCardProps): React.JSX.Element {
  if (interaction.type === 'approval/requested') {
    return <ApprovalCard interaction={interaction} submitting={submitting} onRespond={onRespond} />
  }
  return <QuestionCard interaction={interaction} submitting={submitting} onRespond={onRespond} />
}

function ApprovalCard({ interaction, submitting, onRespond }: ApprovalCardProps): React.JSX.Element {
  const { payload } = interaction
  const reason = payload.reason ?? 'DSH 请求使用此工具的权限。'
  const answer = (outcome: 'allowed-once' | 'rejected') => {
    onRespond(interaction.rpcId, {
      ok: true,
      value: {
        sessionId: interaction.sessionId,
        approvalId: payload.approvalId,
        outcome,
      },
    })
  }
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>权限请求</Text>
      <Text style={styles.cardTitle}>{payload.toolName}</Text>
      <Text style={styles.body}>{reason}</Text>
      <Text style={styles.metadata}>请求 {payload.approvalId}</Text>
      <View style={styles.buttonRow}>
        <NativeActionButton
          label="拒绝"
          icon="close"
          variant="danger"
          disabled={submitting}
          onPress={() => answer('rejected')}
          style={styles.approvalButton}
        />
        <NativeActionButton
          label="仅允许一次"
          icon="check"
          disabled={submitting}
          onPress={() => answer('allowed-once')}
          style={styles.approvalButton}
        />
      </View>
    </View>
  )
}

function QuestionCard({ interaction, submitting, onRespond }: QuestionCardProps): React.JSX.Element {
  const [draft, setDraft] = useState<AnswerDraft>({})
  const questions = interaction.payload.questions
  const review = planReviewOf(questions)
  if (review !== undefined)
    return <PlanReviewCard interaction={interaction} review={review} submitting={submitting} onRespond={onRespond} />
  const complete = useMemo(
    () =>
      questions.every((question) => {
        const answer = draft[question.id]
        return answer !== undefined && (answer.selected.length > 0 || answer.custom.trim() !== '')
      }),
    [draft, questions],
  )
  const update = (questionId: string, value: Partial<AnswerDraft[string]>) => {
    setDraft(current => ({
      ...current,
      [questionId]: {
        selected: current[questionId]?.selected ?? [],
        custom: current[questionId]?.custom ?? '',
        ...value,
      },
    }))
  }
  const toggleOption = (question: DshQuestion, label: string) => {
    const selected = draft[question.id]?.selected ?? []
    const nextSelected = question.multiSelect
      ? selected.includes(label)
        ? selected.filter(item => item !== label)
        : [...selected, label]
      : [label]
    update(question.id, { selected: nextSelected })
  }
  const submit = () =>
    onRespond(interaction.rpcId, {
      ok: true,
      value: {
        sessionId: interaction.sessionId,
        answer: {
          answers: questions.map((question) => {
            const answer = draft[question.id] ?? { selected: [], custom: '' }
            return {
              id: question.id,
              selected: answer.selected,
              ...(answer.custom.trim() === '' ? {} : { custom: answer.custom.trim() }),
            }
          }),
        },
      },
    })
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>问题</Text>
      {questions.map(question => (
        <View key={question.id} style={styles.question}>
          {question.header !== undefined ? <Text style={styles.questionHeader}>{question.header}</Text> : null}
          <Text style={styles.cardTitle}>{question.question}</Text>
          {question.detail !== undefined ? <Text style={styles.body}>{question.detail}</Text> : null}
          {(question.options ?? []).map((option) => {
            const active = (draft[question.id]?.selected ?? []).includes(option.label)
            const accessibility = questionOptionAccessibility({
              multiSelect: question.multiSelect === true,
              selected: active,
              submitting,
            })
            return (
              <Pressable
                key={option.label}
                accessibilityRole={accessibility.role}
                accessibilityLabel={`${option.label}${active ? '，已选中' : ''}`}
                accessibilityState={accessibility.state}
                disabled={accessibility.disabled}
                style={[styles.option, active ? styles.optionActive : undefined]}
                onPress={() => toggleOption(question, option.label)}
              >
                <Text style={[styles.optionLabel, active ? styles.optionLabelActive : undefined]}>{option.label}</Text>
                {option.description !== undefined ? (
                  <Text style={styles.optionDescription}>{option.description}</Text>
                ) : null}
              </Pressable>
            )
          })}
          <TextInput
            accessibilityLabel={`自定义回答：${question.question}`}
            editable={!submitting}
            multiline
            placeholder="可选：输入自定义回答"
            style={styles.customAnswer}
            value={draft[question.id]?.custom ?? ''}
            onChangeText={custom => update(question.id, { custom })}
          />
        </View>
      ))}
      <NativeActionButton
        label={submitting ? '发送中…' : '发送响应'}
        icon="send"
        loading={submitting}
        disabled={!complete}
        onPress={submit}
      />
    </View>
  )
}

type PlanReview = {
  id: string
  question: string
  plan: string
  approve: string
  decline?: string
}

function planReviewOf(questions: DshQuestion[]): PlanReview | undefined {
  if (questions.length !== 1) return undefined
  const question = questions[0]
  if (question === undefined || question.intent?.kind !== 'plan-review' || question.detail === undefined || question.multiSelect === true)
    return undefined
  const options = question.options ?? []
  if (options.length > 2 || question.intent.approve === undefined) return undefined
  const approve = options.find(option => option.label === question.intent?.approve)?.label
  if (approve === undefined) return undefined
  const decline = options.find(option => option.label !== approve)?.label
  return { id: question.id, question: question.question, plan: question.detail, approve, ...(decline === undefined ? {} : { decline }) }
}

function PlanReviewCard({
  interaction,
  review,
  submitting,
  onRespond,
}: {
  interaction: PendingQuestionInteraction
  review: PlanReview
  submitting: boolean
  onRespond: RespondHandler
}): React.JSX.Element {
  const answer = (selected: string) =>
    onRespond(interaction.rpcId, {
      ok: true,
      value: { sessionId: interaction.sessionId, answer: { answers: [{ id: review.id, selected: [selected] }] } },
    })
  const discuss = () =>
    onRespond(interaction.rpcId, {
      ok: false,
      error: { code: 'cancelled', message: 'the user opened plan discussion', details: {} },
    })
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>计划审阅</Text>
      <Text style={styles.cardTitle}>{review.question}</Text>
      <NativeMarkdown markdown={review.plan} />
      <View style={styles.buttonRow}>
        <NativeActionButton
          label="讨论"
          icon="chat"
          variant="secondary"
          disabled={submitting}
          onPress={discuss}
          style={styles.approvalButton}
        />
        {review.decline !== undefined ? (
          <NativeActionButton
            label={review.decline}
            icon="close"
            variant="danger"
            disabled={submitting}
            onPress={() => answer(review.decline as string)}
            style={styles.approvalButton}
          />
        ) : null}
        <NativeActionButton
          label={review.approve}
          icon="check"
          disabled={submitting}
          onPress={() => answer(review.approve)}
          style={styles.approvalButton}
        />
      </View>
    </View>
  )
}

function requireClient(client: MobileApi | undefined): MobileApi {
  if (client === undefined) throw new Error('请先将此移动端连接到桌面端，再查看待处理操作。')
  return client
}

function requireSessionId(sessionId: string | string[] | undefined): string {
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('缺少会话标识，无法加载待处理操作。')
  return sessionId
}

function withErrorContext(prefix: string, error: unknown): string {
  const detail = mobileErrorMessage(error, '请稍后重试。')
  return `${prefix}：${detail}`
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { flexGrow: 1, gap: 12, padding: 16, paddingBottom: 28 },
  intro: { gap: 8 },
  headerAction: {
    alignItems: 'center',
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.iconButton,
  },
  title: { color: mobileTheme.colors.ink, fontSize: 28, fontWeight: '700' },
  description: { color: mobileTheme.colors.inkMuted, lineHeight: 21 },
  error: { color: mobileTheme.colors.danger },
  card: {
    ...mobileTheme.elevation.card,
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  kicker: { color: '#92400e', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: { color: '#111827', fontSize: 17, fontWeight: '700', lineHeight: 23 },
  body: { color: '#374151', lineHeight: 21 },
  metadata: { color: '#6b7280', fontSize: 12 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  approvalButton: { flex: 1, paddingHorizontal: 8 },
  question: {
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    paddingTop: 14,
  },
  questionHeader: { color: '#6b7280', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  option: {
    borderColor: mobileTheme.colors.borderStrong,
    borderRadius: mobileTheme.radius.control,
    borderWidth: 1,
    gap: 3,
    padding: 11,
  },
  optionActive: { backgroundColor: mobileTheme.colors.accentSoft, borderColor: mobileTheme.colors.accent },
  optionLabel: { color: '#1f2937', fontWeight: '600' },
  optionLabelActive: { color: '#1d4ed8' },
  optionDescription: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  customAnswer: {
    borderColor: '#d1d5db',
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 74,
    padding: 10,
    textAlignVertical: 'top',
  },
  empty: {
    alignItems: 'stretch',
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#4b5563', lineHeight: 21 },
  pressed: { opacity: 0.62 },
})
