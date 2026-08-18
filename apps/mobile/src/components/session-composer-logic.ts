import type { MobileModelSelection, MobilePermissionSelect } from '@/types/mobile'

/** The multiline composer keeps Return available for newlines; sending is explicit. */
export const composerInputPolicy = {
  returnKeyType: 'default',
  submitBehavior: 'newline',
} as const

/** Describes which primary composer action remains available while a request settles. */
export function composerPrimaryAction(input: {
  cancelling: boolean
  disabled: boolean
  hasText: boolean
  running: boolean
  sending: boolean
}): { busy: boolean; disabled: boolean; kind: 'send' | 'stop' } {
  if (input.running && !input.disabled) return { busy: input.cancelling, disabled: input.cancelling, kind: 'stop' }
  return {
    busy: input.sending,
    disabled: input.disabled || input.cancelling || input.sending || !input.hasText,
    kind: 'send',
  }
}

/** Reads the host-owned permission projection without inventing mobile state. */
export function readPermissionSelect(value: unknown): MobilePermissionSelect | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const source = value as Record<string, unknown>
  if (typeof source.currentValue !== 'string' || !Array.isArray(source.options)) return undefined
  const options = source.options.flatMap((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return []
    const option = item as Record<string, unknown>
    if (typeof option.value !== 'string' || typeof option.name !== 'string') return []
    return [
      {
        value: option.value,
        name: option.name,
        ...(typeof option.description === 'string' ? { description: option.description } : {}),
      },
    ]
  })
  return { currentValue: source.currentValue, options }
}

/** Maps built-in Agent preset ids to the Chinese labels used by the native composer. */
export function agentPresetLabel(value: string | undefined): string {
  if (value === undefined || value.trim() === '') return '标准模式'
  const labels: Record<string, string> = {
    standard: '标准模式',
    default: '标准模式',
    ptc: 'PTC 模式',
    minimal: '极简模式',
    creative: '创造模式',
  }
  return labels[value] ?? value
}

/** Resolves a permission label from the host option, retaining unknown host names. */
export function permissionLabel(value: string, source: MobilePermissionSelect | string): string {
  const option = typeof source === 'string' ? undefined : source.options.find(item => item.value === value)
  if (value === 'danger-full-access') return '完全访问'
  if (value === 'read-only') return '只读'
  if (value === 'workspace-write') return '工作区写入'
  return option?.name ?? (typeof source === 'string' ? source : value)
}

/** Supplies a localized fallback description for built-in permission presets. */
export function permissionDescription(value: string): string {
  if (value === 'read-only') return '禁止写入工作区。'
  if (value === 'workspace-write') return '允许在工作区内写入文件。'
  if (value === 'danger-full-access') return '不限制工作区访问范围。'
  return '由桌面端提供的权限预设。'
}

/** Formats the host-selected model and optional provider reasoning effort. */
export function modelLabel(model: MobileModelSelection | undefined): string {
  if (model === undefined) return '选择模型'
  return model.reasoningEffort === undefined ? model.model : `${model.model} · ${model.reasoningEffort}`
}
