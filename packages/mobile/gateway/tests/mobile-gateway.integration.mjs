import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { test } from 'node:test'
import { WebSocketServer } from 'ws'
import { MobileGateway } from '../lib/index.mjs'

function createServer(listener) {
  const server = createHttpServer(listener)
  const downlinks = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/api/events.mux' && request.url !== '/api/events.host') {
      socket.destroy()
      return
    }
    downlinks.handleUpgrade(request, socket, head, websocket => {
      const response = {
        writeHead() {},
        write(chunk) {
          for (const line of String(chunk).split(/\r?\n/)) {
            if (line.startsWith('data: ')) websocket.send(line.slice(6))
          }
        },
        end() { websocket.close() },
      }
      void listener({ url: request.url, method: 'GET', headers: { accept: 'text/event-stream' } }, response)
    })
  })
  return server
}

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
    const value = request.url === '/api/session.list'
      ? { items: [{ sessionId: 'session-1', running: false }] }
      : { events: [{ event: { type: 'message/created', seq: 7, content: 'Fixture history event' } }] }
    assert.ok(request.url === '/api/session.history' || request.url === '/api/session.list')
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


test('paired devices receive authenticated Host events without unrequested session mux data', async t => {
  let muxResponse
  let hostResponse
  const dsh = createServer((request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    if (request.url === '/api/events.host') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      hostResponse = response
      return
    }
    response.writeHead(404).end()
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    hostResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('SSE test phone')
  const authorization = `Bearer ${credential.deviceId}.${credential.accessToken}`
  const unauthorized = await fetch(`${status.url}/v1/events`)
  assert.equal(unauthorized.status, 401)

  const stream = await fetch(`${status.url}/v1/events`, { headers: { authorization } })
  assert.equal(stream.status, 200)
  assert.equal(stream.headers.get('content-type'), 'text/event-stream; charset=utf-8')
  const reader = stream.body?.getReader()
  assert.ok(reader)
  const mux = await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream for mobile SSE.')
  const host = await eventually(() => hostResponse, 'Gateway did not subscribe to the DSH host stream for mobile SSE.')
  mux.write(
    `data: ${JSON.stringify({
      type: 'server-request',
      rpcId: 'mux-rpc-1',
      payload: { type: 'session/event', sessionId: 'session-1', event: { seq: 12, type: 'assistant/message' } },
    })}\n\n`,
  )
  host.write(
    `data: ${JSON.stringify({
      type: 'server-request',
      rpcId: 'host-rpc-1',
      payload: { type: 'host/session-status', sessionId: 'session-1', running: true },
    })}\n\n`,
  )
  const events = await readSseEvents(reader, 2)
  assert.deepEqual(events[0], { contractVersion: 1, eventId: '1', type: 'gateway/ready', payload: {}, snapshot: true })
  assert.deepEqual(events[1], {
    contractVersion: 1,
    eventId: '3',
    type: 'host/session-status',
    payload: { type: 'host/session-status', sessionId: 'session-1', running: true },
    sessionId: 'session-1',
  })
  const heartbeat = await readSseChunk(reader)
  assert.match(heartbeat, /: heartbeat/)
  await reader.cancel()
})

test('paired session subscriptions replay only events newer than the durable snapshot watermark', async t => {
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      muxResponse = response
      return
    }
    if (request.url === '/api/events.host') return
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.fail(`unexpected DSH route ${request.url}`)
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('Subscription replay test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const stream = await fetch(`${status.url}/v1/events`, { headers })
  const reader = stream.body?.getReader()
  assert.ok(reader)
  const ready = await readSseEvents(reader, 1)
  assert.equal(ready[0].type, 'gateway/ready')
  const subscription = fetch(`${status.url}/v1/sessions/session-1/subscriptions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lastSeenSeq: 6 }),
  })
  const created = await subscription
  assert.equal(created.status, 200)
  const createdPayload = await created.json()
  assert.equal(createdPayload.data.snapshotSeq, 6)
  assert.deepEqual(createdPayload.data.snapshot.items, [])
  const mux = await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream for session subscription.')
  mux.write(`data: ${JSON.stringify({
    type: 'server-request',
    rpcId: 'stale-durable-event',
    payload: { type: 'session/event', sessionId: 'session-1', event: { seq: 6, type: 'assistant/message' } },
  })}\n\n`)
  mux.write(`data: ${JSON.stringify({
    type: 'server-request',
    rpcId: 'new-durable-event',
    payload: { type: 'session/event', sessionId: 'session-1', event: { seq: 7, type: 'assistant/message' } },
  })}\n\n`)
  await new Promise(resolve => setTimeout(resolve, 25))
  const activation = await fetch(`${status.url}/v1/subscriptions/${createdPayload.data.subscriptionId}/activate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ activationToken: createdPayload.data.activationToken, appliedSnapshotSeq: 6 }),
  })
  assert.equal(activation.status, 200)
  assert.deepEqual((await activation.json()).data, { activated: true })
  const replay = await readSseEvents(reader, 1)
  assert.deepEqual(replay, [{
    contractVersion: 1,
    eventId: '3',
    type: 'session/event',
    payload: { type: 'session/event', sessionId: 'session-1', event: { seq: 7, type: 'assistant/message' } },
    rpcId: 'new-durable-event',
    sessionId: 'session-1',
    seq: 7,
  }])
  await reader.cancel()
})

async function readSseChunk(reader) {
  const { done, value } = await reader.read()
  assert.equal(done, false)
  return new TextDecoder().decode(value)
}

async function readSseEvents(reader, count) {
  const decoder = new TextDecoder()
  const events = []
  let buffer = ''
  while (events.length < count) {
    const { done, value } = await reader.read()
    assert.equal(done, false)
    buffer += decoder.decode(value, { stream: true })
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = chunk
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6))
        .join('')
      if (data !== '') events.push(JSON.parse(data))
    }
  }
  return events
}


test('one-time pairing secrets create exactly one durable paired-device credential', async t => {
  let muxResponse
  const dsh = createServer((request, response) => {
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
  const offer = gateway.createPairing('Scanned iPhone')
  const redeemed = await fetch(`${status.url}/v1/pairing/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairingId: offer.pairingId, pairingSecret: offer.pairingSecret }),
  })
  assert.equal(redeemed.status, 200)
  const credential = (await redeemed.json()).data
  assert.equal(typeof credential.deviceId, 'string')
  assert.equal(typeof credential.accessToken, 'string')
  assert.deepEqual(gateway.pairedDevices(), [
    { deviceId: credential.deviceId, label: 'Scanned iPhone', createdAt: gateway.pairedDevices()[0].createdAt },
  ])

  const repeated = await fetch(`${status.url}/v1/pairing/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairingId: offer.pairingId, pairingSecret: offer.pairingSecret }),
  })
  assert.equal(repeated.status, 404)
  assert.deepEqual((await repeated.json()).error, {
    code: 'pairing-not-found',
    message: '配对码无效或已被使用，请重新扫描桌面端二维码。',
  })

  const rejectedOffer = gateway.createPairing('Wrong secret phone')
  const rejected = await fetch(`${status.url}/v1/pairing/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairingId: rejectedOffer.pairingId, pairingSecret: 'incorrect-secret' }),
  })
  assert.equal(rejected.status, 401)
  assert.deepEqual((await rejected.json()).error, {
    code: 'unauthorized',
    message: '配对码无效，请重新扫描桌面端二维码。',
  })
})

test('paired devices project jobs and delegate only goal and subagent controls', async t => {
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
      '/api/subagent.list': {
        entries: [{ kind: 'child', id: 'child-1', mode: 'continuable', activity: 'running', hasChildren: false, label: 'Research' }],
        parentAvailable: true,
      },
      '/api/subagent.history': {
        events: [{ event: { type: 'assistant/message', seq: 4, content: 'Child result' } }],
        hasMore: false,
      },
      '/api/subagent.prompt': { messageId: 'message-1' },
      '/api/subagent.interrupt': { accepted: true },
      '/api/goal.pause': { ref: { id: 'goal-1', revision: 2 } },
    }
    const value = values[request.url]
    if (value === undefined) {
      response.writeHead(404).end()
      return
    }
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
  const credential = gateway.pairDevice('Agent controls test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }

  const stream = await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream.')
  stream.write(
    `data: ${JSON.stringify({
      type: 'server-request',
      rpcId: 'jobs-rpc-1',
      method: 'events.mux',
      payload: {
        type: 'session/jobs',
        sessionId: 'parent-1',
        jobs: [{ id: 'job-1', kind: 'workflow', label: 'Research sources', status: 'running', startedAt: 1 }],
      },
    })}\n\n`,
  )

  const jobs = await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/parent-1/jobs`, { method: 'POST', headers, body: '{}' })
    const payload = await response.json()
    return payload.data?.items?.length === 1 ? payload : undefined
  }, 'Gateway did not retain the DSH jobs snapshot.')
  assert.deepEqual(jobs.data.items, [{ id: 'job-1', kind: 'workflow', label: 'Research sources', status: 'running', startedAt: 1 }])

  const subagents = await fetch(`${status.url}/v1/sessions/parent-1/subagents`, { method: 'POST', headers, body: '{}' })
  assert.equal(subagents.status, 200)
  assert.deepEqual((await subagents.json()).data, {
    entries: [{ kind: 'child', id: 'child-1', mode: 'continuable', activity: 'running', hasChildren: false, label: 'Research' }],
    parentAvailable: true,
  })

  const history = await fetch(`${status.url}/v1/sessions/parent-1/subagents/child-1/history`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'continuable' }),
  })
  assert.equal(history.status, 200)
  assert.deepEqual((await history.json()).data.items, [{ seq: 4, event: { type: 'assistant/message', seq: 4, content: 'Child result' } }])

  const invalidGoal = await fetch(`${status.url}/v1/sessions/parent-1/goal/pause`, { method: 'POST', headers, body: '{}' })
  assert.equal(invalidGoal.status, 400)
  assert.deepEqual((await invalidGoal.json()).error, { code: 'bad-request', message: '目标版本信息无效。' })

  const goal = await fetch(`${status.url}/v1/sessions/parent-1/goal/pause`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: { id: 'goal-1', revision: 1 } }),
  })
  assert.equal(goal.status, 200)
  assert.deepEqual((await goal.json()).data, { ref: { id: 'goal-1', revision: 2 } })

  const prompt = await fetch(`${status.url}/v1/sessions/parent-1/subagents/child-1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'continuable', content: [{ type: 'text', text: 'Continue the fixture.' }] }),
  })
  assert.equal(prompt.status, 200)
  assert.deepEqual((await prompt.json()).data, { messageId: 'message-1' })

  const invalidInterrupt = await fetch(`${status.url}/v1/sessions/parent-1/subagents/child-1/interrupt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'one-shot' }),
  })
  assert.equal(invalidInterrupt.status, 400)
  assert.deepEqual((await invalidInterrupt.json()).error, { code: 'bad-request', message: '只有可继续的子 Agent 可以停止。' })

  const interrupt = await fetch(`${status.url}/v1/sessions/parent-1/subagents/child-1/interrupt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'continuable' }),
  })
  assert.equal(interrupt.status, 200)
  assert.deepEqual((await interrupt.json()).data, { accepted: true })
  assert.deepEqual(calls, [
    { url: '/api/subagent.list', payload: { parentSessionId: 'parent-1' } },
    { url: '/api/subagent.history', payload: { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable' } },
    { url: '/api/goal.pause', payload: { sessionId: 'parent-1', ref: { id: 'goal-1', revision: 1 } } },
    {
      url: '/api/subagent.prompt',
      payload: {
        parentSessionId: 'parent-1',
        childSessionId: 'child-1',
        mode: 'continuable',
        content: [{ type: 'text', text: 'Continue the fixture.' }],
      },
    },
    { url: '/api/subagent.interrupt', payload: { parentSessionId: 'parent-1', childSessionId: 'child-1', mode: 'continuable' } },
  ])
})


test('paired devices may discuss only a structurally valid plan review request', async t => {
  let muxResponse
  let responseEnvelope
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    if (request.url !== '/api/respond') {
      response.writeHead(404).end()
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    responseEnvelope = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ accepted: true }))
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    muxResponse?.end()
    await gateway.stop()
    await close(dsh)
  })
  const credential = gateway.pairDevice('Plan review test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  const stream = await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream.')
  stream.write(
    `data: ${JSON.stringify({
      type: 'server-request',
      rpcId: 'plan-review-rpc-1',
      method: 'events.mux',
      payload: {
        type: 'question/requested',
        sessionId: 'session-1',
        questions: [{
          id: 'review-1',
          question: 'Approve the implementation plan?',
          detail: '# Implementation plan',
          intent: { kind: 'plan-review', approve: 'Approve' },
          options: [{ label: 'Approve' }, { label: 'Decline' }],
        }],
      },
    })}\n\n`,
  )
  await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/session-1/interactions`, { method: 'POST', headers, body: '{}' })
    const payload = await response.json()
    return payload.data?.items?.length === 1 ? payload : undefined
  }, 'Gateway did not retain the plan review request.')

  const discuss = await fetch(`${status.url}/v1/interactions/respond`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rpcId: 'plan-review-rpc-1',
      result: { ok: false, error: { code: 'cancelled', message: 'the user opened plan discussion', details: {} } },
    }),
  })
  assert.equal(discuss.status, 200)
  assert.deepEqual(responseEnvelope, {
    type: 'client-response',
    rpcId: 'plan-review-rpc-1',
    result: { ok: false, error: { code: 'cancelled', message: 'the user opened plan discussion', details: {} } },
  })
})


test('paired devices search only the desktop-visible session message surface', async t => {
  const calls = []
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    calls.push({ url: request.url, payload })
    if (request.url === '/api/session.search') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: payload.rpcId,
          result: { ok: true, value: { items: [{ sessionId: 'session-1', snippet: 'The matching desktop message.' }], hasMore: true } },
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
  const credential = gateway.pairDevice('Search test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream.')

  const response = await fetch(`${status.url}/v1/sessions/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: 'matching' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, {
    items: [{ sessionId: 'session-1', snippet: 'The matching desktop message.' }],
    hasMore: true,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, '/api/session.search')
  assert.equal(calls[0]?.payload.type, 'client-request')
  assert.equal(calls[0]?.payload.method, 'session.search')
  assert.deepEqual(calls[0]?.payload.payload, { query: 'matching' })

  const invalid = await fetch(`${status.url}/v1/sessions/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: 'invalid\u0000query' }),
  })
  assert.equal(invalid.status, 400)
  assert.equal(calls.length, 1)
})


test('paired devices read durable images only through the session-authorized attachment route', async t => {
  const calls = []
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    calls.push({ url: request.url, payload })
    if (request.url === '/api/session.attachment') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: payload.rpcId,
          result: {
            ok: true,
            value: {
              attachment: {
                attachmentId: 'image-a',
                mediaType: 'image/png',
                bytes: 4,
                width: 1,
                height: 1,
                name: 'fixture.png',
              },
              data: 'AA==',
            },
          },
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
  const credential = gateway.pairDevice('Attachment test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  await eventually(() => muxResponse, 'Gateway did not subscribe to the DSH mux stream.')

  const response = await fetch(`${status.url}/v1/sessions/session-a/attachments/image-a`, { method: 'POST', headers, body: '{}' })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, {
    attachment: { attachmentId: 'image-a', mediaType: 'image/png', bytes: 4, width: 1, height: 1, name: 'fixture.png' },
    data: 'AA==',
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, '/api/session.attachment')
  assert.equal(calls[0]?.payload.type, 'client-request')
  assert.equal(calls[0]?.payload.method, 'session.attachment')
  assert.deepEqual(calls[0]?.payload.payload, { sessionId: 'session-a', attachmentId: 'image-a' })
})


test('session list projects desktop history titles and blank metadata for the native workspace tree', async t => {
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const reply = value => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result: { ok: true, value } }))
    }
    if (request.url === '/api/session.list') {
      reply({
        items: [
          { sessionId: 'blank-session', title: 'New Session' },
          { sessionId: 'titled-session', title: 'New Session' },
        ],
      })
      return
    }
    if (request.url === '/api/workspace.list') {
      reply({
        items: [{ workspaceId: 'workspace-1', title: 'Fixture workspace', sessionIds: ['blank-session', 'titled-session'] }],
        archivedSessionIds: [],
      })
      return
    }
    if (request.url === '/api/session.history') {
      const sessionId = message.payload.sessionId
      reply({
        events: sessionId === 'titled-session'
          ? [{ event: { type: 'user/message', data: { role: 'user', content: '旧的首条用户文本' } } }]
          : [],
        projections: {
          asOfSeq: 1,
          values: sessionId === 'titled-session'
            ? { title: '桌面投影标题', sessionListMetadata: { blank: false } }
            : { title: null, sessionListMetadata: { blank: true } },
        },
      })
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
  const credential = gateway.pairDevice('Projection test phone')
  const response = await fetch(`${status.url}/v1/sessions/list`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
      'content-type': 'application/json',
    },
    body: '{}',
  })

  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data.items, [
    { sessionId: 'blank-session', title: 'New Session', blank: true },
    { sessionId: 'titled-session', title: '桌面投影标题', blank: false },
  ])
})


test('session event baseline reports a desktop session that is already running', async t => {
  let muxResponse
  const dsh = createServer(async (request, response) => {
    if (request.url === '/api/events.mux') {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      muxResponse = response
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const values = {
      '/api/session.history': {
        events: [
          { event: { type: 'turn/start', seq: 10, time: 1_000, data: { turn: 3 } } },
          { event: { type: 'tool/call', seq: 11, data: { turn: 3, callId: 'call-1', name: 'bash' } } },
        ],
      },
      '/api/session.list': {
        items: [{ sessionId: 'session-running', title: 'Running fixture', running: true }],
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
  const credential = gateway.pairDevice('Running-state fixture phone')
  const response = await fetch(`${status.url}/v1/sessions/session-running/events`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
      'content-type': 'application/json',
    },
    body: '{}',
  })

  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.data.status, 'running')
  assert.equal(payload.data.items.length, 2)
})
