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
  await new Promise((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
}

test('paired devices can call only allowlisted DSH session operations', async (t) => {
  const dsh = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    assert.equal(request.url, '/api/session.list')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      type: 'server-response',
      rpcId: message.rpcId,
      result: { ok: true, value: { items: [{ sessionId: 'session-1', title: 'Fixture session' }] } },
    }))
  })
  const dshUrl = await listen(dsh)
  const gateway = new MobileGateway({ dshUrl })
  const status = await gateway.start()
  t.after(async () => {
    await gateway.stop()
    await close(dsh)
  })

  const health = await fetch(`${status.url}/v1/health`)
  assert.equal(health.status, 200)

  const credential = gateway.pairDevice('Integration test phone')
  const unauthorized = await fetch(`${status.url}/v1/sessions/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(unauthorized.status, 401)

  const authorized = await fetch(`${status.url}/v1/sessions/list`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
      'content-type': 'application/json',
    },
    body: '{}',
  })
  assert.equal(authorized.status, 200)
  const payload = await authorized.json()
  assert.deepEqual(payload, {
    contractVersion: 1,
    dshUrl: status.url,
    data: { items: [{ sessionId: 'session-1', title: 'Fixture session' }] },
  })

  assert.equal(gateway.revokeDevice(credential.deviceId), true)
  const revoked = await fetch(`${status.url}/v1/sessions/list`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credential.deviceId}.${credential.accessToken}`,
      'content-type': 'application/json',
    },
    body: '{}',
  })
  assert.equal(revoked.status, 401)
})
