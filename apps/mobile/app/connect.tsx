import { router } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mobileErrorMessage } from '@/api/mobile-api'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { WorkspaceShell } from '@/components/workspace-shell'
import { workspaceKeyboardVerticalOffset } from '@/components/workspace-shell-logic'
import { useConnectionStore } from '@/state/connection'
import { mobileTheme } from '@/theme'

export default function ConnectScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const [gatewayUrl, setGatewayUrl] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const setConnection = useConnectionStore(state => state.setConnection)
  const connect = async (): Promise<void> => {
    setError('')
    try {
      if (gatewayUrl.trim() === '') throw new Error('请输入移动网关地址。')
      let parsed: URL
      try {
        parsed = new URL(gatewayUrl.trim())
      } catch {
        throw new Error('请输入有效的网关地址。')
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('请输入 HTTP 或 HTTPS 网关地址。')
      if (deviceId.trim() === '' || accessToken.trim() === '') throw new Error('请输入桌面端批准的设备 ID 和访问令牌。')
      setSaving(true)
      await setConnection({
        gatewayUrl: parsed.toString().replace(/\/$/, ''),
        deviceId: deviceId.trim(),
        accessToken: accessToken.trim(),
      })
      router.replace('/workspace')
    } catch (value) {
      setError(mobileErrorMessage(value, '连接桌面端失败，请检查网关地址和设备凭据。'))
    } finally {
      setSaving(false)
    }
  }
  return (
    <WorkspaceShell title="连接桌面端" showMenu={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? workspaceKeyboardVerticalOffset(insets.top, false) : 0}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>DEEPSEEK HARNESS</Text>
            <Text style={styles.title}>连接桌面端</Text>
            <Text style={styles.copy}>扫描桌面端生成的一次性配对二维码即可安全连接。</Text>
          </View>
          <View style={styles.form}>
            <NativeActionButton
              label="扫描配对二维码"
              icon="link"
              onPress={() => router.push('/connect/scan')}
              style={styles.connectButton}
            />
            <Text style={styles.manualLabel}>无法扫码时，可手动输入桌面端批准的连接信息。</Text>
            <Field
              label="移动网关地址"
              value={gatewayUrl}
              onChangeText={setGatewayUrl}
              placeholder="http://192.168.1.4:52404"
              keyboardType="url"
            />
            <Field label="设备 ID" value={deviceId} onChangeText={setDeviceId} placeholder="已配对的设备 ID" />
            <Field
              label="访问令牌"
              value={accessToken}
              onChangeText={setAccessToken}
              placeholder="设备访问令牌"
              secureTextEntry
            />
            {error !== '' ? (
              <View accessibilityRole="alert" style={styles.error}>
                <NativeIcon name="error-outline" color={mobileTheme.colors.danger} size={18} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <NativeActionButton
              label="连接"
              icon="link"
              loading={saving}
              onPress={() => void connect()}
              style={styles.connectButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </WorkspaceShell>
  )
}

function Field(props: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  secureTextEntry?: boolean
  keyboardType?: 'url'
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={props.keyboardType}
        placeholder={props.placeholder}
        placeholderTextColor={mobileTheme.colors.inkFaint}
        secureTextEntry={props.secureTextEntry}
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: mobileTheme.spacing.xl, paddingTop: mobileTheme.spacing.xl },
  hero: { gap: mobileTheme.spacing.xs, marginBottom: mobileTheme.spacing.lg },
  eyebrow: {
    color: mobileTheme.colors.accentText,
    fontSize: mobileTheme.typography.eyebrow,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: { color: mobileTheme.colors.ink, fontSize: 28, fontWeight: '800' },
  copy: { color: mobileTheme.colors.inkMuted, fontSize: mobileTheme.typography.bodyLarge, lineHeight: 23 },
  form: { gap: mobileTheme.spacing.md },
  manualLabel: { color: mobileTheme.colors.inkMuted, fontSize: mobileTheme.typography.caption, lineHeight: 18 },
  field: { gap: mobileTheme.spacing.xs },
  label: { color: mobileTheme.colors.inkMuted, fontSize: mobileTheme.typography.caption, fontWeight: '700' },
  input: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: 1,
    color: mobileTheme.colors.ink,
    fontSize: mobileTheme.typography.bodyLarge,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.md,
    paddingVertical: mobileTheme.spacing.sm,
  },
  connectButton: { marginTop: mobileTheme.spacing.xs, width: '100%' },
  error: {
    alignItems: 'flex-start',
    backgroundColor: mobileTheme.colors.dangerSoft,
    borderColor: mobileTheme.colors.danger,
    borderRadius: mobileTheme.radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: mobileTheme.spacing.sm,
    padding: mobileTheme.spacing.md,
  },
  errorText: { color: mobileTheme.colors.danger, flex: 1, lineHeight: 19 },
})
