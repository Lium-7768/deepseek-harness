import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { useState } from 'react'

/** Supplies one query cache and the native navigation stack for DSH mobile flows. */
export default function RootLayout(): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ title: 'Connect desktop' }} />
        <Stack.Screen name="sessions" options={{ title: 'Sessions' }} />
        <Stack.Screen name="session/[sessionId]" options={{ title: 'Session' }} />
        <Stack.Screen name="settings" options={{ title: 'Connection settings' }} />
      </Stack>
    </QueryClientProvider>
  )
}
