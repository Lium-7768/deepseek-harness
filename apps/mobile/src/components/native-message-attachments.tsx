import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { MobileApi, mobileErrorMessage } from '@/api/mobile-api'
import { NativeIcon } from '@/components/native-icon'
import { mobileTheme } from '@/theme'
import type { MobileImageAttachmentRef } from '@/types/mobile'

type Props = {
  api: MobileApi
  sessionId: string
  event: Record<string, unknown> | undefined
}

/**
 * Renders images referenced by a durable visible message.
 *
 * The component never accepts desktop paths or arbitrary URLs. Each image is
 * read through the Gateway's session-authorized attachment route after the
 * desktop runtime has proved that this session log references the opaque id.
 */
export function NativeMessageAttachments({ api, sessionId, event }: Props): React.JSX.Element | null {
  const attachments = useMemo(() => imageAttachmentsFromEvent(event), [event])
  if (attachments.length === 0) return null
  return (
    <View style={styles.rail}>
      {attachments.map(attachment => (
        <NativeMessageAttachment
          key={attachment.attachmentId}
          api={api}
          sessionId={sessionId}
          attachment={attachment}
        />
      ))}
    </View>
  )
}

function NativeMessageAttachment({
  api,
  sessionId,
  attachment,
}: {
  api: MobileApi
  sessionId: string
  attachment: MobileImageAttachmentRef
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const image = useQuery({
    queryKey: ['session-attachment', sessionId, attachment.attachmentId],
    queryFn: () => api.readAttachment(sessionId, attachment.attachmentId),
    staleTime: Infinity,
  })
  const uri = image.data === undefined ? undefined : `data:${image.data.attachment.mediaType};base64,${image.data.data}`
  const label = attachment.name ?? '历史图片'
  const share = async (): Promise<void> => {
    if (image.data === undefined || sharing) return
    setSharing(true)
    try {
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('暂不支持系统分享', '当前设备无法打开系统分享面板。')
        return
      }
      const extension = extensionFor(image.data.attachment.mediaType)
      const fileName = `dsh-${safeFileStem(image.data.attachment.name ?? image.data.attachment.attachmentId)}.${extension}`
      const uri = `${FileSystem.cacheDirectory}${fileName}`
      await FileSystem.writeAsStringAsync(uri, image.data.data, { encoding: FileSystem.EncodingType.Base64 })
      await Sharing.shareAsync(uri, { dialogTitle: '分享或保存图片', mimeType: image.data.attachment.mediaType })
    } catch (error) {
      Alert.alert('无法分享图片', mobileErrorMessage(error, '图片未能写入本地分享缓存，请稍后重试。'))
    } finally {
      setSharing(false)
    }
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`打开${label}`}
        accessibilityState={{ busy: image.isPending }}
        onPress={() => {
          if (uri !== undefined) setOpen(true)
          else if (image.isError) void image.refetch()
        }}
        style={({ pressed }) => [styles.thumbnailFrame, pressed && styles.pressed]}
      >
        {uri !== undefined ? (
          <Image accessibilityLabel={label} resizeMode="cover" source={{ uri }} style={styles.thumbnail} />
        ) : image.isPending ? (
          <ActivityIndicator color={mobileTheme.colors.accent} />
        ) : (
          <View style={styles.loadFailure}>
            <NativeIcon name="attach-file" size={20} color={mobileTheme.colors.inkMuted} />
            <Text style={styles.loadFailureText}>轻触重试</Text>
          </View>
        )}
      </Pressable>
      {image.isError ? <Text style={styles.error}>{mobileErrorMessage(image.error, '图片加载失败，请轻触重试。')}</Text> : null}
      {uri !== undefined ? (
        <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
          <View style={styles.modalBackdrop}>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭图片预览" onPress={() => setOpen(false)} style={styles.closeButton}>
              <NativeIcon name="close" size={22} color={mobileTheme.colors.textOnAccent} />
            </Pressable>
            <Image accessibilityLabel={label} resizeMode="contain" source={{ uri }} style={styles.fullImage} />
            <View style={styles.previewFooter}>
              <Text numberOfLines={1} style={styles.caption}>{label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="分享或保存图片"
                accessibilityState={{ busy: sharing }}
                disabled={sharing}
                onPress={() => void share()}
                style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              >
                <NativeIcon name="link" size={16} color={mobileTheme.colors.textOnAccent} />
                <Text style={styles.shareText}>{sharing ? '正在准备…' : '分享或保存'}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  )
}

/** Extracts only typed durable image blocks from an ordinary visible message event. */
export function imageAttachmentsFromEvent(event: Record<string, unknown> | undefined): MobileImageAttachmentRef[] {
  const data = recordOf(event?.data)
  const message = recordOf(data?.message)
  const content = message?.content
  if (!Array.isArray(content)) return []
  const seen = new Set<string>()
  const images: MobileImageAttachmentRef[] = []
  for (const block of content) {
    const value = recordOf(block)
    const attachment = value?.type === 'image' ? recordOf(value.attachment) : undefined
    if (
      attachment === undefined
      || typeof attachment.attachmentId !== 'string'
      || typeof attachment.mediaType !== 'string'
      || !isImageMediaType(attachment.mediaType)
      || !isPositiveInteger(attachment.bytes)
      || !isPositiveInteger(attachment.width)
      || !isPositiveInteger(attachment.height)
      || seen.has(attachment.attachmentId)
    )
      continue
    seen.add(attachment.attachmentId)
    images.push({
      attachmentId: attachment.attachmentId,
      mediaType: attachment.mediaType,
      bytes: attachment.bytes,
      width: attachment.width,
      height: attachment.height,
      ...(typeof attachment.name === 'string' && attachment.name.trim() ? { name: attachment.name } : {}),
    })
  }
  return images
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function isImageMediaType(value: string): value is MobileImageAttachmentRef['mediaType'] {
  return value === 'image/gif' || value === 'image/jpeg' || value === 'image/png' || value === 'image/webp'
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function extensionFor(mediaType: MobileImageAttachmentRef['mediaType']): string {
  return mediaType === 'image/jpeg' ? 'jpg' : mediaType.slice('image/'.length)
}

function safeFileStem(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'attachment'
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', flexWrap: 'wrap', gap: mobileTheme.spacing.sm, marginTop: mobileTheme.spacing.sm },
  thumbnailFrame: {
    alignItems: 'center',
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderColor: mobileTheme.colors.border,
    borderRadius: mobileTheme.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    height: 168,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 168,
  },
  thumbnail: { height: '100%', width: '100%' },
  loadFailure: { alignItems: 'center', gap: 5 },
  loadFailureText: { color: mobileTheme.colors.inkMuted, fontSize: 11 },
  error: { color: mobileTheme.colors.danger, fontSize: 11, maxWidth: 168 },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.94)', flex: 1, justifyContent: 'center', padding: 18 },
  closeButton: { alignItems: 'center', height: mobileTheme.touch.iconButton, justifyContent: 'center', position: 'absolute', right: 16, top: 58, width: mobileTheme.touch.iconButton },
  fullImage: { flex: 1, width: '100%' },
  previewFooter: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 16, maxWidth: '100%', width: '100%' },
  caption: { color: mobileTheme.colors.textOnAccent, flex: 1, fontSize: 13 },
  shareButton: { alignItems: 'center', borderColor: 'rgba(255,255,255,0.5)', borderRadius: mobileTheme.radius.pill, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 34, paddingHorizontal: 11 },
  shareText: { color: mobileTheme.colors.textOnAccent, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.65 },
})
