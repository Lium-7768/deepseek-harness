import type { PropsWithChildren } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { mobileTheme } from '@/theme'
export interface ScreenProps extends PropsWithChildren {
  scroll?: boolean
}
export function Screen({ children, scroll = true }: ScreenProps): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe}>
      {scroll ? (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </SafeAreaView>
  )
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: mobileTheme.colors.background },
  content: { flex: 1, gap: mobileTheme.spacing.md, padding: mobileTheme.spacing.lg },
})
