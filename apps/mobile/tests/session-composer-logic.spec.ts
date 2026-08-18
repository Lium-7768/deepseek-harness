import { describe, expect, it } from 'vitest'
import {
  agentPresetLabel,
  composerInputPolicy,
  composerPrimaryAction,
  modelLabel,
  permissionDescription,
  permissionLabel,
  readPermissionSelect,
} from '../src/components/session-composer-logic.ts'

describe('session composer projections', () => {
  it('keeps multiline Return for newlines and makes send explicit', () => {
    expect(composerInputPolicy).toEqual({ returnKeyType: 'default', submitBehavior: 'newline' })
  })

  it('keeps stop available while sending and shows busy state for both actions', () => {
    expect(
      composerPrimaryAction({ cancelling: false, disabled: false, hasText: true, running: true, sending: true }),
    ).toEqual({ busy: false, disabled: false, kind: 'stop' })
    expect(
      composerPrimaryAction({ cancelling: true, disabled: false, hasText: true, running: true, sending: false }),
    ).toEqual({ busy: true, disabled: true, kind: 'stop' })
    expect(
      composerPrimaryAction({ cancelling: false, disabled: false, hasText: true, running: false, sending: true }),
    ).toEqual({ busy: true, disabled: true, kind: 'send' })
  })

  it('accepts only a valid host permission projection and keeps descriptions', () => {
    const value = readPermissionSelect({
      currentValue: 'workspace-write',
      options: [
        { value: 'workspace-write', name: 'workspace-write', description: 'write in workspace' },
        { value: 1, name: 'invalid' },
      ],
    })
    expect(value).toEqual({
      currentValue: 'workspace-write',
      options: [{ value: 'workspace-write', name: 'workspace-write', description: 'write in workspace' }],
    })
    expect(readPermissionSelect({ currentValue: 'workspace-write', options: 'invalid' })).toBeUndefined()
  })

  it('localizes built-in composer labels without hiding unknown host values', () => {
    const permissions = readPermissionSelect({
      currentValue: 'danger-full-access',
      options: [
        { value: 'danger-full-access', name: 'danger-full-access' },
        { value: 'custom-host', name: 'Custom host' },
      ],
    })
    if (permissions === undefined) throw new Error('expected permission projection')
    expect(permissionLabel('danger-full-access', permissions)).toBe('完全访问')
    expect(permissionLabel('custom-host', permissions)).toBe('Custom host')
    expect(permissionLabel('read-only', 'read-only')).toBe('只读')
    expect(permissionDescription('workspace-write')).toContain('工作区')
  })

  it('formats preset and model selections for the native controls', () => {
    expect(agentPresetLabel(undefined)).toBe('标准模式')
    expect(agentPresetLabel('ptc')).toBe('PTC 模式')
    expect(agentPresetLabel('custom')).toBe('custom')
    expect(modelLabel(undefined)).toBe('选择模型')
    expect(modelLabel({ provider: 'deepseek', model: 'chat', reasoningEffort: 'high' })).toBe('chat · high')
  })
})
