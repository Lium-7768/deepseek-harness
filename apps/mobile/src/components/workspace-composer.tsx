import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { NativeIcon } from '@/components/native-icon'
import {
  agentPresetLabel,
  composerInputPolicy,
  composerPrimaryAction,
  modelLabel,
  permissionLabel,
} from '@/components/session-composer-logic'
import type { MobileModelSelection, MobilePermissionSelect } from '@/types/mobile'
import { mobileTheme } from '@/theme'

type Props = {
  agentPreset?: string
  cancelling?: boolean
  disabled?: boolean
  model?: MobileModelSelection
  onCancel?: () => void
  onSend: (text: string) => void | Promise<void>
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
  const action = composerPrimaryAction({ cancelling, disabled, hasText: text.trim() !== '', running, sending })
  const send = async (): Promise<void> => {
    const value = text.trim()
    if (action.kind !== 'send' || action.disabled || !value) return
    try {
      await onSend(value)
      setText('')
    } catch {
      // The request owner presents the error; keeping the draft makes retry safe.
    }
  }
  const hasSession = sessionId !== undefined && sessionId.length > 0
  const modeLabel = agentPresetLabel(agentPreset)
  const selectedModelLabel = modelLabel(model)
  const selectedPermissionLabel =
    permissions === undefined ? '工作区写入' : permissionLabel(permissions.currentValue, permissions)
  const controlsDisabled = disabled || sending || cancelling

  return (
    <View style={s.wrap}>
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
          accessibilityLabel="附件（移动端暂不支持）"
          accessibilityState={{ disabled: true }}
          disabled
          hitSlop={4}
          style={s.icon}
        >
          <NativeIcon name="attach-file" size={21} color={mobileTheme.colors.inkFaint} />
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
      <View style={s.tools}>
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
      </View>
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
  tools: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8 },
  tool: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: mobileTheme.radius.control,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '100%',
    minHeight: 28,
    paddingHorizontal: 8,
  },
  disabledTool: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: mobileTheme.radius.control,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '100%',
    minHeight: 28,
    opacity: 0.5,
    paddingHorizontal: 8,
  },
  toolText: { color: mobileTheme.colors.inkMuted, flexShrink: 1, fontSize: 13, fontWeight: '500' },
  pressed: { opacity: 0.62 },
})
