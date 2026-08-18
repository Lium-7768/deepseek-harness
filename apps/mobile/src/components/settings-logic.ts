import type { NativeIconName } from '@/components/native-icon'

/** Mobile settings section ids and their Web settings navigation glyphs. */
export type MobileSettingsSection = 'general' | 'models' | 'plugins' | 'presets'

/** Maps native route ids to Web canonical settings icon semantics. */
export function settingsSectionIcon(section: MobileSettingsSection): NativeIconName {
  if (section === 'models') return 'data'
  if (section === 'plugins') return 'personalization'
  if (section === 'presets') return 'agent-preset'
  return 'settings'
}
