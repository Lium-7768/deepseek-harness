/** Message action layout shared by the native user and assistant rows. */
export type MessageActionAlignment = 'user' | 'assistant'

/** Returns the fixed icon-only action hit area and row alignment. */
export function messageActionLayout(alignment: MessageActionAlignment): {
  alignSelf: 'flex-end' | 'flex-start'
  height: 44
  width: 44
} {
  return alignment === 'user'
    ? { alignSelf: 'flex-end', height: 44, width: 44 }
    : { alignSelf: 'flex-start', height: 44, width: 44 }
}
