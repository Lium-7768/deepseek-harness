import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { NativeIcon } from '@/components/native-icon'
import {
  agentPresetLabel,
  composerInputPolicy,
  composerPrimaryAction,
  modelLabel,
  permissionLabel,
} from '@/components/session-composer-logic'
import type { MobileImageMediaType, MobileModelSelection, MobilePermissionSelect, MobilePromptContent } from '@/types/mobile'
import { mobileTheme } from '@/theme'

type DraftImage = {
  data: string
  mediaType: MobileImageMediaType
  name?: string
  uri: string
}

type Props = {
  agentPreset?: string
  cancelling?: boolean
  disabled?: boolean
  model?: MobileModelSelection
  onCancel?: () => void
  onSend: (content: MobilePromptContent) => void | Promise<void>
  permissions?: MobilePermissionSelect
  placeholder?: string
  running?: boolean
  sending?: boolean
  sessionId?: string
}

/**
 * Sends text prompts and exposes controls backed by the session APIs.
 *
 * Agent mode and model open native detail routes which submit
 * `agentPreset.select` and `session.selectModel`. Permission choices are
 * shown only when the history projection is present; that projection is the
 * host's durable permission state, and the detail route submits the existing
 * `/permission <preset>` session command. Unsupported controls remain visibly
 * disabled instead of changing local state without a desktop acknowledgement.
 *
 * @param props - Prompt callback, session identity, and host projections.
 * @returns The native prompt composer.
 */
export function WorkspaceComposer({
  agentPreset,
  cancelling = false,
  disabled = false,
  model,
  onCancel,
  onSend,
  permissions,
  placeholder = '给智能体发消息',
  running = false,
  sending = false,
  sessionId,
}: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [draftImages, setDraftImages] = useState<DraftImage[]>([])
  const hasContent = text.trim() !== '' || draftImages.length > 0
  const action = composerPrimaryAction({ cancelling, disabled, hasText: hasContent, running, sending })
  const send = async (): Promise<void> => {
    const value = text.trim()
    if (action.kind !== 'send' || action.disabled || !hasContent) return
    const content: MobilePromptContent = [
      ...(value ? [{ type: 'text' as const, text: value }] : []),
      ...draftImages.map(({ data, mediaType, name }) => ({
        type: 'image' as const,
        data,
        mediaType,
        ...(name ? { name } : {}),
      })),
    ]
    try {
      await onSend(content)
      setText('')
      setDraftImages([])
    } catch {
      // The request owner presents the error; keeping the draft makes retry safe.
    }
  }
  const appendImages = (assets: ImagePicker.ImagePickerAsset[]): void => {
    const selected = assets.slice(0, 4 - draftImages.length).flatMap((asset) => {
      if (!asset.base64) return []
      return [
        {
          data: asset.base64,
          // Both camera and library requests ask Expo for a compressed JPEG base64 payload.
          mediaType: 'image/jpeg' as const,
          ...(asset.fileName ? { name: asset.fileName } : {}),
          uri: asset.uri,
        },
      ]
    })
    if (selected.length === 0) {
      Alert.alert('无法添加图片', '所选图片未提供可上传的数据，请重新选择。')
      return
    }
    setDraftImages(current => [...current, ...selected].slice(0, 4))
  }
  const pickImage = async (): Promise<void> => {
    if (controlsDisabled || draftImages.length >= 4) return
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        base64: true,
        mediaTypes: ['images'],
        quality: 0.85,
        selectionLimit: 4 - draftImages.length,
      })
      if (!result.canceled) appendImages(result.assets)
    } catch {
      Alert.alert('无法打开照片库', '请检查照片权限后重试。')
    }
  }
  const captureImage = async (): Promise<void> => {
    if (controlsDisabled || draftImages.length >= 4) return
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('需要相机权限', '请允许 DeepSeek Harness 使用相机后再拍照。')
        return
      }
      const result = await ImagePicker.launchCameraAsync({ base64: true, mediaTypes: ['images'], quality: 0.85 })
      if (!result.canceled) appendImages(result.assets)
    } catch {
      Alert.alert('无法打开相机', '请检查相机权限后重试。')
    }
  }
  const chooseImageSource = (): void => {
    if (controlsDisabled || draftImages.length >= 4) return
    Alert.alert('添加图片', '拍照和照片库中的图片都会在上传前压缩。', [
      { text: '拍照', onPress: () => void captureImage() },
      { text: '从照片库选择', onPress: () => void pickImage() },
      { text: '取消', style: 'cancel' },
    ])
  }
  const hasSession = sessionId !== undefined && sessionId.length > 0
  const modeLabel = agentPresetLabel(agentPreset)
  const selectedModelLabel = modelLabel(model)
  const selectedPermissionLabel =
    permissions === undefined ? '工作区写入' : permissionLabel(permissions.currentValue, permissions)
  const controlsDisabled = disabled || sending || cancelling

  return (
    <View style={s.wrap}>
      {draftImages.length > 0 ? (
        <View accessibilityLabel={`已添加 ${draftImages.length} 张图片`} style={s.previewRow}>
          {draftImages.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={s.preview}>
              <Image accessibilityLabel={image.name ?? `附件图片 ${index + 1}`} source={{ uri: image.uri }} style={s.previewImage} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`移除附件图片 ${index + 1}`}
                hitSlop={6}
                onPress={() => setDraftImages(current => current.filter((_, itemIndex) => itemIndex !== index))}
                style={({ pressed }) => [s.removePreview, pressed && s.pressed]}
              >
                <NativeIcon name="close" size={13} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={s.row}>
        <TextInput
          accessibilityLabel="消息输入"
          multiline
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={mobileTheme.colors.inkFaint}
          style={s.input}
          textAlignVertical="top"
          editable={!controlsDisabled}
          returnKeyType={composerInputPolicy.returnKeyType}
          submitBehavior={composerInputPolicy.submitBehavior}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={draftImages.length >= 4 ? '最多可添加 4 张图片' : '添加图片附件'}
          accessibilityState={{ disabled: controlsDisabled || draftImages.length >= 4 }}
          disabled={controlsDisabled || draftImages.length >= 4}
          hitSlop={4}
          onPress={chooseImageSource}
          style={({ pressed }) => [
            s.icon,
            (controlsDisabled || draftImages.length >= 4) && s.iconDisabled,
            pressed && s.pressed,
          ]}
        >
          <NativeIcon
            name="attach-file"
            size={21}
            color={controlsDisabled || draftImages.length >= 4 ? mobileTheme.colors.inkFaint : mobileTheme.colors.inkMuted}
          />
        </Pressable>
        {onCancel !== undefined && action.kind === 'stop' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.busy ? '正在停止当前任务' : '停止当前任务'}
            accessibilityState={{ busy: action.busy, disabled: action.disabled }}
            disabled={action.disabled}
            hitSlop={5}
            onPress={onCancel}
            style={[s.send, action.disabled && s.sendDisabled]}
          >
            {action.busy ? <ActivityIndicator color="#fff" /> : <NativeIcon name="stop" size={16} color="#fff" />}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.busy ? '正在发送消息' : '发送消息'}
            accessibilityState={{ busy: action.busy, disabled: action.disabled }}
            disabled={action.disabled}
            hitSlop={5}
            onPress={() => void send()}
            style={[s.send, action.disabled && s.sendDisabled]}
          >
            {action.busy ? <ActivityIndicator color="#fff" /> : <NativeIcon name="send" size={18} color="#fff" />}
          </Pressable>
        )}
      </View>
      <ScrollView contentContainerStyle={s.tools} horizontal showsHorizontalScrollIndicator={false}>
        {permissions === undefined ? (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="工作区写入权限由桌面端控制"
            accessibilityState={{ disabled: true }}
            style={s.disabledTool}
          >
            <NativeIcon name="admin-panel-settings" size={14} color={mobileTheme.colors.inkMuted} />
            <Text style={s.toolText}>工作区写入</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`选择权限：${selectedPermissionLabel}`}
            accessibilityState={{ disabled: !hasSession || controlsDisabled }}
            disabled={!hasSession || controlsDisabled}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => {
              if (hasSession && sessionId !== undefined)
                router.push({ pathname: '/session/[sessionId]/permission', params: { sessionId } })
            }}
            style={({ pressed }) => [s.tool, controlsDisabled && s.disabledTool, pressed && s.pressed]}
          >
            <NativeIcon name="admin-panel-settings" size={14} color={mobileTheme.colors.inkMuted} />
            <Text numberOfLines={1} style={s.toolText}>
              {selectedPermissionLabel}
            </Text>
            <NativeIcon name="chevron-down" size={13} color={mobileTheme.colors.inkMuted} />
          </Pressable>
        )}
        {hasSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`选择智能体模式：${modeLabel}`}
            accessibilityState={{ disabled: controlsDisabled }}
            disabled={controlsDisabled}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => {
              if (sessionId !== undefined) router.push({ pathname: '/session/[sessionId]/mode', params: { sessionId } })
            }}
            style={({ pressed }) => [s.tool, controlsDisabled && s.disabledTool, pressed && s.pressed]}
          >
            <NativeIcon name="tune" size={14} color={mobileTheme.colors.inkMuted} />
            <Text numberOfLines={1} style={s.toolText}>
              {modeLabel}
            </Text>
            <NativeIcon name="chevron-down" size={13} color={mobileTheme.colors.inkMuted} />
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="智能体模式需先选择会话"
            accessibilityState={{ disabled: true }}
            style={s.disabledTool}
          >
            <NativeIcon name="tune" size={14} color={mobileTheme.colors.inkMuted} />
            <Text style={s.toolText}>标准模式</Text>
          </View>
        )}
        {hasSession ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`选择模型：${selectedModelLabel}`}
            accessibilityState={{ disabled: controlsDisabled }}
            disabled={controlsDisabled}
            hitSlop={{ top: 8, bottom: 8 }}
            onPress={() => {
              if (sessionId !== undefined)
                router.push({ pathname: '/session/[sessionId]/model', params: { sessionId } })
            }}
            style={({ pressed }) => [s.tool, controlsDisabled && s.disabledTool, pressed && s.pressed]}
          >
            <NativeIcon name="smart-toy" size={14} color={mobileTheme.colors.inkMuted} />
            <Text numberOfLines={1} style={s.toolText}>
              {selectedModelLabel}
            </Text>
            <NativeIcon name="chevron-down" size={13} color={mobileTheme.colors.inkMuted} />
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel="模型需先选择会话"
            accessibilityState={{ disabled: true }}
            style={s.disabledTool}
          >
            <NativeIcon name="smart-toy" size={14} color={mobileTheme.colors.inkMuted} />
            <Text style={s.toolText}>模型由桌面端控制</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: mobileTheme.colors.canvas,
    paddingBottom: mobileTheme.spacing.sm,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingTop: mobileTheme.spacing.md,
  },
  previewRow: { flexDirection: 'row', gap: mobileTheme.spacing.sm, marginBottom: mobileTheme.spacing.sm },
  preview: { height: 58, position: 'relative', width: 58 },
  previewImage: { borderRadius: mobileTheme.radius.control, height: 58, width: 58 },
  removePreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 25, 34, 0.8)',
    borderColor: mobileTheme.colors.canvas,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: -5,
    top: -5,
    width: 20,
  },
  row: {
    alignItems: 'flex-end',
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.borderStrong,
    borderRadius: mobileTheme.chrome.composerRadius,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 58,
    paddingLeft: mobileTheme.spacing.md,
  },
  input: { color: mobileTheme.colors.ink, flex: 1, fontSize: 15, maxHeight: 120, minHeight: 52, paddingVertical: 12 },
  icon: {
    alignItems: 'center',
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.iconButton,
  },
  iconDisabled: { opacity: 0.55 },
  send: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.accent,
    borderRadius: mobileTheme.radius.pill,
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    margin: 5,
    width: mobileTheme.touch.iconButton,
  },
  sendDisabled: { backgroundColor: mobileTheme.colors.borderStrong },
  tools: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingRight: 12, paddingTop: 8 },
  tool: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: mobileTheme.radius.control,
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
    minHeight: 28,
    paddingHorizontal: 8,
  },
  disabledTool: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: mobileTheme.radius.control,
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
    minHeight: 28,
    opacity: 0.5,
    paddingHorizontal: 8,
  },
  toolText: { color: mobileTheme.colors.inkMuted, flexShrink: 1, fontSize: 13, fontWeight: '500' },
  pressed: { opacity: 0.62 },
})
