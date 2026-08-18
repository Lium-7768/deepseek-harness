import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { MobileGateway } from '../lib/index.mjs'

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing test listener address')
  return `http://127.0.0.1:${address.port}`
}

async function close(server) {
  await new Promise((resolve, reject) => server.close(error => (error === undefined ? resolve() : reject(error))))
}

async function eventually(check, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = await check()
    if (value !== undefined) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(message)
}

test('paired devices receive and answer only current DSH interactions', async t => {
  let muxResponse
  let responseEnvelope
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      assert.equal(request.method, 'GET')
      assert.equal(request.headers.accept, 'text/event-stream')
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (request.url === '/api/session.list') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: message.rpcId,
          result: { ok: true, value: { items: [{ sessionId: 'session-1', title: 'Fixture session' }] } },
        }),
      )
      return
    }
    if (request.url === '/api/workspace.list') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: message.rpcId,
          result: {
            ok: true,
            value: {
              items: [
                {
                  workspaceId: 'workspace-1',
                  title: 'Fixture workspace',
                  path: '/fixture/workspace',
                  sessionIds: ['session-1'],
                },
              ],
              archivedSessionIds: ['archived-1'],
            },
          },
        }),
      )
      return
    }
    if (request.url === '/api/respond') {
      responseEnvelope = message
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ accepted: true }))
      return
    }
    if (request.url === '/api/session.cancel') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: message.rpcId,
          result: { ok: false, error: { code: 'session-not-found', message: 'fixture rejection detail', details: {} } },
        }),
      )
      return
    }
    response.writeHead(404).end()
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('Integration test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const health = await fetch(`${status.url}/v1/health`)
  assert.equal(health.status, 200)
  const unauthorized = await fetch(`${status.url}/v1/sessions/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unauthorized.status, 401)
  assert.deepEqual((await unauthorized.json()).error, { code: 'unauthorized', message: '需要已配对的移动设备凭据。' })
  const authorized = await fetch(`${status.url}/v1/sessions/list`, { method: 'POST', headers, body: '{}' })
  assert.equal(authorized.status, 200)
  assert.deepEqual((await authorized.json()).data, {
    items: [{ sessionId: 'session-1', title: 'Fixture session' }],
    workspaces: [
      { workspaceId: 'workspace-1', title: 'Fixture workspace', path: '/fixture/workspace', sessionIds: ['session-1'] },
    ],
    archivedSessionIds: ['archived-1'],
  })

  const unavailable = await fetch(`${status.url}/v1/sessions/session-1/history`, {
    method: 'POST',
    headers,
    body: '{}',
  })
  assert.equal(unavailable.status, 502)
  assert.deepEqual((await unavailable.json()).error, {
    code: 'upstream-unavailable',
    message: '桌面端 DeepSeek Harness 当前不可用。',
  })
  const rejected = await fetch(`${status.url}/v1/sessions/session-1/cancel`, { method: 'POST', headers, body: '{}' })
  assert.equal(rejected.status, 404)
  assert.deepEqual((await rejected.json()).error, { code: 'session-not-found', message: '未找到请求的会话。' })

  const stream = await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream.')
  stream.write(
    `data: ${JSON.stringify({
      type: 'server-request',
      rpcId: 'approval-rpc-1',
      method: 'events.mux',
      payload: {
        type: 'approval/requested',
        sessionId: 'session-1',
        approvalId: 'approval-1',
        toolName: 'shell',
        reason: 'Run a safe fixture command.',
      },
    })}\n\n`,
  )

  const interactions = await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/session-1/interactions`, {
      method: 'POST',
      headers,
      body: '{}',
    })
    const payload = await response.json()
    if (!response.ok || payload.data === undefined)
      throw new Error('interaction endpoint returned ' + response.status + ': ' + JSON.stringify(payload))
    return payload.data.items.length === 1 ? payload : undefined
  }, 'Gateway did not retain the DSH approval request.')
  assert.equal(interactions.data.items[0].rpcId, 'approval-rpc-1')
  assert.equal(interactions.data.items[0].type, 'approval/requested')

  const invalid = await fetch(`${status.url}/v1/interactions/respond`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ rpcId: 'not-current', result: { ok: true, value: {} } }),
  })
  assert.equal(invalid.status, 400)
  assert.deepEqual((await invalid.json()).error, { code: 'bad-request', message: '响应与当前的权限或问题请求不匹配。' })
  const response = await fetch(`${status.url}/v1/interactions/respond`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rpcId: 'approval-rpc-1',
      result: { ok: true, value: { sessionId: 'session-1', approvalId: 'approval-1', outcome: 'allowed-once' } },
    }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(responseEnvelope, {
    type: 'client-response',
    rpcId: 'approval-rpc-1',
    result: { ok: true, value: { sessionId: 'session-1', approvalId: 'approval-1', outcome: 'allowed-once' } },
  })
  const cleared = await fetch(`${status.url}/v1/sessions/session-1/interactions`, {
    method: 'POST',
    headers,
    body: '{}',
  })
  assert.deepEqual((await cleared.json()).data.items, [])

  assert.equal(gateway.revokeDevice(credential.deviceId), true)
  const revoked = await fetch(`${status.url}/v1/sessions/list`, { method: 'POST', headers, body: '{}' })
  assert.equal(revoked.status, 401)
})

test('paired devices receive normalized DSH history events', async t => {
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      assert.equal(request.method, 'GET')
      assert.equal(request.headers.accept, 'text/event-stream')
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(request.url, '/api/session.history')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: message.rpcId,
        result: {
          ok: true,
          value: { events: [{ event: { type: 'message/created', seq: 7, content: 'Fixture history event' } }] },
        },
      }),
    )
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('History test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const history = await fetch(`${status.url}/v1/sessions/session-1/history`, { method: 'POST', headers, body: '{}' })
  assert.equal(history.status, 200)
  assert.deepEqual((await history.json()).data.items, [
    {
      seq: 7,
      event: { type: 'message/created', seq: 7, content: 'Fixture history event' },
    },
  ])
  const events = await fetch(`${status.url}/v1/sessions/session-1/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ since: 6 }),
  })
  assert.equal(events.status, 200)
  assert.deepEqual((await events.json()).data, {
    since: 6,
    items: [{ seq: 7, event: { type: 'message/created', seq: 7, content: 'Fixture history event' } }],
    status: 'idle',
  })
})


test('paired devices delegate session lifecycle and history paging to DSH', async t => {
  let muxResponse
  const calls = []
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    calls.push({ url: request.url, payload: message.payload })
    const values = {
      '/api/session.create': { sessionId: 'created-session' },
      '/api/session.rename': { title: 'Renamed session', seq: 12 },
      '/api/session.fork': { sessionId: 'forked-session' },
      '/api/workspace.archiveSession': { archivedSessionIds: ['session-1'] },
      '/api/workspace.rename': { workspace: { workspaceId: 'workspace-1', title: 'Renamed workspace' } },
      '/api/workspace.delete': { deleted: true },
      '/api/session.history': {
        events: [{ event: { type: 'assistant/message', seq: 4, content: 'Older response' } }],
        hasMore: true,
      },
    }
    const value = values[request.url]
    assert.notEqual(value, undefined, `unexpected DSH route ${request.url}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result: { ok: true, value } }))
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('Lifecycle test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const post = async (path, body) => {
    const response = await fetch(`${status.url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    assert.equal(response.status, 200)
    return response.json()
  }

  assert.deepEqual((await post('/v1/sessions/create', { agentPreset: 'standard' })).data, { sessionId: 'created-session' })
  assert.deepEqual((await post('/v1/sessions/session-1/rename', { title: 'Renamed session' })).data, {
    title: 'Renamed session',
    seq: 12,
  })
  assert.deepEqual((await post('/v1/sessions/session-1/fork', { atSeq: 9 })).data, { sessionId: 'forked-session' })
  assert.deepEqual((await post('/v1/sessions/session-1/archive', {})).data, { archivedSessionIds: ['session-1'] })
  assert.deepEqual((await post('/v1/workspaces/workspace-1/rename', { title: 'Renamed workspace' })).data, {
    workspace: { workspaceId: 'workspace-1', title: 'Renamed workspace' },
  })
  assert.deepEqual((await post('/v1/workspaces/workspace-1/delete', {})).data, { deleted: true })
  assert.deepEqual((await post('/v1/sessions/session-1/history', { beforeSeq: 5, maxMessages: 20 })).data.items, [
    { seq: 4, event: { type: 'assistant/message', seq: 4, content: 'Older response' } },
  ])
  assert.deepEqual(calls, [
    { url: '/api/session.create', payload: { agentPreset: 'standard' } },
    { url: '/api/session.rename', payload: { sessionId: 'session-1', title: 'Renamed session' } },
    { url: '/api/session.fork', payload: { sessionId: 'session-1', atSeq: 9 } },
    { url: '/api/workspace.archiveSession', payload: { sessionId: 'session-1' } },
    { url: '/api/workspace.rename', payload: { workspaceId: 'workspace-1', title: 'Renamed workspace' } },
    { url: '/api/workspace.delete', payload: { workspaceId: 'workspace-1' } },
    { url: '/api/session.history', payload: { sessionId: 'session-1', beforeSeq: 5, maxMessages: 20 } },
  ])
})


test('paired devices forward validated text and image prompt content to DSH', async t => {
  let muxResponse
  let promptPayload
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(request.url, '/api/session.prompt')
    promptPayload = message.payload
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result: { ok: true, value: { accepted: true } } }))
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('Image prompt test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const content = [
    { type: 'text', text: '请分析这张图片' },
    { type: 'image', mediaType: 'image/jpeg', data: 'aGVsbG8=', name: 'fixture.jpg' },
  ]
  const accepted = await fetch(`${status.url}/v1/sessions/session-1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content }),
  })
  assert.equal(accepted.status, 200)
  assert.deepEqual((await accepted.json()).data, { accepted: true })
  assert.deepEqual(promptPayload, { sessionId: 'session-1', mode: 'queue', content })

  const invalid = await fetch(`${status.url}/v1/sessions/session-1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: [{ type: 'image', mediaType: 'image/svg+xml', data: 'aGVsbG8=' }] }),
  })
  assert.equal(invalid.status, 400)
  assert.deepEqual((await invalid.json()).error, { code: 'bad-request', message: '图片格式必须为 GIF、JPEG、PNG 或 WebP。' })
})


test('paired devices read the authoritative DSH queue snapshot from the mux stream', async t => {
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    response.writeHead(404).end()
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('Queue snapshot test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const stream = await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream.')
  const push = payload => stream.write(`data: ${JSON.stringify({ type: 'server-request', rpcId: crypto.randomUUID(), payload })}\n\n`)
  push({ type: 'session/subscribed', sessionId: 'session-1', lastSeq: 4 })
  push({
    type: 'session/queue',
    sessionId: 'session-1',
    items: [
      {
        id: 'queued-message-1',
        placement: 'queued',
        message: { id: 'message-1', role: 'user', content: [{ type: 'text', text: 'Queued fixture' }] },
      },
    ],
  })
  const snapshot = await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/session-1/queue`, { method: 'POST', headers, body: '{}' })
    const payload = await response.json()
    return payload.data?.items?.length === 1 ? payload : undefined
  }, 'Gateway did not retain the DSH queue snapshot.')
  assert.deepEqual(snapshot.data.items, [
    {
      id: 'queued-message-1',
      placement: 'queued',
      message: { id: 'message-1', role: 'user', content: [{ type: 'text', text: 'Queued fixture' }] },
    },
  ])
  push({ type: 'session/subscribed', sessionId: 'session-1', lastSeq: 5 })
  const cleared = await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/session-1/queue`, { method: 'POST', headers, body: '{}' })
    const payload = await response.json()
    return payload.data?.items?.length === 0 ? payload : undefined
  }, 'Gateway did not clear a stale queue snapshot at the next subscription boundary.')
  assert.deepEqual(cleared.data, { items: [] })
})
