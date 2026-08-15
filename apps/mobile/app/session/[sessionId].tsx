import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native'
import { MobileApi } from '@/api/mobile-api'
import { Screen } from '@/components/screen'
import { useConnectionStore } from '@/state/connection'

/** Presents one DSH conversation with native message composition and task cancellation. */
export default function SessionScreen(): React.JSX.Element {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()
  const connection = useConnectionStore(state => state.connection)
  const client = new MobileApi(requireConnection(connection))
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const history = useQuery({ queryKey: ['session-history', sessionId], queryFn: () => client.sessionHistory(sessionId) })
  const send = useMutation({
    mutationFn: (message: string) => client.sendMessage(sessionId, message),
    onSuccess: () => { setText(''); void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] }) },
    onError: error => Alert.alert('Message was not sent', error.message),
  })
  const cancel = useMutation({ mutationFn: () => client.cancelSession(sessionId), onError: error => Alert.alert('Task was not cancelled', error.message) })
  return <Screen>
    <Text style={styles.sessionId}>{sessionId}</Text>
    {history.isError ? <Text style={styles.error}>{history.error.message}</Text> : null}
    {(history.data?.items ?? []).map((item, index) => <View key={`${item.seq ?? index}`} style={styles.event}><Text style={styles.eventText}>{formatEvent(item.event)}</Text></View>)}
    <View style={styles.composer}>
      <TextInput multiline placeholder="Message DeepSeek Harness" style={styles.input} value={text} onChangeText={setText} />
      <View style={styles.actions}><Button title="Cancel task" color="#b91c1c" onPress={() => cancel.mutate()} /><Button title={send.isPending ? 'Sending…' : 'Send'} disabled={send.isPending || text.trim() === ''} onPress={() => send.mutate(text.trim())} /></View>
    </View>
  </Screen>
}

function requireConnection(connection: ReturnType<typeof useConnectionStore.getState>['connection']) {
  if (connection === undefined) throw new Error('Connect this mobile app to a desktop before opening a session.')
  return connection
}

function formatEvent(event: Record<string, unknown>): string {
  const type = typeof event.type === 'string' ? event.type : 'DSH event'
  const content = typeof event.content === 'string' ? event.content : undefined
  return content === undefined ? type : `${type}: ${content}`
}

const styles = StyleSheet.create({
  sessionId: { color: '#6b7280', fontSize: 12 },
  error: { color: '#b91c1c' },
  event: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14 },
  eventText: { color: '#1f2937', lineHeight: 21 },
  composer: { gap: 10, marginTop: 'auto' },
  input: { backgroundColor: '#ffffff', borderColor: '#d1d5db', borderRadius: 12, borderWidth: 1, minHeight: 96, padding: 12, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
})
