import { useEffect, useState } from 'react'
import type { DefaultChatTransport, SSEDebugEvent } from '@axe-ai-sdk/core'

/**
 * Subscribe to a `DefaultChatTransport`'s SSE events and return a rolling log.
 * Use this to build custom debug UIs, or drop-in with `<SSEDebugPanel>`.
 */
export function useSSELog(
  transport: DefaultChatTransport | null | undefined,
  maxEntries = 50
): { log: SSEDebugEvent[]; clear: () => void } {
  const [log, setLog] = useState<SSEDebugEvent[]>([])

  useEffect(() => {
    if (!transport) return
    const unsub = transport.onSSE((e) => {
      setLog((prev) => [...prev, e].slice(-maxEntries))
    })
    return unsub
  }, [transport, maxEntries])

  return { log, clear: () => setLog([]) }
}

export type SSEDebugPanelProps = {
  transport: DefaultChatTransport | null | undefined
  /** Start expanded (default: false). */
  defaultOpen?: boolean
  /** Rolling buffer size (default: 50). */
  maxEntries?: number
  className?: string
}

/**
 * Drop-in devtools panel that subscribes to a `DefaultChatTransport` and
 * displays raw SSE events + mapping results. Unmapped events (partCount: 0)
 * are highlighted so schema gaps are obvious.
 */
export function SSEDebugPanel({
  transport,
  defaultOpen = false,
  maxEntries = 50,
  className,
}: SSEDebugPanelProps) {
  const { log, clear } = useSSELog(transport, maxEntries)
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={className ?? 'axe-sse-debug'}>
      <div className='axe-sse-debug__head'>
        <button
          type='button'
          className='axe-sse-debug__toggle'
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▼' : '▶'} SSE debug ({log.length})
        </button>
        {open && (
          <button
            type='button'
            className='axe-sse-debug__clear'
            onClick={clear}
          >
            Clear
          </button>
        )}
      </div>
      {open &&
        (log.length === 0 ? (
          <div className='axe-sse-debug__empty'>아직 이벤트 없음</div>
        ) : (
          <ul className='axe-sse-debug__list'>
            {log.map((e, i) => (
              <li
                key={i}
                className={
                  e.parts.length === 0
                    ? 'axe-sse-debug__row axe-sse-debug__row--unmapped'
                    : 'axe-sse-debug__row'
                }
              >
                <code className='axe-sse-debug__event'>{e.event}</code>
                <span className='axe-sse-debug__count'>→ {e.parts.length}</span>
                <pre className='axe-sse-debug__data'>{e.data}</pre>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}
