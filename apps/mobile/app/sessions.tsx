import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Button, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MobileApi } from '@/api/mobile-api'
import { Screen } from '@/components/screen'
import { useConnectionStore } from '@/state/connection'

/** Mirrors the DSH Web session sidebar as a native mobile list. */
export default function SessionsScreen(): React.JSX.Element {
  const connection = useConnectionStore(state => state.connection)
  const query = useQuery({
    queryKey: ['sessions', connection?.gatewayUrl, connection?.deviceId],
    queryFn: () => new MobileApi(requireConnection(connection)).listSessions(),
    enabled: connection !== undefined,
  })
  return <Screen>
    <View style={styles.header}><Text style={styles.title}>Sessions</Text><Button title="Settings" onPress={() => router.push('/settings')} /></View>
    {query.isError ? <Text style={styles.error}>{query.error.message}</Text> : null}
    <ScrollView refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} />}>
      {(query.data?.items ?? []).map(session => <Pressable key={session.sessionId} style={styles.card} onPress={() => router.push({ pathname: '/session/[sessionId]', params: { sessionId: session.sessionId } })}>
        <Text style={styles.sessionTitle}>{typeof session.title === 'string' && session.title !== '' ? session.title : 'Untitled session'}</Text>
        <Text style={styles.metadata}>{session.sessionId}</Text>
      </Pressable>)}
      {query.isSuccess && query.data.items.length === 0
        ? <Text style={styles.metadata}>No sessions are available from this desktop.</Text>
        : null}
    </ScrollView>
  </Screen>
}

function requireConnection(connection: ReturnType<typeof useConnectionStore.getState>['connection']) {
  if (connection === undefined) throw new Error('Connect this mobile app to a desktop before loading sessions.')
  return connection
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  card: { backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, gap: 5, marginBottom: 10, padding: 15 },
  sessionTitle: { color: '#111827', fontSize: 16, fontWeight: '600' },
  metadata: { color: '#6b7280', fontSize: 12 },
  error: { color: '#b91c1c' },
})
