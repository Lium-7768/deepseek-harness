import 'react-native-gesture-handler'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Drawer } from 'expo-router/drawer'
import { ActivityIndicator, View, useWindowDimensions } from 'react-native'
import { useEffect, useState } from 'react'
import { MobileSyncBridge } from '@/components/mobile-sync-bridge'
import { useConnectionStore } from '@/state/connection'
import { SessionDrawer } from '@/components/session-drawer'
import { drawerWidthForViewport } from '@/components/session-drawer-logic'
import { mobileTheme } from '@/theme'

export default function RootLayout(): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  const initialized = useConnectionStore(state => state.initialized)
  const initialize = useConnectionStore(state => state.initialize)
  const { width } = useWindowDimensions()
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
  return (
    <QueryClientProvider client={queryClient}>
      <MobileSyncBridge />
      <Drawer
        drawerContent={props => <SessionDrawer {...props} />}
        screenOptions={{
          headerShown: false,
          drawerPosition: 'left',
          drawerType: 'front',
          drawerStyle: { backgroundColor: mobileTheme.colors.drawerBackground, width: drawerWidthForViewport(width) },
          overlayColor: 'rgba(17, 24, 39, 0.34)',
          drawerItemStyle: { display: 'none' },
        }}
      >
        <Drawer.Screen name="index" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="workspace" />
        <Drawer.Screen name="connect" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="connect/scan" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="sessions" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="session/[sessionId]" />
        <Drawer.Screen name="session/[sessionId]/interactions" />
        <Drawer.Screen name="session/[sessionId]/mode" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="session/[sessionId]/model" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="session/[sessionId]/permission" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="session/[sessionId]/rename" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="session/[sessionId]/subagent" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="workspace/[workspaceId]/rename" options={{ swipeEnabled: false }} />
        <Drawer.Screen name="settings" />
      </Drawer>
    </QueryClientProvider>
  )
}
