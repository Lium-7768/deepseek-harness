/**
 * Platform-singleton module-table. These are the ONLY entities the shell
 * shares into the frozen module table — fetch bundles resolve their externals
 * against exactly this set through the loader's require. Keys come from the
 * platform constant module ({@link ./platform.ts}, the single source
 * of truth with the tsdown client externals); values stay shell-static
 * imports so every bundle sees the same instance.
 */
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as ReactDomClient from 'react-dom/client'
import * as Cordis from '@deepseek-ai/cordis'
import * as UiSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as UiPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import CommandsRemote from '@deepseek-ai/dsh-commands/remote'
import GoalsRemote from '@deepseek-ai/dsh-goal/remote'
import DynamicCordisRemote from '@deepseek-ai/dsh-cordis-host-runner/remote'
import FileReferenceRemote from '@deepseek-ai/dsh-file-reference/remote'
import PluginInventoryRemote from '@deepseek-ai/dsh-host-plugin-inventory/remote'
import MessageFeedbackRemote from '@deepseek-ai/dsh-message-feedback/remote'
import SessionReferenceRemote from '@deepseek-ai/dsh-session-reference/remote'
import type { PlatformModule } from './platform.ts'

/**
 * Build the static table handed to the module loader at boot.
 * @returns module specifier → exported entity (one entry per platform word).
 */
export function getStaticModules(): Record<string, unknown> {
  // The satisfies pin is the projection contract: a word added to
  // PLATFORM_MODULES without a static import here (or vice versa) fails to
  // compile instead of drifting into a runtime require miss.
  return {
    'react': React,
    'react/jsx-runtime': ReactJsxRuntime,
    'react-dom': ReactDom,
    'react-dom/client': ReactDomClient,
    '@deepseek-ai/cordis': Cordis,
    '@deepseek-ai/dsh-client-ui-slots': UiSlots,
    '@deepseek-ai/dsh-client-ui-primitives': UiPrimitives,
    '@deepseek-ai/dsh-commands/remote': CommandsRemote,
    '@deepseek-ai/dsh-goal/remote': GoalsRemote,
    '@deepseek-ai/dsh-cordis-host-runner/remote': DynamicCordisRemote,
    '@deepseek-ai/dsh-file-reference/remote': FileReferenceRemote,
    '@deepseek-ai/dsh-host-plugin-inventory/remote': PluginInventoryRemote,
    '@deepseek-ai/dsh-message-feedback/remote': MessageFeedbackRemote,
    '@deepseek-ai/dsh-session-reference/remote': SessionReferenceRemote,
  } satisfies Record<PlatformModule, unknown>
}
