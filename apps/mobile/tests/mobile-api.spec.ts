import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileApi, MobileApiError, mobileErrorMessage, redeemMobilePairing } from '../src/api/mobile-api.ts'

const connection = { gatewayUrl: 'http://127.0.0.1:52404', deviceId: 'device-1', accessToken: 'token-1' }

describe('MobileApi error presentation', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let warning: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warning.mockRestore()
    vi.unstubAllGlobals()
  })

  it('maps rejected network requests to Chinese UI text and keeps the raw diagnostic', async () => {
    fetchMock.mockRejectedValue(new Error('Failed to fetch'))

    const error = await requestError(() => new MobileApi(connection).listSessions())

    expect(error).toBeInstanceOf(MobileApiError)
    expect(error).toMatchObject({
      kind: 'network',
      userMessage: '无法连接桌面端，请检查网络或网关地址。',
      diagnostic: { rawMessage: 'Failed to fetch' },
    })
  })

  it('maps English credential faults without exposing their message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'unauthorized', message: 'Unauthorized' } }, 401))

    const error = await requestError(() => new MobileApi(connection).listSessions())

    expect(error).toMatchObject({
      kind: 'credentials',
      userMessage: '移动端凭据无效，请重新连接桌面端。',
      diagnostic: { code: 'unauthorized', status: 401, rawMessage: 'Unauthorized' },
    })
  })

  it('preserves an already Chinese gateway fault message', async () => {
    const message = '桌面端 DeepSeek Harness 当前不可用。'
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'upstream-unavailable', message } }, 502))

    const error = await requestError(() => new MobileApi(connection).listSessions())

    expect(error).toMatchObject({
      kind: 'desktop-unavailable',
      userMessage: message,
      diagnostic: { rawMessage: message },
    })
  })

  it('classifies unknown HTTP faults and invalid successful envelopes', async () => {
    fetchMock.mockResolvedValueOnce(new Response('backend failure', { status: 500 }))
    const httpError = await requestError(() => new MobileApi(connection).listSessions())
    expect(httpError).toMatchObject({ kind: 'http', userMessage: '移动端连接请求失败（HTTP 500），请稍后重试。' })

    fetchMock.mockResolvedValueOnce(jsonResponse({ contractVersion: 2, data: {} }, 200))
    const protocolError = await requestError(() => new MobileApi(connection).listSessions())
    expect(protocolError).toMatchObject({ kind: 'protocol', userMessage: '桌面端返回了无效响应，请稍后重试。' })
  })

  it('does not expose unknown English errors through the shared UI helper', () => {
    expect(mobileErrorMessage(new Error('Network request failed'), '连接失败，请稍后重试。')).toBe(
      '连接失败，请稍后重试。',
    )
    expect(mobileErrorMessage(new Error('桌面端当前不可用。'), '连接失败，请稍后重试。')).toBe('桌面端当前不可用。')
  })
})

describe('Mobile QR pairing redemption', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exchanges a valid desktop QR payload without requiring an existing device credential', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ contractVersion: 1, data: { deviceId: 'phone-1', accessToken: 'token-1' } }, 200))

    await expect(
      redeemMobilePairing({
        version: 1,
        gatewayUrl: 'https://desktop.example.test/mobile/',
        pairingId: 'pairing-1',
        pairingSecret: 'secret-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).resolves.toEqual({ gatewayUrl: 'https://desktop.example.test/mobile', deviceId: 'phone-1', accessToken: 'token-1' })

    expect(fetchMock).toHaveBeenCalledWith('https://desktop.example.test/mobile/v1/pairing/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairingId: 'pairing-1', pairingSecret: 'secret-1' }),
    })
  })

  it('rejects expired and already-used desktop pairing codes with recoverable Chinese messages', async () => {
    const expired = await requestError(() =>
      redeemMobilePairing({
        version: 1,
        gatewayUrl: 'https://desktop.example.test',
        pairingId: 'pairing-1',
        pairingSecret: 'secret-1',
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      }),
    )
    expect(expired).toMatchObject({ kind: 'pairing-invalid', userMessage: '该配对二维码已过期，请在桌面端重新生成。' })
    expect(fetchMock).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'pairing-not-found', message: 'Used' } }, 404))
    const used = await requestError(() =>
      redeemMobilePairing({
        version: 1,
        gatewayUrl: 'https://desktop.example.test',
        pairingId: 'pairing-1',
        pairingSecret: 'secret-1',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    )
    expect(used).toMatchObject({
      kind: 'pairing-invalid',
      userMessage: '该配对二维码无效、已使用或已过期，请在桌面端重新生成。',
      diagnostic: { code: 'pairing-not-found', status: 404, rawMessage: 'Used' },
    })
  })
})

describe('MobileApi capability requests', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ contractVersion: 1, data: {} }, 200)))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the gateway paths and request bodies for settings, model, and preset operations', async () => {
    const api = new MobileApi(connection)
    await api.settingsDescribe()
    await api.settingsUpdate({ ns: 'locale', patch: { locale: 'zh-CN' }, expectedRevision: 2 })
    await api.settingsMutate({ ns: 'permission', ops: [{ op: 'set', path: ['mode'], value: 'read-only' }] })
    await api.llmProviders()
    await api.llmModels()
    await api.sessionModels('session/a')
    await api.selectSessionModel('session/a', { provider: 'deepseek', model: 'chat', reasoningEffort: 'high' })
    await api.agentPresets()
    await api.agentPreset('preset/main')
    await api.selectSessionPreset('session/a', 'preset/main')

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect(
      calls.map(([url, init]) => ({
        url: new URL(url).pathname,
        body: JSON.parse(String(init.body)),
      })),
    ).toEqual([
      { url: '/v1/settings/describe', body: {} },
      { url: '/v1/settings/update', body: { ns: 'locale', patch: { locale: 'zh-CN' }, expectedRevision: 2 } },
      {
        url: '/v1/settings/mutate',
        body: { ns: 'permission', ops: [{ op: 'set', path: ['mode'], value: 'read-only' }] },
      },
      { url: '/v1/llm/providers', body: {} },
      { url: '/v1/llm/models', body: {} },
      { url: '/v1/sessions/session%2Fa/models', body: {} },
      { url: '/v1/sessions/session%2Fa/model', body: { provider: 'deepseek', model: 'chat', reasoningEffort: 'high' } },
      { url: '/v1/agent-presets/list', body: {} },
      { url: '/v1/agent-presets/read', body: { agentPreset: 'preset/main' } },
      { url: '/v1/sessions/session%2Fa/agent-preset', body: { agentPreset: 'preset/main' } },
    ])
  })

  it.each([
    ['session-not-found', 404, 'session-not-found', '未找到请求的会话或操作。'],
    ['model-unavailable', 400, 'model-unavailable', '所选模型当前不可用，请重新选择。'],
    ['agent-preset-locked', 400, 'agent-preset-locked', '会话已经开始，无法切换 Agent 模式。'],
    ['agent-preset-not-found', 404, 'agent-preset-not-found', '未找到所选 Agent 预设。'],
    ['settings-conflict', 409, 'settings-conflict', '设置已被其他窗口修改，请重新加载后再试。'],
  ] as const)('maps %s gateway faults to localized diagnostics', async (code, status, kind, userMessage) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code, message: 'English upstream detail' } }, status))

    const error = await requestError(() => new MobileApi(connection).listSessions())

    expect(error).toMatchObject({
      kind,
      userMessage,
      diagnostic: { code, status, rawMessage: 'English upstream detail' },
    })
  })
})

async function requestError(request: () => Promise<unknown>): Promise<MobileApiError> {
  try {
    await request()
  } catch (error) {
    if (error instanceof MobileApiError) return error
    throw error
  }
  throw new Error('expected request to fail')
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}


describe('MobileApi agent observation and control requests', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ contractVersion: 1, data: {} }, 200)))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the constrained Gateway paths for jobs, subagents, and goal mutations', async () => {
    const api = new MobileApi(connection)
    await api.sessionJobs('parent/a')
    await api.subagents('parent/a')
    await api.subagentHistory('parent/a', 'child/a', 'continuable')
    await api.sendSubagentMessage('parent/a', 'child/a', [{ type: 'text', text: 'Continue the task.' }])
    await api.interruptSubagent('parent/a', 'child/a')
    await api.mutateGoal('parent/a', 'pause', { id: 'goal-1', revision: 3 })
    await api.mutateGoal('parent/a', 'edit', { id: 'goal-1', revision: 3 }, { objective: 'Complete the review.' })

    const calls = fetchMock.mock.calls as Array<[string, RequestInit]>
    expect(
      calls.map(([url, init]) => ({
        url: new URL(url).pathname,
        body: JSON.parse(String(init.body)),
      })),
    ).toEqual([
      { url: '/v1/sessions/parent%2Fa/jobs', body: {} },
      { url: '/v1/sessions/parent%2Fa/subagents', body: {} },
      { url: '/v1/sessions/parent%2Fa/subagents/child%2Fa/history', body: { mode: 'continuable' } },
      {
        url: '/v1/sessions/parent%2Fa/subagents/child%2Fa/messages',
        body: { mode: 'continuable', content: [{ type: 'text', text: 'Continue the task.' }] },
      },
      { url: '/v1/sessions/parent%2Fa/subagents/child%2Fa/interrupt', body: { mode: 'continuable' } },
      { url: '/v1/sessions/parent%2Fa/goal/pause', body: { ref: { id: 'goal-1', revision: 3 } } },
      {
        url: '/v1/sessions/parent%2Fa/goal/edit',
        body: { ref: { id: 'goal-1', revision: 3 }, objective: 'Complete the review.' },
      },
    ])
  })
})
