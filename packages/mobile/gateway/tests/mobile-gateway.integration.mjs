import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { WebSocketServer } from 'ws'
import { MobileGateway } from '../lib/index.js'

/** One logical Remote stream registry entry the test uses to push downstream frames. */
function createChannel() {
  return {
    send: undefined,
    push(frame) {
      if (this.send === undefined) throw new Error('fixture stream is not open yet')
      this.send({ type: 'item', value: frame })
    },
    pushRaw(frame) {
      if (this.send === undefined) throw new Error('fixture stream is not open yet')
      this.send(frame)
    },
  }
}

/**
 * Builds one fake DSH runtime speaking the api-gateway wire protocol: unary
 * Remote RPCs through `POST /api` and logical Remote streams multiplexed over
 * `WS /api/remote.mux` with open/item/error/end frames.
 */
function createFakeDsh({ unary = {}, streamOverrides = {} } = {}) {
  const calls = []
  const events = createChannel()
  const control = createChannel()
  const workspace = createChannel()
  const follows = new Map()
  const results = createChannel()
  const server = createHttpServer(async (request, response) => {
    if (request.url !== '/api' || request.method !== 'POST') {
      response.writeHead(404).end()
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const reply = result => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result }))
    }
    calls.push({ method: message.method, args: message.payload?.args })
    const handler = unary[message.method]
    if (handler === undefined) {
      reply({ ok: false, error: { code: 'fixture-route', message: `unexpected method ${message.method}`, details: {} } })
      return
    }
    try {
      reply({ ok: true, value: await handler(message.payload?.args ?? {}, message) })
    } catch (error) {
      reply({ ok: false, error: { code: error.code ?? 'fixture-error', message: String(error.message), details: {} } })
    }
  })
  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/api/remote.mux') {
      socket.destroy()
      return
    }
    sockets.handleUpgrade(request, socket, head, (websocket) => {
      websocket.on('message', (data) => {
        const open = JSON.parse(String(data))
        if (open.type !== 'open') return
        const send = frame => websocket.send(JSON.stringify({ ...frame, streamId: open.streamId }))
        const endpoint = open.endpoint
        const args = open.payload?.args ?? {}
        if (endpoint === '$events') {
          events.send = send
          send({ type: 'item', value: { type: 'ready', clientId: 'client-fixture', host: { home: '/fixture' } } })
          return
        }
        if (endpoint === 'session/control') {
          control.send = send
          send({
            type: 'item',
            value: { type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } },
          })
          return
        }
        if (endpoint === 'workspace/follow') {
          workspace.send = send
          send({ type: 'item', value: { type: 'baseline', items: [], archivedSessionIds: [] } })
          return
        }
        if (endpoint === 'session/follow' && streamOverrides[endpoint] === undefined) {
          const address = args.request?.address
          if (address?.kind === 'session') {
            const channel = follows.get(address.sessionId) ?? createChannel()
            follows.set(address.sessionId, channel)
            channel.send = send
            send({
              type: 'item',
              value: {
                type: 'snapshot',
                cursor: 0,
                records: [],
                hasMore: false,
                projections: { asOfSeq: 0, values: {} },
              },
            })
            return
          }
        }
        const override = streamOverrides[endpoint]
        if (override !== undefined) {
          override(send, args)
          return
        }
        send({ type: 'end' })
      })
    })
  })
  return {
    server,
    calls,
    events,
    control,
    workspace,
    follows,
    results,
    async close() {
      for (const socket of sockets.clients) socket.terminate()
      await new Promise((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    },
  }
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

async function eventually(check, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await check()
    if (value !== undefined) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(message)
}

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

test('paired devices receive and answer only current DSH interactions', async t => {
  let resultArgs
  const dsh = createFakeDsh({
    unary: {
      'session/list': () => ({ items: [{ sessionId: 'session-1', title: 'Fixture session', blank: false }] }),
      'session/cancel': () => {
        const error = new Error('fixture rejection detail')
        error.code = 'session-not-found'
        throw error
      },
      '$events/result': (args) => {
        resultArgs = args
        return undefined
      },
    },
    streamOverrides: {
      // The fixture offers no session log; history reads must fail as unavailable.
      'session/follow': send => send({ type: 'end' }),
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
    items: [{ sessionId: 'session-1', title: 'Fixture session', blank: false }],
    workspaces: [],
    archivedSessionIds: [],
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

  await eventually(() => dsh.events.send, 'Gateway did not subscribe to the DSH event stream.')
  dsh.events.push({
    type: 'waterfall',
    event: 'approval/request',
    eventId: 'approval-rpc-1',
    agentId: 'session-1',
    request: { toolName: 'shell', reason: 'Run a safe fixture command.' },
  })

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
  assert.equal(interactions.data.items[0].payload.toolName, 'shell')
  assert.equal(interactions.data.items[0].payload.approvalId, 'approval-rpc-1')

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
      result: { ok: true, value: { sessionId: 'session-1', approvalId: 'approval-rpc-1', outcome: 'allowed-once' } },
    }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(resultArgs, {
    clientId: 'client-fixture',
    eventId: 'approval-rpc-1',
    outcome: { kind: 'result', value: 'allowed-once' },
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

test('paired devices read message-aligned history through the DSH follow snapshot', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/list': () => ({ items: [{ sessionId: 'session-1', running: false, blank: false }] }),
    },
    streamOverrides: {
      'session/follow': (send) => {
        send({
          type: 'item',
          value: {
            type: 'snapshot',
            cursor: 7,
            records: [{ type: 'event', event: { type: 'message/created', seq: 7, time: 1, data: { content: 'Fixture history event' } } }],
            hasMore: false,
            projections: { asOfSeq: 7, values: {} },
          },
        })
        send({ type: 'end' })
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
      event: { type: 'message/created', seq: 7, time: 1, data: { content: 'Fixture history event' } },
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
    items: [{ seq: 7, event: { type: 'message/created', seq: 7, time: 1, data: { content: 'Fixture history event' } } }],
    status: 'idle',
  })
})

test('paired devices delegate session lifecycle and history paging to DSH', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/create': () => ({ sessionId: 'created-session' }),
      'session/rename': () => ({ title: 'Renamed session', seq: 12 }),
      'session/fork': () => ({ sessionId: 'forked-session' }),
      'workspace/archiveSession': () => ({ archivedSessionIds: ['session-1'] }),
      'workspace/rename': () => ({ workspace: { workspaceId: 'workspace-1', title: 'Renamed workspace' } }),
      'workspace/delete': () => ({ deleted: true }),
      'session/page': () => ({
        records: [{ type: 'event', event: { type: 'assistant/message', seq: 4, time: 1, data: { content: 'Older response' } } }],
        hasMore: true,
      }),
    },
    streamOverrides: {
      'session/follow': (send) => {
        send({
          type: 'item',
          value: { type: 'snapshot', cursor: 9, records: [], hasMore: true, projections: { asOfSeq: 9, values: {} } },
        })
        send({ type: 'end' })
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
    { seq: 4, event: { type: 'assistant/message', seq: 4, time: 1, data: { content: 'Older response' } } },
  ])
  assert.deepEqual(dsh.calls, [
    { method: 'session/create', args: { request: { agentPreset: 'standard' } } },
    { method: 'session/rename', args: { request: { sessionId: 'session-1', title: 'Renamed session' } } },
    { method: 'session/fork', args: { request: { sessionId: 'session-1', atSeq: 9 } } },
    { method: 'workspace/archiveSession', args: { request: { sessionId: 'session-1' } } },
    { method: 'workspace/rename', args: { request: { workspaceId: 'workspace-1', title: 'Renamed workspace' } } },
    { method: 'workspace/delete', args: { request: { workspaceId: 'workspace-1' } } },
    {
      method: 'session/page',
      args: { request: { address: { kind: 'session', sessionId: 'session-1' }, throughSeq: 9, beforeSeq: 5, maxMessages: 20 } },
    },
  ])
})

test('paired devices forward validated text and image prompt content to DSH', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/prompt': args => {
        assert.equal(args.request.mode, 'queue')
        assert.equal(typeof args.request.requestId, 'string')
        return { accepted: true }
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
  assert.equal(dsh.calls.length, 1)
  assert.deepEqual(dsh.calls[0].args.request.content, content)

  const invalid = await fetch(`${status.url}/v1/sessions/session-1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: [{ type: 'image', mediaType: 'image/svg+xml', data: 'aGVsbG8=' }] }),
  })
  assert.equal(invalid.status, 400)
  assert.deepEqual((await invalid.json()).error, { code: 'bad-request', message: '图片格式必须为 GIF、JPEG、PNG 或 WebP。' })
})

test('paired devices read the authoritative DSH queue snapshot from the control stream', async t => {
  const dsh = createFakeDsh()
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
  })
  const credential = gateway.pairDevice('Queue snapshot test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  await eventually(() => dsh.control.send, 'Gateway did not subscribe to the DSH control stream.')
  dsh.control.push({
    type: 'queue',
    sessionId: 'session-1',
    items: [
      {
        id: 'queued-message-1',
        placement: 'queued',
        message: { id: 'message-1', content: [{ type: 'text', text: 'Queued fixture' }] },
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
      message: { id: 'message-1', content: [{ type: 'text', text: 'Queued fixture' }] },
    },
  ])
  dsh.control.push({ type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } })
  const cleared = await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/session-1/queue`, { method: 'POST', headers, body: '{}' })
    const payload = await response.json()
    return payload.data?.items?.length === 0 ? payload : undefined
  }, 'Gateway did not clear a stale queue snapshot at the next control baseline.')
  assert.deepEqual(cleared.data, { items: [] })
})

test('paired devices receive Host session events through the forwarded event stream', async t => {
  const dsh = createFakeDsh()
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
  await eventually(() => dsh.events.send, 'Gateway did not subscribe to the DSH event stream for mobile SSE.')
  dsh.events.push({ type: 'emit', event: 'api-session/added', args: [{ sessionId: 'session-1', running: false, blank: true }] })
  dsh.events.push({ type: 'emit', event: 'api-session/status', args: ['session-1', true] })
  const events = await readSseEvents(reader, 3)
  assert.deepEqual(events[0], { contractVersion: 1, eventId: '1', type: 'gateway/ready', payload: {}, snapshot: true })
  assert.equal(events[1].type, 'host/session-added')
  assert.equal(events[1].sessionId, 'session-1')
  assert.equal(events[2].type, 'host/session-status')
  assert.equal(events[2].sessionId, 'session-1')
  assert.deepEqual(events[2].payload, { running: true })
  const heartbeat = await readSseChunk(reader)
  assert.match(heartbeat, /: heartbeat/)
  await reader.cancel()
})

test('paired session subscriptions replay only events newer than the durable snapshot watermark', async t => {
  const dsh = createFakeDsh()
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
  const created = await fetch(`${status.url}/v1/sessions/session-1/subscriptions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ lastSeenSeq: 6 }),
  })
  assert.equal(created.status, 200)
  const createdPayload = await created.json()
  assert.equal(createdPayload.data.snapshotSeq, 6)
  assert.deepEqual(createdPayload.data.snapshot.items, [])
  await eventually(() => dsh.follows.get('session-1')?.send, 'Gateway did not subscribe to the DSH session follow stream.')
  dsh.follows.get('session-1').push({ type: 'event', event: { seq: 6, type: 'assistant/message', time: 1, data: {} } })
  dsh.follows.get('session-1').push({ type: 'event', event: { seq: 7, type: 'assistant/message', time: 1, data: {} } })
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
    payload: { event: { seq: 7, type: 'assistant/message', time: 1, data: {} } },
    sessionId: 'session-1',
    seq: 7,
  }])
  await reader.cancel()
})

test('one-time pairing secrets create exactly one durable paired-device credential', async t => {
  const dsh = createFakeDsh()
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
  const dsh = createFakeDsh({
    unary: {
      'subagents/list': args => {
        assert.deepEqual(args, { parentSessionId: 'parent-1' })
        return {
          entries: [{ kind: 'child', id: 'child-1', mode: 'continuable', activity: 'running', hasChildren: false, label: 'Research' }],
          parentAvailable: true,
        }
      },
      'subagents/prompt': args => {
        assert.equal(args.request.parentSessionId, 'parent-1')
        assert.equal(args.request.childSessionId, 'child-1')
        assert.equal(args.request.mode, 'continuable')
        assert.equal(args.request.delivery, 'queue')
        assert.equal(typeof args.request.requestId, 'string')
        return { messageId: 'message-1' }
      },
      'subagents/interruptByParent': args => {
        assert.deepEqual(args, { childSessionId: 'child-1', parentSessionId: 'parent-1', mode: 'continuable' })
        return { accepted: true }
      },
      'goals/pause': args => {
        assert.deepEqual(args, { agentId: 'parent-1', ref: { id: 'goal-1', revision: 1 } })
        return { ref: { id: 'goal-1', revision: 2 } }
      },
    },
    streamOverrides: {
      'session/follow': (send, args) => {
        assert.equal(args.request.address.kind, 'subagent')
        assert.deepEqual(args.request.address, {
          kind: 'subagent',
          parentSessionId: 'parent-1',
          childSessionId: 'child-1',
          mode: 'continuable',
        })
        send({
          type: 'item',
          value: {
            type: 'snapshot',
            cursor: 4,
            records: [{ type: 'event', event: { type: 'assistant/message', seq: 4, time: 1, data: { content: 'Child result' } } }],
            hasMore: false,
            projections: { asOfSeq: 4, values: {} },
          },
        })
        send({ type: 'end' })
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
  })
  const credential = gateway.pairDevice('Agent controls test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }

  await eventually(() => dsh.control.send, 'Gateway did not subscribe to the DSH control stream.')
  dsh.control.push({
    type: 'jobs',
    sessionId: 'parent-1',
    jobs: [{ id: 'job-1', kind: 'workflow', label: 'Research sources', status: 'running', startedAt: 1 }],
  })
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
  assert.deepEqual((await history.json()).data.items, [{ seq: 4, event: { type: 'assistant/message', seq: 4, time: 1, data: { content: 'Child result' } } }])

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
})

test('paired devices may discuss only a structurally valid plan review request', async t => {
  let resultArgs
  const dsh = createFakeDsh({
    unary: {
      '$events/result': (args) => {
        resultArgs = args
        return undefined
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
  })
  const credential = gateway.pairDevice('Plan review test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  await eventually(() => dsh.events.send, 'Gateway did not subscribe to the DSH event stream.')
  dsh.events.push({
    type: 'waterfall',
    event: 'user-questions/request',
    eventId: 'plan-review-rpc-1',
    agentId: 'session-1',
    request: {
      questions: [{
        id: 'review-1',
        question: 'Approve the implementation plan?',
        detail: '# Implementation plan',
        intent: { kind: 'plan-review', approve: 'Approve' },
        options: [{ label: 'Approve' }, { label: 'Decline' }],
      }],
    },
  })
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
  assert.deepEqual(resultArgs, {
    clientId: 'client-fixture',
    eventId: 'plan-review-rpc-1',
    outcome: {
      kind: 'rejected',
      error: { name: 'Error', message: 'the user opened plan discussion', code: 'cancelled', details: {} },
    },
  })
})

test('paired devices search only the desktop-visible session message surface', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/search': args => {
        assert.deepEqual(args, { request: { query: 'matching' } })
        return { items: [{ sessionId: 'session-1', snippet: 'The matching desktop message.' }], hasMore: true }
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
  })
  const credential = gateway.pairDevice('Search test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }

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
  assert.equal(dsh.calls.length, 1)
  assert.equal(dsh.calls[0].method, 'session/search')

  const invalid = await fetch(`${status.url}/v1/sessions/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: 'invalid\u0000query' }),
  })
  assert.equal(invalid.status, 400)
  assert.equal(dsh.calls.length, 1)
})

test('paired devices read durable images only through the session-authorized attachment route', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/attachment': args => {
        assert.deepEqual(args, { request: { sessionId: 'session-a', attachmentId: 'image-a' } })
        return {
          attachment: {
            attachmentId: 'image-a',
            mediaType: 'image/png',
            bytes: 4,
            width: 1,
            height: 1,
            name: 'fixture.png',
          },
          data: 'AA==',
        }
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
  })
  const credential = gateway.pairDevice('Attachment test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }

  const response = await fetch(`${status.url}/v1/sessions/session-a/attachments/image-a`, { method: 'POST', headers, body: '{}' })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, {
    attachment: { attachmentId: 'image-a', mediaType: 'image/png', bytes: 4, width: 1, height: 1, name: 'fixture.png' },
    data: 'AA==',
  })
  assert.equal(dsh.calls.length, 1)
  assert.equal(dsh.calls[0].method, 'session/attachment')
})

test('session list projects desktop titles and blank metadata for the native workspace tree', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/list': () => ({
        items: [
          {
            sessionId: 'blank-session',
            updatedAt: 1,
            running: false,
            blank: true,
            projections: { asOfSeq: 1, values: { title: null, sessionListMetadata: { blank: true, lastPromptAt: null } } },
          },
          {
            sessionId: 'titled-session',
            updatedAt: 2,
            running: false,
            blank: false,
            projections: { asOfSeq: 3, values: { title: '桌面投影标题', sessionListMetadata: { blank: false, lastPromptAt: 9 } } },
          },
        ],
      }),
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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
  const items = (await response.json()).data.items
  assert.equal(items[0].sessionId, 'blank-session')
  assert.equal(items[0].blank, true)
  assert.equal(items[0].title, undefined)
  assert.equal(items[1].sessionId, 'titled-session')
  assert.equal(items[1].title, '桌面投影标题')
  assert.equal(items[1].blank, false)
})

test('session event baseline reports a desktop session that is already running', async t => {
  const dsh = createFakeDsh({
    unary: {
      'session/list': () => ({ items: [{ sessionId: 'session-running', running: true, blank: false }] }),
    },
    streamOverrides: {
      'session/follow': (send) => {
        send({
          type: 'item',
          value: {
            type: 'snapshot',
            cursor: 11,
            records: [
              { type: 'event', event: { type: 'turn/start', seq: 10, time: 1_000, data: { turn: 3 } } },
              { type: 'event', event: { type: 'tool/call', seq: 11, time: 1_100, data: { turn: 3, callId: 'call-1', name: 'bash' } } },
            ],
            hasMore: false,
            projections: { asOfSeq: 11, values: {} },
          },
        })
        send({ type: 'end' })
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
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

test('once event result rejects, the gateway reports the upstream unavailability', async t => {
  const dsh = createFakeDsh({
    unary: {
      '$events/result': () => {
        throw new Error('no active event stream')
      },
    },
  })
  const dshUrl = await listen(dsh.server)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await dsh.close()
  })
  const credential = gateway.pairDevice('Result failure test phone')
  const headers = {
    authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
    'content-type': 'application/json',
  }
  await eventually(() => dsh.events.send, 'Gateway did not subscribe to the DSH event stream.')
  dsh.events.push({
    type: 'waterfall',
    event: 'approval/request',
    eventId: 'approval-rpc-2',
    agentId: 'session-1',
    request: { toolName: 'shell' },
  })
  await eventually(async () => {
    const response = await fetch(`${status.url}/v1/sessions/session-1/interactions`, { method: 'POST', headers, body: '{}' })
    const payload = await response.json()
    return payload.data?.items?.length === 1 ? payload : undefined
  }, 'Gateway did not retain the approval request.')

  const rejected = await fetch(`${status.url}/v1/interactions/respond`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rpcId: 'approval-rpc-2',
      result: { ok: true, value: { sessionId: 'session-1', approvalId: 'approval-rpc-2', outcome: 'rejected' } },
    }),
  })
  assert.equal(rejected.status, 502)
  // A failed answer leaves the interaction pending so the device can retry.
  const stillPending = await fetch(`${status.url}/v1/sessions/session-1/interactions`, { method: 'POST', headers, body: '{}' })
  assert.equal((await stillPending.json()).data.items.length, 1)
})
