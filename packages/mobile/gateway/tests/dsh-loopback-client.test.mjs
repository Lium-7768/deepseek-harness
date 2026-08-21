import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { DshLoopbackClient } from '../lib/index.mjs'

async function startDownlink(path, frame) {
  const server = createServer()
  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== path) {
      socket.destroy()
      return
    }
    sockets.handleUpgrade(request, socket, head, websocket => {
      websocket.send(JSON.stringify(frame))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address.')
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets.clients) socket.terminate()
      await new Promise((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
    },
  }
}

for (const stream of ['mux', 'host']) {
  test(`DshLoopbackClient reads ${stream} frames from the desktop WebSocket downlink`, async () => {
    const frame = {
      type: 'server-request',
      rpcId: `${stream}-rpc`,
      payload: { type: `${stream}/event`, sessionId: 'session-live' },
    }
    const upstream = await startDownlink(`/api/events.${stream}`, frame)
    const abort = new AbortController()
    try {
      const client = new DshLoopbackClient(upstream.url)
      const result = await client[stream](abort.signal).next()
      assert.deepEqual(result, {
        done: false,
        value: { rpcId: frame.rpcId, payload: frame.payload },
      })
    } finally {
      abort.abort()
      await upstream.close()
    }
  })
}
