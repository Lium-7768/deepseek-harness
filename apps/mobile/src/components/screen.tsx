import type { PropsWithChildren } from 'react'
import { SafeAreaView, ScrollView, StyleSheet } from 'react-native'

/** Provides consistent native-safe padding for each mobile product screen. */
export function Screen({ children }: PropsWithChildren): React.JSX.Element {
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>{children}</ScrollView></SafeAreaView>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fb' },
  content: { flexGrow: 1, gap: 16, padding: 20 },
})
