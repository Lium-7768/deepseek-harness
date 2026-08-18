import { describe, expect, it } from 'vitest'
import { interactionListState, questionOptionAccessibility } from '../src/components/interaction-state.ts'

describe('interactionListState', () => {
  it('prioritizes connection and route failures before query state', () => {
    expect(
      interactionListState({
        hasConnection: false,
        hasSessionId: false,
        isLoading: true,
        isError: true,
        hasItems: false,
      }),
    ).toBe('disconnected')
    expect(
      interactionListState({
        hasConnection: true,
        hasSessionId: false,
        isLoading: true,
        isError: true,
        hasItems: false,
      }),
    ).toBe('invalid-session')
  })

  it('exposes loading and retry states', () => {
    expect(
      interactionListState({
        hasConnection: true,
        hasSessionId: true,
        isLoading: true,
        isError: false,
        hasItems: false,
      }),
    ).toBe('loading')
    expect(
      interactionListState({
        hasConnection: true,
        hasSessionId: true,
        isLoading: false,
        isError: true,
        hasItems: false,
      }),
    ).toBe('error')
  })

  it('distinguishes an empty list from loaded interactions', () => {
    expect(
      interactionListState({
        hasConnection: true,
        hasSessionId: true,
        isLoading: false,
        isError: false,
        hasItems: false,
      }),
    ).toBe('empty')
    expect(
      interactionListState({
        hasConnection: true,
        hasSessionId: true,
        isLoading: false,
        isError: false,
        hasItems: true,
      }),
    ).toBe('ready')
  })

  it('exposes radio or checkbox state and locks options while submitting', () => {
    expect(questionOptionAccessibility({ multiSelect: false, selected: true, submitting: false })).toEqual({
      disabled: false,
      role: 'radio',
      state: { disabled: false, selected: true },
    })
    expect(questionOptionAccessibility({ multiSelect: true, selected: false, submitting: true })).toEqual({
      disabled: true,
      role: 'checkbox',
      state: { disabled: true, selected: false },
    })
  })
})
