import { Context } from '@deepseek-ai/cordis'
import { inject, apply as applyClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import commandsRemote from '@deepseek-ai/dsh-commands/remote'
import fileReferencesRemote from '@deepseek-ai/dsh-file-reference/remote'
import goalsRemote from '@deepseek-ai/dsh-goal/remote'
import sessionReferencesRemote from '@deepseek-ai/dsh-session-reference/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'

interface AgentContext extends Context {
  readonly agentId?: SessionId
}

interface RemoteCalls {
  readonly commands: {
    readonly execute: (agentId: string, line: string, images: readonly unknown[], signal?: AbortSignal) => Promise<unknown>
  }
  readonly fileReferences: {
    readonly list: (agentId: string, query: string, signal?: AbortSignal) => Promise<unknown>
  }
  readonly goals: {
    readonly create: (agentId: string, request: { readonly objective: string }) => Promise<unknown>
  }
  readonly sessionReferenceResolver: {
    readonly candidates: (agentId: string, query: string, signal?: AbortSignal) => Promise<unknown>
  }
}

const sharedContributions: readonly TypertRemoteContribution[] = [
  commandsRemote,
  goalsRemote,
  fileReferencesRemote,
  sessionReferencesRemote,
]

function endpointsWithScopedCancellation(contributions: readonly TypertRemoteContribution[]): readonly string[] {
  return contributions.flatMap(contribution => contribution.descriptors)
    .filter(descriptor => descriptor.scope !== undefined && descriptor.cancellation !== undefined)
    .map(descriptor => `${descriptor.namespace}/${descriptor.method}`)
    .sort()
}

describe('selected API Remote dispatch matrix', () => {
  it('keeps every direct Agent lookup with cancellation on its explicit direct wire form', async () => {
    expect(endpointsWithScopedCancellation(sharedContributions)).toEqual([
      'commands/execute',
      'fileReferences/list',
      'sessionReferenceResolver/candidates',
    ])

    const call = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'internal', message: 'fixture rejection', details: {} },
    })
    const ctx = new Context()
    await ctx.plugin(TypertRegistry)
    ctx.provide('connection', { rpc: { call } } as never)
    await ctx.plugin({ inject, apply: applyClientRemote })
    ctx.typert.contexts.registerClient('agent', {
      identity: candidate => (candidate as AgentContext).agentId,
    })
    const agentCtx = ctx.extend({ agentId: 'agent-remote-matrix' as SessionId }) as AgentContext
    const disposers = await Promise.all(sharedContributions.map(contribution => ctx.remote.$mount(contribution)))
    const remote = agentCtx.remote as unknown as RemoteCalls
    const cancellation = new AbortController().signal

    await remote.commands.execute('agent-explicit', '/goal ship', [])
    await remote.goals.create('agent-explicit', { objective: 'audit explicit direct dispatch' })
    await remote.fileReferences.list('agent-explicit', 'report', cancellation)
    await remote.sessionReferenceResolver.candidates('agent-explicit', 'prior', cancellation)

    expect(call).toHaveBeenNthCalledWith(
      1,
      '/api',
      'commands/execute',
      { args: { agentId: 'agent-explicit', line: '/goal ship', images: [] } },
      expect.any(AbortSignal),
    )
    expect(call).toHaveBeenNthCalledWith(
      2,
      '/api',
      'goals/create',
      { args: { agentId: 'agent-explicit', request: { objective: 'audit explicit direct dispatch' } } },
      expect.any(AbortSignal),
    )
    expect(call).toHaveBeenNthCalledWith(
      3,
      '/api',
      'fileReferences/list',
      { args: { agentId: 'agent-explicit', query: 'report' } },
      expect.any(AbortSignal),
    )
    expect(call).toHaveBeenNthCalledWith(
      4,
      '/api',
      'sessionReferenceResolver/candidates',
      { args: { agentId: 'agent-explicit', query: 'prior' } },
      expect.any(AbortSignal),
    )

    for (const dispose of disposers.reverse()) await dispose()
    await ctx.fiber.dispose()
  })
})
