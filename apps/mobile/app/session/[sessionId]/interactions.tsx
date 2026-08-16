import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MobileApi } from '@/api/mobile-api'
import { Screen } from '@/components/screen'
import { useConnectionStore } from '@/state/connection'
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
  const connection = useConnectionStore(state => state.connection)
  const client = new MobileApi(requireConnection(connection))
  const queryClient = useQueryClient()
  const interactions = useQuery({
    queryKey: ['session-interactions', sessionId],
    queryFn: () => client.pendingInteractions(sessionId),
    refetchInterval: 2500,
  })
  const respond = useMutation({
    mutationFn: ({ rpcId, result }: { rpcId: string; result: unknown }) => client.respondToInteraction(rpcId, result),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['session-interactions', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['session-events', sessionId] })
      void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] })
    },
    onError: error => Alert.alert('Response was not sent', error.message),
  })

  return (
    <Screen>
      <Text style={styles.title}>Review action</Text>
      <Text style={styles.description}>
        These requests come from your paired desktop DSH runtime. Respond only after reviewing the details.
      </Text>
      {interactions.isError ? <Text style={styles.error}>{interactions.error.message}</Text> : null}
      {(interactions.data?.items ?? []).map(interaction => (
        <InteractionCard
          key={interaction.rpcId}
          interaction={interaction}
          submitting={respond.isPending}
          onRespond={(rpcId, result) => respond.mutate({ rpcId, result })}
        />
      ))}
      {interactions.isSuccess && interactions.data.items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing needs your response</Text>
          <Text style={styles.emptyText}>Return to the session to continue following the conversation.</Text>
          <Button title="Back to session" onPress={() => router.back()} />
        </View>
      ) : null}
    </Screen>
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
  const reason = payload.reason ?? 'DSH requested permission to use this tool.'
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
      <Text style={styles.kicker}>Approval request</Text>
      <Text style={styles.cardTitle}>{payload.toolName}</Text>
      <Text style={styles.body}>{reason}</Text>
      <Text style={styles.metadata}>Request {payload.approvalId}</Text>
      <View style={styles.buttonRow}>
        <Button title="Reject" color="#b91c1c" disabled={submitting} onPress={() => answer('rejected')} />
        <Button title="Allow once" disabled={submitting} onPress={() => answer('allowed-once')} />
      </View>
    </View>
  )
}

function QuestionCard({ interaction, submitting, onRespond }: QuestionCardProps): React.JSX.Element {
  const [draft, setDraft] = useState<AnswerDraft>({})
  const questions = interaction.payload.questions
  const complete = useMemo(
    () => questions.every((question) => {
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
      ? (selected.includes(label) ? selected.filter(item => item !== label) : [...selected, label])
      : [label]
    update(question.id, { selected: nextSelected })
  }
  const submit = () => onRespond(interaction.rpcId, {
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
      <Text style={styles.kicker}>Question from DSH</Text>
      {questions.map(question => (
        <View key={question.id} style={styles.question}>
          {question.header !== undefined ? <Text style={styles.questionHeader}>{question.header}</Text> : null}
          <Text style={styles.cardTitle}>{question.question}</Text>
          {question.detail !== undefined ? <Text style={styles.body}>{question.detail}</Text> : null}
          {(question.options ?? []).map((option) => {
            const active = (draft[question.id]?.selected ?? []).includes(option.label)
            return (
              <Pressable
                key={option.label}
                accessibilityRole="button"
                style={[styles.option, active ? styles.optionActive : undefined]}
                onPress={() => toggleOption(question, option.label)}
              >
                <Text style={[styles.optionLabel, active ? styles.optionLabelActive : undefined]}>{option.label}</Text>
                {option.description !== undefined ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
              </Pressable>
            )
          })}
          <TextInput
            multiline
            placeholder="Optional custom answer"
            style={styles.customAnswer}
            value={draft[question.id]?.custom ?? ''}
            onChangeText={custom => update(question.id, { custom })}
          />
        </View>
      ))}
      <Button title={submitting ? 'Sending…' : 'Send response'} disabled={submitting || !complete} onPress={submit} />
    </View>
  )
}

function requireConnection(connection: ReturnType<typeof useConnectionStore.getState>['connection']) {
  if (connection === undefined) throw new Error('Connect this mobile app to a desktop before reviewing interactions.')
  return connection
}

const styles = StyleSheet.create({
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  description: { color: '#4b5563', lineHeight: 21 },
  error: { color: '#b91c1c' },
  card: { backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, gap: 10, padding: 16 },
  kicker: { color: '#92400e', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  cardTitle: { color: '#111827', fontSize: 17, fontWeight: '700', lineHeight: 23 },
  body: { color: '#374151', lineHeight: 21 },
  metadata: { color: '#6b7280', fontSize: 12 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  question: { borderTopColor: '#e5e7eb', borderTopWidth: 1, gap: 8, paddingTop: 14 },
  questionHeader: { color: '#6b7280', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  option: { borderColor: '#d1d5db', borderRadius: 10, borderWidth: 1, gap: 3, padding: 11 },
  optionActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  optionLabel: { color: '#1f2937', fontWeight: '600' },
  optionLabelActive: { color: '#1d4ed8' },
  optionDescription: { color: '#6b7280', fontSize: 13, lineHeight: 18 },
  customAnswer: { borderColor: '#d1d5db', borderRadius: 10, borderWidth: 1, minHeight: 74, padding: 10, textAlignVertical: 'top' },
  empty: { alignItems: 'stretch', backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, gap: 10, padding: 18 },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '700' },
  emptyText: { color: '#4b5563', lineHeight: 21 },
})
