import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { NativeIcon } from '@/components/native-icon'
import { mobileTheme } from '@/theme'
type Block = {
  kind: 'paragraph' | 'heading' | 'quote' | 'bullet' | 'ordered' | 'code'
  text: string
  level?: number
  marker?: string
  language?: string
}
function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let code: string[] | undefined
  let language: string | undefined
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() })
      paragraph = []
    }
  }
  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/)
    if (fence) {
      if (code) {
        blocks.push({ kind: 'code', text: code.join('\n').trimEnd(), language })
        code = undefined
        language = undefined
      } else {
        flush()
        code = []
        language = fence[1] || undefined
      }
      continue
    }
    if (code) {
      code.push(line)
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: heading[2], level: heading[1].length })
      continue
    }
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flush()
      blocks.push({ kind: 'quote', text: quote[1] })
      continue
    }
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    if (bullet) {
      flush()
      blocks.push({ kind: 'bullet', text: bullet[1], marker: '•' })
      continue
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      flush()
      blocks.push({ kind: 'ordered', text: ordered[2], marker: `${ordered[1]}.` })
      continue
    }
    paragraph.push(line.trim())
  }
  if (code) blocks.push({ kind: 'code', text: code.join('\n').trimEnd(), language })
  flush()
  return blocks
}
function inline(text: string, key: string): React.JSX.Element[] {
  const re = /(\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g
  const out: React.JSX.Element[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match.index > cursor) out.push(<Text key={`${key}-p-${cursor}`}>{text.slice(cursor, match.index)}</Text>)
    const token = match[0]
    if (token.startsWith('['))
      out.push(
        <Text key={`${key}-l-${match.index}`} style={styles.link}>
          {token.replace(/^\[|\]\([^)]*\)$/g, '')}
        </Text>,
      )
    else if (token.startsWith('`'))
      out.push(
        <Text key={`${key}-c-${match.index}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>,
      )
    else if (token.startsWith('**') || token.startsWith('__'))
      out.push(
        <Text key={`${key}-b-${match.index}`} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>,
      )
    else
      out.push(
        <Text key={`${key}-i-${match.index}`} style={styles.italic}>
          {token.slice(1, -1)}
        </Text>,
      )
    cursor = match.index + token.length
  }
  if (cursor < text.length) out.push(<Text key={`${key}-tail`}>{text.slice(cursor)}</Text>)
  return out.length ? out : [<Text key={`${key}-all`}>{text}</Text>]
}
export function NativeMarkdown({
  markdown,
  onCopyCode,
}: {
  markdown: string
  onCopyCode?: (code: string) => void | Promise<void>
}): React.JSX.Element {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [copyFailedIndex, setCopyFailedIndex] = useState<number | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
    },
    [],
  )
  const copy = async (index: number, code: string): Promise<void> => {
    if (copiedIndex === index) return
    try {
      if (onCopyCode) await onCopyCode(code)
      else await Clipboard.setStringAsync(code)
      setCopiedIndex(index)
      setCopyFailedIndex(null)
      if (copyTimer.current !== null) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => {
        copyTimer.current = null
        setCopiedIndex(null)
      }, 1200)
    } catch {
      setCopyFailedIndex(index)
      void AccessibilityInfo.announceForAccessibility('复制失败，请重试。')
    }
  }
  return (
    <View style={styles.root}>
      {parseBlocks(markdown).map((block, index) => {
        const key = `md-${index}`
        if (block.kind === 'code') {
          const copied = copiedIndex === index
          const failed = copyFailedIndex === index
          return (
            <NativeCodeBlock
              key={key}
              copied={copied}
              failed={failed}
              language={block.language}
              onCopy={() => void copy(index, block.text)}
              text={block.text}
            />
          )
        }
        const content = inline(block.text, key)
        if (block.kind === 'heading')
          return (
            <Text
              key={key}
              style={[styles.heading, block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3]}
            >
              {content}
            </Text>
          )
        if (block.kind === 'quote')
          return (
            <View key={key} style={styles.quote}>
              <Text style={styles.quoteText}>{content}</Text>
            </View>
          )
        if (block.kind === 'bullet' || block.kind === 'ordered')
          return (
            <View key={key} style={styles.listRow}>
              <Text style={styles.marker}>{block.marker}</Text>
              <Text style={styles.body}>{content}</Text>
            </View>
          )
        return (
          <Text key={key} style={styles.body}>
            {content}
          </Text>
        )
      })}
    </View>
  )
}
function NativeCodeBlock({
  copied,
  failed,
  language,
  onCopy,
  text,
}: {
  copied: boolean
  failed: boolean
  language?: string
  onCopy: () => void
  text: string
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const lineCount = text.split('\n').length
  const collapsible = lineCount > 16
  return (
    <View style={styles.codeCard}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLanguage}>{language || '代码'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? '代码已复制' : failed ? '复制失败，请重试' : '复制代码'}
          hitSlop={8}
          onPress={onCopy}
          style={styles.copyButton}
        >
          <NativeIcon
            name={copied ? 'check' : 'content-copy'}
            size={16}
            color={copied ? '#86efac' : failed ? mobileTheme.colors.danger : '#bfdbfe'}
          />
        </Pressable>
      </View>
      <Text selectable numberOfLines={collapsible && !expanded ? 16 : undefined} style={styles.codeText}>
        {text}
      </Text>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? '折叠代码块' : '展开完整代码块'}
          onPress={() => setExpanded(value => !value)}
          style={styles.codeToggle}
        >
          <Text style={styles.codeToggleText}>{expanded ? '收起' : `展开全部 ${lineCount} 行`}</Text>
          <NativeIcon name={expanded ? 'expand-less' : 'expand-more'} size={15} color="#bfdbfe" />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: mobileTheme.spacing.lg },
  body: { color: mobileTheme.colors.ink, fontSize: 16, lineHeight: 28 },
  heading: { color: mobileTheme.colors.ink, fontWeight: '800' },
  h1: { fontSize: 22, lineHeight: 28 },
  h2: { fontSize: 18, lineHeight: 24 },
  h3: { fontSize: 16, lineHeight: 22 },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  link: { color: mobileTheme.colors.accentText, textDecorationLine: 'underline' },
  inlineCode: {
    backgroundColor: mobileTheme.colors.surfaceMuted,
    borderRadius: 4,
    fontFamily: 'Menlo',
    fontSize: 13,
    paddingHorizontal: 3,
  },
  quote: { borderLeftColor: mobileTheme.colors.accent, borderLeftWidth: 3, paddingLeft: 10 },
  quoteText: { color: mobileTheme.colors.inkMuted, fontStyle: 'italic', lineHeight: 28 },
  listRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  marker: { color: mobileTheme.colors.accent, fontWeight: '800', lineHeight: 28, minWidth: 18 },
  codeCard: { backgroundColor: mobileTheme.colors.codeBackground, borderRadius: 10, gap: 8, padding: 11 },
  codeHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  codeLanguage: { color: '#93c5fd', fontSize: 10, fontWeight: '800' },
  copyButton: {
    alignItems: 'center',
    height: mobileTheme.touch.iconButton,
    justifyContent: 'center',
    width: mobileTheme.touch.iconButton,
  },
  codeText: { color: mobileTheme.colors.codeForeground, fontFamily: 'Menlo', fontSize: 13, lineHeight: 22 },
  codeToggle: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: mobileTheme.touch.minTarget },
  codeToggleText: { color: '#bfdbfe', fontSize: 12, fontWeight: '700' },
})
