import { fetch } from 'expo/fetch'
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { mobileAuthorization } from '@/api/mobile-api'
import { useConnectionStore } from '@/state/connection'
import { useMobileSyncStore } from '@/state/mobile-sync'
import type { MobileStreamEvent, SessionEventItem, SessionEventsPayload } from '@/types/mobile'

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000]

/** Connects one authenticated SSE stream while the native app is active and updates existing query caches. */
export function MobileSyncBridge(): null {
  const connection = useConnectionStore(state => state.connection)
  const queryClient = useQueryClient()
  const appState = useRef<AppStateStatus>(AppState.currentState)
  const connectionRef = useRef(connection)
  const streamAbort = useRef<AbortController | undefined>(undefined)
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retryIndex = useRef(0)
  const seenEventIds = useRef(new Set<string>())
  const setStatus = useMobileSyncStore(state => state.setStatus)
  const markEvent = useMobileSyncStore(state => state.markEvent)

  connectionRef.current = connection

  useEffect(() => {
    const close = (): void => {
      if (retryRef.current !== undefined) clearTimeout(retryRef.current)
      retryRef.current = undefined
      streamAbort.current?.abort()
      streamAbort.current = undefined
    }

    const scheduleRetry = (): void => {
      if (!connectionRef.current || appState.current !== 'active' || retryRef.current !== undefined) return
      const delay = RETRY_DELAYS_MS[Math.min(retryIndex.current, RETRY_DELAYS_MS.length - 1)]
      retryIndex.current += 1
      retryRef.current = setTimeout(() => {
        retryRef.current = undefined
        open()
      }, delay)
    }

    const open = (): void => {
      close()
      const current = connectionRef.current
      if (!current || appState.current !== 'active') {
        setStatus('disconnected')
        return
      }
      setStatus('connecting')
      const controller = new AbortController()
      streamAbort.current = controller
      void consumeMobileEventStream(`${current.gatewayUrl}/v1/events`, mobileAuthorization(current), controller.signal, (event) => {
        if (seenEventIds.current.has(event.eventId)) return
        rememberEventId(seenEventIds.current, event.eventId)
        markEvent()
        applyMobileStreamEvent(queryClient, event)
      })
        .then(() => {
          if (!controller.signal.aborted) scheduleRetry()
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setStatus('disconnected')
            scheduleRetry()
          }
        })
        .finally(() => {
          if (streamAbort.current === controller) streamAbort.current = undefined
        })
      retryIndex.current = 0
      seenEventIds.current.clear()
      setStatus('connected')
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState
      if (nextState === 'active') open()
      else {
        close()
        setStatus('disconnected')
      }
    })
    open()
    return () => {
      subscription.remove()
      close()
      setStatus('disconnected')
    }
  }, [connection?.accessToken, connection?.gatewayUrl, markEvent, queryClient, setStatus])

  return null
}

async function consumeMobileEventStream(
  url: string,
  authorization: string,
  signal: AbortSignal,
  onEvent: (event: MobileStreamEvent) => void,
): Promise<void> {
  const response = await fetch(url, {
    headers: { Accept: 'text/event-stream', Authorization: authorization },
    signal,
  })
  if (!response.ok || response.body === null) throw new Error(`移动同步连接失败（HTTP ${response.status}）。`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = chunk
          .split(/\r?\n/)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
        const event = parseMobileStreamEvent(data)
        if (event !== undefined) onEvent(event)
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

function parseMobileStreamEvent(data: string): MobileStreamEvent | undefined {
  if (data === '') return undefined
  try {
    const value: unknown = JSON.parse(data)
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const event = value as Record<string, unknown>
    if (event.contractVersion !== 1 || typeof event.eventId !== 'string' || typeof event.type !== 'string') return undefined
    if (event.payload === null || typeof event.payload !== 'object' || Array.isArray(event.payload)) return undefined
    return {
      contractVersion: 1,
      eventId: event.eventId,
      type: event.type,
      payload: event.payload as Record<string, unknown>,
      ...(typeof event.sessionId === 'string' ? { sessionId: event.sessionId } : {}),
      ...(typeof event.seq === 'number' && Number.isInteger(event.seq) && event.seq >= 0 ? { seq: event.seq } : {}),
      ...(event.snapshot === true ? { snapshot: true } : {}),
    }
  } catch {
    return undefined
  }
}

function rememberEventId(seen: Set<string>, eventId: string): void {
  seen.add(eventId)
  if (seen.size <= 512) return
  const oldest = seen.values().next().value
  if (typeof oldest === 'string') seen.delete(oldest)
}

function applyMobileStreamEvent(queryClient: ReturnType<typeof useQueryClient>, event: MobileStreamEvent): void {
  const sessionId = event.sessionId
  switch (event.type) {
    case 'session/event':
      if (sessionId === undefined || event.payload.event === undefined) return
      appendSessionEvent(queryClient, sessionId, event)
      if (isGoalEvent(event.payload.event)) void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] })
      return
    case 'session/queue':
      if (sessionId === undefined || !Array.isArray(event.payload.items)) return
      queryClient.setQueryData(['session-queue', sessionId], { items: event.payload.items })
      return
    case 'session/jobs':
      if (sessionId === undefined || !Array.isArray(event.payload.jobs)) return
      queryClient.setQueryData(['session-jobs', sessionId], { items: event.payload.jobs })
      return
    case 'approval/requested':
    case 'approval/resolved':
    case 'question/requested':
    case 'question/resolved':
      if (sessionId !== undefined) void queryClient.invalidateQueries({ queryKey: ['session-interactions', sessionId] })
      return
    case 'host/session-status':
      if (sessionId !== undefined && typeof event.payload.running === 'boolean') updateSessionStatus(queryClient, sessionId, event.payload.running)
      return
    case 'host/session-added':
    case 'host/session-removed':
    case 'host/workspace-changed':
    case 'host/workspace-removed':
    case 'host/workspace-order-changed':
    case 'host/archived-sessions-changed':
      void queryClient.invalidateQueries({ predicate: query => isSessionListQuery(query.queryKey) })
      return
    case 'gateway/ready':
      void queryClient.invalidateQueries({ queryKey: ['session-history'] })
      void queryClient.invalidateQueries({ queryKey: ['session-events'] })
      void queryClient.invalidateQueries({ queryKey: ['session-interactions'] })
      void queryClient.invalidateQueries({ queryKey: ['session-queue'] })
      void queryClient.invalidateQueries({ queryKey: ['session-jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['session-subagents'] })
      void queryClient.invalidateQueries({ predicate: query => isSessionListQuery(query.queryKey) })
      return
    case 'session/subscribed':
      return
    default:
      if (sessionId !== undefined) void queryClient.invalidateQueries({ queryKey: ['session-history', sessionId] })
  }
}

function isGoalEvent(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).type === 'string'
    && ((value as Record<string, unknown>).type as string).startsWith('goal/')
}

function appendSessionEvent(queryClient: ReturnType<typeof useQueryClient>, sessionId: string, streamEvent: MobileStreamEvent): void {
  const item: SessionEventItem = {
    ...(streamEvent.seq === undefined ? {} : { seq: streamEvent.seq }),
    ...(streamEvent.payload.view === undefined ? {} : { view: streamEvent.payload.view }),
    event: streamEvent.payload.event as Record<string, unknown>,
  }
  queryClient.setQueryData<SessionEventsPayload>(['session-events', sessionId], (current) => {
    const items = current?.items ?? []
    if (item.seq !== undefined && items.some(existing => existing.seq === item.seq)) return current
    return {
      since: Math.max(current?.since ?? 0, item.seq ?? 0),
      items: [...items, item],
      status: current?.status ?? 'running',
    }
  })
}

function updateSessionStatus(queryClient: ReturnType<typeof useQueryClient>, sessionId: string, running: boolean): void {
  queryClient.setQueryData<SessionEventsPayload>(['session-events', sessionId], current => ({
    since: current?.since ?? 0,
    items: current?.items ?? [],
    status: running ? 'running' : 'idle',
  }))
}

function isSessionListQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'session-list' || queryKey[0] === 'session-list-for-session'
}
