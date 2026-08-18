import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useEffect } from 'react'
import { useConnectionStore } from '@/state/connection'
import { mobileTheme } from '@/theme'
export default function IndexScreen(): React.JSX.Element {
  const connection = useConnectionStore(state => state.connection)
  const initialized = useConnectionStore(state => state.initialized)
  const initialize = useConnectionStore(state => state.initialize)
  useEffect(() => {
    void initialize()
  }, [initialize])
  if (!initialized)
    return (
      <View
        style={{
          alignItems: 'center',
          backgroundColor: mobileTheme.colors.background,
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={mobileTheme.colors.accent} />
      </View>
    )
  return <Redirect href={connection ? '/workspace' : '/connect'} />
}
