// like the Claude app, the answer grows word by word
// instead of appearing whole after the block is done. Source: Claude CLI partial messages
// (`--include-partial-messages`): stream_event → content_block_start / content_block_delta (text_delta).
// The draft is transient: when the full assistant message arrives, the normal chat message replaces it.
export function claudeDraft() {
  let text = ''
  return {
    // A stream_event line of the CLI → the visible draft now, or undefined when nothing changed.
    event(raw) {
      if (!raw || raw.type !== 'stream_event' || raw.parent_tool_use_id) return undefined
      const e = raw.event
      if (e?.type === 'content_block_start') {
        if (e.content_block?.type !== 'text') return undefined
        text = ''
        return ''
      }
      if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && typeof e.delta.text === 'string') {
        text += e.delta.text
        return visibleDraft(text)
      }
      return undefined
    },
    reset() { text = '' },
  }
}

// The lead's hidden <ocenka> rating never shows, not even half-written.
export function visibleDraft(text) {
  const at = text.search(/<ocenka/i)
  const cut = at >= 0 ? text.slice(0, at) : text.replace(/<[a-z]{0,6}$/i, '')
  return cut.trim().slice(-4000)
}
