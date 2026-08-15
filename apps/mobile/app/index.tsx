import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useConnectionStore } from '@/state/connection'

/** Restores an existing paired-device connection before selecting the first screen. */
export default function IndexScreen(): React.JSX.Element {
  const connection = useConnectionStore(state => state.connection)
  const initialized = useConnectionStore(state => state.initialized)
  const initialize = useConnectionStore(state => state.initialize)
  useEffect(() => { void initialize() }, [initialize])
  if (!initialized) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>
  return <Redirect href={connection === undefined ? '/connect' : '/sessions'} />
}
