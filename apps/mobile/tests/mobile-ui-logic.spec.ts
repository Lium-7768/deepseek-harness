import { describe, expect, it } from 'vitest'
import { messageActionLayout } from '../src/components/session-message-logic.ts'
import { settingsSectionIcon } from '../src/components/settings-logic.ts'

describe('mobile UI parity mappings', () => {
  it('keeps icon-only message actions in 44px touch targets with side-specific alignment', () => {
    expect(messageActionLayout('user')).toEqual({ alignSelf: 'flex-end', height: 44, width: 44 })
    expect(messageActionLayout('assistant')).toEqual({ alignSelf: 'flex-start', height: 44, width: 44 })
  })

  it('uses the Web canonical settings glyph semantics', () => {
    expect(settingsSectionIcon('general')).toBe('settings')
    expect(settingsSectionIcon('models')).toBe('data')
    expect(settingsSectionIcon('plugins')).toBe('personalization')
    expect(settingsSectionIcon('presets')).toBe('agent-preset')
  })
})
