import { useMutation, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeActionButton } from '@/components/native-action-button'
import { WorkspaceShell } from '@/components/workspace-shell'
import { workspaceKeyboardVerticalOffset } from '@/components/workspace-shell-logic'
import { useConnectionStore } from '@/state/connection'
import { mobileTheme } from '@/theme'

/** Renders the native title editor for one desktop-owned workspace. */
export default function RenameWorkspaceScreen(): React.JSX.Element {
  const { title: rawTitle, workspaceId: rawWorkspaceId } = useLocalSearchParams<{
    title?: string | string[]
    workspaceId?: string | string[]
  }>()
  const workspaceId = firstParam(rawWorkspaceId)
  const connection = useConnectionStore(value => value.connection)
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const [title, setTitle] = useState(firstParam(rawTitle) ?? '')
  const client = useMemo(() => (connection ? new MobileApi(connection) : undefined), [connection])
  const rename = useMutation({
    mutationFn: async () => {
      const normalized = title.trim()
      if (!client || !workspaceId) throw new Error('请先连接桌面端并从工作区列表打开。')
      if (normalized === '') throw new Error('工作区名称不能为空。')
      return client.renameWorkspace(workspaceId, normalized)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session-list', connection?.gatewayUrl, connection?.deviceId] })
      router.back()
    },
    onError: error => Alert.alert('重命名失败', mobileErrorMessage(error, '请稍后重试。')),
  })

  return (
    <WorkspaceShell title="重命名工作区" showMenu={false}>
      <View style={[styles.canvas, { paddingTop: workspaceKeyboardVerticalOffset(insets.top, false) / 3 }]}>
        <Text style={styles.label}>工作区名称</Text>
        <TextInput
          accessibilityLabel="工作区名称"
          autoFocus
          editable={!rename.isPending}
          maxLength={200}
          onChangeText={setTitle}
          onSubmitEditing={() => void rename.mutateAsync()}
          placeholder="输入工作区名称"
          placeholderTextColor={mobileTheme.colors.inkFaint}
          returnKeyType="done"
          style={styles.input}
          value={title}
        />
        <Text style={styles.hint}>工作区名称会同步到桌面 Web 的同一分组，不会移动或修改桌面文件夹。</Text>
        <NativeActionButton
          label="保存"
          icon="check"
          loading={rename.isPending}
          onPress={() => void rename.mutateAsync()}
          disabled={!connection || !workspaceId || title.trim() === ''}
          style={styles.submit}
        />
      </View>
    </WorkspaceShell>
  )
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value.find(item => item.trim()) : value
  return candidate?.trim() || undefined
}

const styles = StyleSheet.create({
  canvas: { flex: 1, gap: mobileTheme.spacing.sm, padding: mobileTheme.spacing.lg },
  hint: { color: mobileTheme.colors.inkMuted, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: mobileTheme.colors.surface,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    color: mobileTheme.colors.ink,
    fontSize: 16,
    minHeight: mobileTheme.touch.minTarget,
    paddingHorizontal: mobileTheme.spacing.md,
  },
  label: { color: mobileTheme.colors.ink, fontSize: 14, fontWeight: '700' },
  submit: { marginTop: mobileTheme.spacing.md },
})
