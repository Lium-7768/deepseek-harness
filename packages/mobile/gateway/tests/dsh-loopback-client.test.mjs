import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { DshLoopbackClient } from '../lib/index.js'

/** Starts one fake DSH runtime speaking the api-gateway unary and Remote stream protocol. */
async function startFakeDsh({ unary = {}, streams = {} } = {}) {
  const server = createServer(async (request, response) => {
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
  const opens = []
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/api/remote.mux') {
      socket.destroy()
      return
    }
    sockets.handleUpgrade(request, socket, head, websocket => {
      websocket.on('message', (data) => {
        const open = JSON.parse(String(data))
        if (open.type !== 'open') return
        const send = frame => websocket.send(JSON.stringify({ ...frame, streamId: open.streamId }))
        opens.push({ endpoint: open.endpoint, args: open.payload?.args, send })
        const stream = streams[open.endpoint]
        if (stream !== undefined) stream(send, open.payload?.args ?? {})
        else send({ type: 'end' })
      })
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address.')
  return {
    url: `http://127.0.0.1:${address.port}`,
    opens,
    async close() {
      for (const socket of sockets.clients) socket.terminate()
      await new Promise((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    },
  }
}

test('DshLoopbackClient invokes one unary Remote endpoint and unwraps the business value', async () => {
  const upstream = await startFakeDsh({
    unary: {
      'session/list': args => {
        assert.deepEqual(args, { _request: {} })
        return { items: [{ sessionId: 'session-1' }] }
      },
    },
  })
  try {
    const client = new DshLoopbackClient(upstream.url)
    assert.deepEqual(await client.call('session/list', { _request: {} }), { items: [{ sessionId: 'session-1' }] })
  } finally {
    await upstream.close()
  }
})

test('DshLoopbackClient rejects upstream business errors with their code and details', async () => {
  const upstream = await startFakeDsh({
    unary: {
      'session/cancel': () => {
        const error = new Error('未找到请求的会话。')
        error.code = 'session-not-found'
        throw error
      },
    },
  })
  try {
    const client = new DshLoopbackClient(upstream.url)
    await assert.rejects(
      () => client.call('session/cancel', { request: { sessionId: 'missing' } }),
      error => error.code === 'upstream-rejected' && error.upstreamCode === 'session-not-found',
    )
  } finally {
    await upstream.close()
  }
})

test('DshLoopbackClient answers forwarded Remote event results through the result endpoint', async () => {
  let received
  const upstream = await startFakeDsh({
    unary: {
      '$events/result': args => {
        received = args
        return undefined
      },
    },
  })
  try {
    const client = new DshLoopbackClient(upstream.url)
    const outcome = { kind: 'result', value: 'allowed-once' }
    await client.answerEvent({ clientId: 'client-1', eventId: 'event-1', outcome })
    assert.deepEqual(received, { clientId: 'client-1', eventId: 'event-1', outcome })
  } finally {
    await upstream.close()
  }
})

test('DshLoopbackClient streams Remote stream items until the Host ends the stream', async () => {
  const upstream = await startFakeDsh({
    streams: {
      'session/follow': (send, args) => {
        assert.deepEqual(args, { request: { address: { kind: 'session', sessionId: 'session-1' } } })
        send({ type: 'item', value: { type: 'snapshot', cursor: 3 } })
        send({ type: 'item', value: { type: 'event', event: { seq: 4 } } })
        send({ type: 'end' })
      },
    },
  })
  const abort = new AbortController()
  try {
    const client = new DshLoopbackClient(upstream.url)
    const frames = []
    for await (const frame of client.open('session/follow', { request: { address: { kind: 'session', sessionId: 'session-1' } } }, abort.signal)) {
      frames.push(frame)
    }
    assert.deepEqual(frames, [{ type: 'snapshot', cursor: 3 }, { type: 'event', event: { seq: 4 } }])
  } finally {
    abort.abort()
    await upstream.close()
  }
})

test('DshLoopbackClient surfaces Remote stream errors and closes the logical stream', async () => {
  const upstream = await startFakeDsh({
    streams: {
      'workspace/follow': send => {
        send({ type: 'item', value: { type: 'baseline', items: [] } })
        send({ type: 'error', error: { code: 'workspace/unavailable', message: 'fixture failure' } })
      },
    },
  })
  const abort = new AbortController()
  try {
    const client = new DshLoopbackClient(upstream.url)
    await assert.rejects(
      async () => {
        for await (const frame of client.open('workspace/follow', {}, abort.signal)) {
          assert.deepEqual(frame, { type: 'baseline', items: [] })
        }
      },
      error => error.code === 'upstream-rejected' && error.upstreamCode === 'workspace/unavailable',
    )
  } finally {
    abort.abort()
    await upstream.close()
  }
})

test('DshLoopbackClient cancels the logical Remote stream when the caller aborts', async () => {
  const upstream = await startFakeDsh({
    streams: {
      'session/control': send => {
        send({ type: 'item', value: { type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } } })
      },
    },
  })
  const abort = new AbortController()
  try {
    const client = new DshLoopbackClient(upstream.url)
    const iterator = client.open('session/control', {}, abort.signal)[Symbol.asyncIterator]()
    const first = await iterator.next()
    assert.deepEqual(first.value, { type: 'baseline', value: { queues: {}, jobs: {}, projections: {} } })
    abort.abort()
    const done = await iterator.next()
    assert.equal(done.done, true)
  } finally {
    abort.abort()
    await upstream.close()
  }
})
