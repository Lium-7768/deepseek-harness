import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { NativeIcon } from '@/components/native-icon'
import type { MobilePromptContent, MobileQueueItem } from '@/types/mobile'
import { mobileTheme } from '@/theme'

type Props = {
  items: readonly MobileQueueItem[]
  onUpdate: (itemId: string, action: Record<string, unknown>) => Promise<void>
  running: boolean
}

type Editing = { id: string; text: string } | undefined

/**
 * Native projection of the Web QueueDock. Items originate only from the
 * desktop-hosted `session/queue` mux snapshot; local state is limited to the
 * collapsed/editor control state required to operate that snapshot.
 */
export function NativeQueueDock({ items, onUpdate, running }: Props): React.JSX.Element | null {
  const queue = useMemo(() => items.filter(item => item.placement === 'queued'), [items])
  const [collapsed, setCollapsed] = useState(true)
  const [editing, setEditing] = useState<Editing>()
  const [busyId, setBusyId] = useState<string | undefined>()

  useEffect(() => {
    if (queue.length === 0) {
      setCollapsed(true)
      setEditing(undefined)
      return
    }
    if (editing !== undefined && !queue.some(item => item.id === editing.id)) setEditing(undefined)
  }, [editing, queue])

  if (queue.length === 0) return null
  const interactionActive = editing !== undefined || busyId !== undefined
  const expanded = !collapsed || interactionActive
  const listVisible = queue.length === 1 || expanded

  const apply = async (itemId: string, action: Record<string, unknown>, failure: string): Promise<boolean> => {
    setBusyId(itemId)
    try {
      await onUpdate(itemId, action)
      return true
    } catch {
      Alert.alert('队列操作失败', failure)
      return false
    } finally {
      setBusyId(current => (current === itemId ? undefined : current))
    }
  }

  const save = async (): Promise<void> => {
    if (editing === undefined || editing.text.trim() === '') return
    if (
      await apply(
        editing.id,
        { kind: 'edit', content: [{ type: 'text', text: editing.text.trim() }] satisfies MobilePromptContent },
        '无法编辑待发送消息，请稍后重试。',
      )
    )
      setEditing(undefined)
  }

  return (
    <View style={s.dock}>
      {queue.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${queue.length} 条待发送消息${expanded ? '，收起列表' : '，展开列表'}`}
          accessibilityState={{ expanded, disabled: interactionActive }}
          disabled={interactionActive}
          onPress={() => setCollapsed(value => !value)}
          style={({ pressed }) => [s.header, pressed && s.pressed]}
        >
          <NativeIcon name="chat" size={15} color={mobileTheme.colors.inkMuted} />
          <Text style={s.headerText}>{queue.length} 条待发送消息</Text>
          <NativeIcon name={expanded ? 'expand-less' : 'expand-more'} size={17} color={mobileTheme.colors.inkMuted} />
        </Pressable>
      ) : null}
      {listVisible ? (
        <View style={s.list}>
          {queue.map((item) => {
            const text = editableText(item)
            const isEditing = editing?.id === item.id
            const busy = busyId !== undefined
            return (
              <View key={item.id} style={s.row}>
                {queue.length === 1 ? <NativeIcon name="chat" size={15} color={mobileTheme.colors.inkMuted} /> : null}
                {isEditing ? (
                  <TextInput
                    accessibilityLabel="编辑待发送消息"
                    autoFocus
                    multiline
                    onChangeText={value => setEditing({ id: item.id, text: value })}
                    style={s.editor}
                    value={editing.text}
                  />
                ) : (
                  <Text numberOfLines={2} style={s.preview}>
                    {queuePreview(item)}
                  </Text>
                )}
                <View style={s.actions}>
                  {isEditing ? (
                    <>
                      <QueueAction
                        disabled={busy || editing.text.trim() === ''}
                        label="保存待发送消息"
                        icon="check"
                        onPress={() => void save()}
                      />
                      <QueueAction disabled={busy} label="取消编辑待发送消息" icon="close" onPress={() => setEditing(undefined)} />
                    </>
                  ) : (
                    <>
                      <QueueAction
                        disabled={busy || text === undefined}
                        label={text === undefined ? '含附件的待发送消息不可编辑' : '编辑待发送消息'}
                        icon="edit"
                        onPress={() => {
                          if (text !== undefined) setEditing({ id: item.id, text })
                        }}
                      />
                      <QueueAction
                        disabled={busy}
                        label="移除待发送消息"
                        icon="close"
                        onPress={() => void apply(item.id, { kind: 'remove' }, '无法移除待发送消息，请稍后重试。')}
                      />
                      <QueueAction
                        disabled={busy || !running}
                        label={running ? '立即引导处理此消息' : '会话未运行，暂不能引导消息'}
                        icon="send"
                        onPress={() => void apply(item.id, { kind: 'steer' }, '无法引导待发送消息，请稍后重试。')}
                      />
                    </>
                  )}
                </View>
              </View>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

function QueueAction({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean
  icon: 'check' | 'close' | 'edit' | 'send'
  label: string
  onPress: () => void
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={5}
      onPress={onPress}
      style={({ pressed }) => [s.action, disabled && s.actionDisabled, pressed && s.pressed]}
    >
      <NativeIcon name={icon} size={15} color={mobileTheme.colors.inkMuted} />
    </Pressable>
  )
}

function editableText(item: MobileQueueItem): string | undefined {
  const { content } = item.message
  if (!content.every(part => part.type === 'text')) return undefined
  return content.map(part => part.text).join('')
}

function queuePreview(item: MobileQueueItem): string {
  const text = editableText(item)
  if (text !== undefined) return text
  return item.message.content.map(part => (part.type === 'text' ? part.text : '[图片]')).join(' ').trim() || '[待发送附件]'
}

const s = StyleSheet.create({
  dock: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderBottomColor: mobileTheme.colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: mobileTheme.colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: mobileTheme.spacing.lg,
    paddingVertical: mobileTheme.spacing.sm,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: mobileTheme.touch.minTarget },
  headerText: { color: mobileTheme.colors.inkMuted, flex: 1, fontSize: 13, fontWeight: '600' },
  list: { gap: 4 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: mobileTheme.touch.minTarget },
  preview: { color: mobileTheme.colors.ink, flex: 1, fontSize: 13, lineHeight: 18 },
  editor: {
    backgroundColor: mobileTheme.colors.surfaceRaised,
    borderColor: mobileTheme.colors.borderStrong,
    borderRadius: mobileTheme.radius.control,
    borderWidth: 1,
    color: mobileTheme.colors.ink,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    maxHeight: 88,
    minHeight: 36,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  action: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  actionDisabled: { opacity: 0.4 },
  pressed: { opacity: 0.62 },
})
