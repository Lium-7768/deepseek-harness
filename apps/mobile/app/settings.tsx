import { router } from 'expo-router'
import { Alert, Button, StyleSheet, Text } from 'react-native'
import { Screen } from '@/components/screen'
import { useConnectionStore } from '@/state/connection'

/** Lets the user remove a local device credential after desktop-side revocation or replacement. */
export default function SettingsScreen(): React.JSX.Element {
  const connection = useConnectionStore(state => state.connection)
  const forgetConnection = useConnectionStore(state => state.forgetConnection)
  const disconnect = (): void => {
    Alert.alert('Forget this desktop?', 'This removes only the local mobile credential. Revoke the device from the desktop app to block future access.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: () => void forgetConnection().then(() => router.replace('/connect')) },
    ])
  }
  return <Screen>
    <Text style={styles.title}>Mobile connection</Text>
    <Text style={styles.label}>Gateway</Text><Text style={styles.value}>{connection?.gatewayUrl ?? 'Not connected'}</Text>
    <Text style={styles.label}>Device</Text><Text style={styles.value}>{connection?.deviceId ?? 'Not connected'}</Text>
    <Button title="Forget this desktop" color="#b91c1c" onPress={disconnect} />
  </Screen>
}

const styles = StyleSheet.create({
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  label: { color: '#6b7280', fontSize: 13, fontWeight: '600', marginTop: 10 },
  value: { color: '#111827', fontSize: 16 },
})
