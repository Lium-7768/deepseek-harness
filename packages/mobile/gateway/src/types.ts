/** A paired mobile device allowed to call the loopback Mobile Gateway. */
export interface MobileDevice {
  deviceId: string
  label: string
  createdAt: string
  revokedAt?: string
}

/** One short-lived, out-of-band device credential returned after desktop approval. */
export interface MobileDeviceCredential {
  deviceId: string
  accessToken: string
}

/** A stable response emitted by the Mobile Gateway. */
export interface MobileResponse<T> {
  contractVersion: 1
  dshUrl: string
  data: T
}

/** A Mobile Gateway HTTP fault that is safe to show in a native client. */
export interface MobileGatewayError {
  code: 'bad-request' | 'unauthorized' | 'forbidden' | 'not-found' | 'upstream-unavailable' | 'upstream-rejected'
  message: string
}
