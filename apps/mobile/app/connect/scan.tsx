import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mobileErrorMessage, redeemMobilePairing } from '@/api/mobile-api'
import { NativeActionButton } from '@/components/native-action-button'
import { NativeIcon } from '@/components/native-icon'
import { WorkspaceShell } from '@/components/workspace-shell'
import { useConnectionStore } from '@/state/connection'
import { mobileTheme } from '@/theme'
import type { MobilePairingQrPayload } from '@/types/mobile'

/** Scans a desktop-created one-time pairing QR code and persists only the redeemed device credential. */
export default function ScanPairingScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const scanLocked = useRef(false)
  const setConnection = useConnectionStore(state => state.setConnection)

  const scan = async (data: string): Promise<void> => {
    if (scanLocked.current || redeeming) return
    scanLocked.current = true
    setError('')
    setRedeeming(true)
    try {
      const payload = parsePairingPayload(data)
      const connection = await redeemMobilePairing(payload)
      await setConnection(connection)
      router.replace('/workspace')
    } catch (value) {
      setError(mobileErrorMessage(value, '二维码不是有效的 DeepSeek Harness 配对码。'))
      scanLocked.current = false
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <WorkspaceShell
      title="扫描配对二维码"
      showMenu={false}
      leftAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回连接页"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <NativeIcon name="chevron-left" color={mobileTheme.colors.ink} size={22} />
        </Pressable>
      }
    >
      <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, mobileTheme.spacing.lg) }]}>
        <Text style={styles.copy}>在桌面端打开“Mobile devices”，生成二维码后将它置于取景框内。</Text>
        {permission === null ? (
          <View style={styles.center}><ActivityIndicator color={mobileTheme.colors.accent} /></View>
        ) : !permission.granted ? (
          <View style={styles.permissionCard}>
            <NativeIcon name="warning-amber" color={mobileTheme.colors.warning} size={22} />
            <Text style={styles.permissionTitle}>需要相机权限</Text>
            <Text style={styles.permissionCopy}>扫描桌面端配对二维码需要使用本机相机。</Text>
            <NativeActionButton label="允许使用相机" icon="link" onPress={() => void requestPermission()} style={styles.fullWidth} />
          </View>
        ) : (
          <View style={styles.cameraCard}>
            <CameraView
              accessibilityLabel="配对二维码扫描取景框"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              facing="back"
              onBarcodeScanned={({ data }) => void scan(data)}
              style={styles.camera}
            />
            <View pointerEvents="none" style={styles.frame} />
            {redeeming ? (
              <View style={styles.busy}>
                <ActivityIndicator color="#ffffff" />
                <Text style={styles.busyText}>正在完成安全配对…</Text>
              </View>
            ) : null}
          </View>
        )}
        {error !== '' ? (
          <View accessibilityRole="alert" style={styles.error}>
            <NativeIcon name="error-outline" color={mobileTheme.colors.danger} size={18} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <NativeActionButton label="改为手动输入" icon="link" variant="secondary" onPress={() => router.back()} style={styles.fullWidth} />
      </View>
    </WorkspaceShell>
  )
}

function parsePairingPayload(data: string): MobilePairingQrPayload {
  let value: unknown
  try {
    value = JSON.parse(data)
  } catch {
    throw new Error('二维码不是有效的 DeepSeek Harness 配对码。')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('二维码不是有效的 DeepSeek Harness 配对码。')
  const payload = value as Record<string, unknown>
  if (
    payload.version !== 1 ||
    typeof payload.gatewayUrl !== 'string' ||
    typeof payload.pairingId !== 'string' ||
    typeof payload.pairingSecret !== 'string' ||
    typeof payload.expiresAt !== 'string' ||
    payload.gatewayUrl === '' ||
    payload.pairingId === '' ||
    payload.pairingSecret === ''
  )
    throw new Error('二维码不是有效的 DeepSeek Harness 配对码。')
  const url = new URL(payload.gatewayUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('二维码中的网关地址无效。')
  return {
    version: 1,
    gatewayUrl: url.toString().replace(/\/$/, ''),
    pairingId: payload.pairingId,
    pairingSecret: payload.pairingSecret,
    expiresAt: payload.expiresAt,
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: mobileTheme.spacing.md, paddingHorizontal: mobileTheme.spacing.lg, paddingTop: mobileTheme.spacing.lg },
  back: { alignItems: 'center', justifyContent: 'center', minHeight: mobileTheme.touch.minTarget, minWidth: mobileTheme.touch.minTarget },
  copy: { color: mobileTheme.colors.inkMuted, fontSize: mobileTheme.typography.body, lineHeight: 21 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  cameraCard: { aspectRatio: 1, borderColor: mobileTheme.colors.borderStrong, borderRadius: mobileTheme.radius.card, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  camera: { flex: 1 },
  frame: { borderColor: '#ffffff', borderRadius: 16, borderWidth: 2, height: '58%', left: '21%', position: 'absolute', top: '21%', width: '58%' },
  busy: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.64)', bottom: 0, flexDirection: 'row', gap: mobileTheme.spacing.sm, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  busyText: { color: '#ffffff', fontSize: mobileTheme.typography.body, fontWeight: '700' },
  permissionCard: { alignItems: 'center', backgroundColor: mobileTheme.colors.surfaceRaised, borderColor: mobileTheme.colors.border, borderRadius: mobileTheme.radius.card, borderWidth: 1, gap: mobileTheme.spacing.sm, padding: mobileTheme.spacing.xl },
  permissionTitle: { color: mobileTheme.colors.ink, fontSize: mobileTheme.typography.bodyLarge, fontWeight: '800' },
  permissionCopy: { color: mobileTheme.colors.inkMuted, fontSize: mobileTheme.typography.body, lineHeight: 20, textAlign: 'center' },
  fullWidth: { width: '100%' },
  error: { alignItems: 'flex-start', backgroundColor: mobileTheme.colors.dangerSoft, borderColor: mobileTheme.colors.danger, borderRadius: mobileTheme.radius.card, borderWidth: 1, flexDirection: 'row', gap: mobileTheme.spacing.sm, padding: mobileTheme.spacing.md },
  errorText: { color: mobileTheme.colors.danger, flex: 1, lineHeight: 19 },
  pressed: { opacity: 0.68 },
})
