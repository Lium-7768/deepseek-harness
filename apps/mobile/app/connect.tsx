import { router } from 'expo-router'
import { useState } from 'react'
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native'
import { Screen } from '@/components/screen'
import { useConnectionStore } from '@/state/connection'

/** Stores a credential obtained after the desktop application has approved device pairing. */
export default function ConnectScreen(): React.JSX.Element {
  const [gatewayUrl, setGatewayUrl] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const setConnection = useConnectionStore(state => state.setConnection)
  const connect = async (): Promise<void> => {
    try {
      new URL(gatewayUrl)
      if (deviceId.trim() === '' || accessToken.trim() === '') throw new Error('Enter the device id and access token approved by the desktop app.')
      await setConnection({ gatewayUrl: gatewayUrl.trim(), deviceId: deviceId.trim(), accessToken: accessToken.trim() })
      router.replace('/sessions')
    } catch (error) {
      Alert.alert('Connection details are invalid', error instanceof Error ? error.message : String(error))
    }
  }
  return <Screen>
    <Text style={styles.title}>Connect to your desktop</Text>
    <Text style={styles.copy}>
      Enter the Mobile Gateway address and the one-time device credential{' '}
      shown after you approve pairing on the desktop app.
    </Text>
    <View style={styles.form}>
      <TextInput autoCapitalize="none" autoCorrect={false} placeholder="https://mobile.example.com" style={styles.input} value={gatewayUrl} onChangeText={setGatewayUrl} />
      <TextInput autoCapitalize="none" autoCorrect={false} placeholder="Device id" style={styles.input} value={deviceId} onChangeText={setDeviceId} />
      <TextInput autoCapitalize="none" autoCorrect={false} placeholder="Access token" secureTextEntry style={styles.input} value={accessToken} onChangeText={setAccessToken} />
      <Button title="Connect" onPress={() => void connect()} />
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  title: { color: '#111827', fontSize: 28, fontWeight: '700' },
  copy: { color: '#4b5563', fontSize: 16, lineHeight: 23 },
  form: { gap: 12 },
  input: { backgroundColor: '#ffffff', borderColor: '#d1d5db', borderRadius: 10, borderWidth: 1, padding: 13 },
})
