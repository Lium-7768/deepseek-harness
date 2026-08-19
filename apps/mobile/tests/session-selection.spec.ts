import { describe, expect, it } from 'vitest'
import { restorableSessionId } from '../src/state/session-selection-logic.ts'

const connection = {
  deviceId: 'device-a',
  gatewayUrl: 'https://gateway.example.test',
}

describe('restorableSessionId', () => {
  it('restores only a current session from the same paired desktop', () => {
    expect(
      restorableSessionId(
        { deviceId: connection.deviceId, gatewayUrl: connection.gatewayUrl, sessionId: 'session-current' },
        connection,
        ['session-current', 'session-other'],
      ),
    ).toBe('session-current')
  })

  it('rejects a stored selection from a different paired desktop', () => {
    expect(
      restorableSessionId(
        { deviceId: 'device-b', gatewayUrl: connection.gatewayUrl, sessionId: 'session-current' },
        connection,
        ['session-current'],
      ),
    ).toBeUndefined()
  })

  it('rejects a session no longer visible in the desktop session list', () => {
    expect(
      restorableSessionId(
        { deviceId: connection.deviceId, gatewayUrl: connection.gatewayUrl, sessionId: 'session-archived' },
        connection,
        ['session-current'],
      ),
    ).toBeUndefined()
  })
})
