/** Rendering states for the session-scoped interaction list. */
export type InteractionListState = 'disconnected' | 'invalid-session' | 'loading' | 'error' | 'empty' | 'ready'

/**
 * Selects the visible state for the interaction list without reading UI state.
 * @param input - Connection, route, query, and result facts from the screen.
 * @returns The state whose recovery or empty message should be rendered.
 */
export function interactionListState(input: {
  hasConnection: boolean
  hasSessionId: boolean
  isLoading: boolean
  isError: boolean
  hasItems: boolean
}): InteractionListState {
  if (!input.hasConnection) return 'disconnected'
  if (!input.hasSessionId) return 'invalid-session'
  if (input.isLoading) return 'loading'
  if (input.isError) return 'error'
  return input.hasItems ? 'ready' : 'empty'
}

/** Supplies native accessibility semantics for single- and multi-select answers. */
export function questionOptionAccessibility(input: { multiSelect: boolean; selected: boolean; submitting: boolean }): {
  disabled: boolean
  role: 'checkbox' | 'radio'
  state: { disabled: boolean; selected: boolean }
} {
  return {
    disabled: input.submitting,
    role: input.multiSelect ? 'checkbox' : 'radio',
    state: { disabled: input.submitting, selected: input.selected },
  }
}
