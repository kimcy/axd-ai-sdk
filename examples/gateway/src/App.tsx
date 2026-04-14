import { useMemo, useRef, useState } from 'react'
import { useChat } from '@axe-ai-sdk/react'
// import { createMockTransport } from './mock-transport'
import { createGatewayTransport } from './gateway-transport'
import { SchemaGenerator } from './SchemaGenerator'

type Tab = 'chat' | 'schema'

type SSELogEntry = { event: string; data: string; partCount: number; ts: number }

export function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [showDebug, setShowDebug] = useState(false)
  const [sseLog, setSseLog] = useState<SSELogEntry[]>([])
  const conversationIdRef = useRef<string | null>(null)
  const transport = useMemo(
    () =>
      createGatewayTransport({
        url: 'https://ca-chatbot-backend.wittybay-7be49843.koreacentral.azurecontainerapps.io/api/v1/gateway/messages',
        getConversationId: () => conversationIdRef.current,
        getMessageId: () => null,
        onConversationId: (id) => {
          conversationIdRef.current = id
        },
        onSSEEvent: (event, data, parts) => {
          setSseLog((prev) =>
            [
              ...prev,
              { event, data, partCount: parts.length, ts: Date.now() },
            ].slice(-50)
          )
        },
      }),
    []
  )
  // const transport = useMemo(() => createMockTransport(), [])

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isStreaming,
    status,
    error,
    stop,
    reload,
    clear,
  } = useChat({
    transport,
    idleTimeoutMs: 15_000,
    persistence: { key: 'axe-ai-sdk-example' },
  })

  return (
    <div className='app'>
      <header>
        <h1>axe-ai-sdk example</h1>
        <div className='status'>
          {tab === 'chat' && (
            <>
              status: <code>{status}</code>
              {error && <span className='error'> · {error.message}</span>}
              <button className='clear' onClick={clear} disabled={isStreaming}>
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      <nav className='tabs'>
        <button
          className={tab === 'chat' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('chat')}
        >
          Chat
        </button>
        <button
          className={tab === 'schema' ? 'tab tab-active' : 'tab'}
          onClick={() => setTab('schema')}
        >
          Schema Generator
        </button>
      </nav>

      {tab === 'schema' && <SchemaGenerator />}

      {tab === 'chat' && (
      <>
      <ul className='messages'>
        {messages.length === 0 && (
          <li className='hint'>
            Try typing a message. Include the word <code>fail</code> to see
            the error path, or <code>slow</code> to slow down the stream.
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`msg msg-${m.role}`}>
            <div className='msg-head'>
              <strong>{m.role}</strong>
              <span className={`badge badge-${m.status}`}>{m.status}</span>
            </div>

            {m.thinkingSteps && m.thinkingSteps.length > 0 && (
              <ul className='steps'>
                {m.thinkingSteps.map((s, i) => (
                  <li key={i} className={`step step-${s.status}`}>
                    <strong>{s.agent}</strong> · {s.status}
                    {s.thought ? ` · ${s.thought}` : ''}
                  </li>
                ))}
              </ul>
            )}

            <div className='content'>{m.content}</div>

            {m.citations && m.citations.length > 0 && (
              <ul className='citations'>
                {m.citations.map((c) => (
                  <li key={c.id}>
                    📎{' '}
                    <a href={c.url} target='_blank' rel='noreferrer'>
                      {c.title ?? c.url}
                    </a>
                    {c.snippet && <div className='snippet'>{c.snippet}</div>}
                  </li>
                ))}
              </ul>
            )}

            {m.error && <div className='err'>⚠ {m.error}</div>}
          </li>
        ))}
      </ul>

      <section className='debug'>
        <div className='debug-head'>
          <button
            type='button'
            className='debug-toggle'
            onClick={() => setShowDebug((v) => !v)}
          >
            {showDebug ? '▼' : '▶'} SSE debug ({sseLog.length})
          </button>
          {showDebug && (
            <button
              type='button'
              className='clear'
              onClick={() => setSseLog([])}
            >
              Clear
            </button>
          )}
        </div>
        {showDebug &&
          (sseLog.length === 0 ? (
            <div className='debug-empty'>아직 이벤트 없음</div>
          ) : (
            <ul className='debug-list'>
              {sseLog.map((e, i) => (
                <li
                  key={i}
                  className={
                    e.partCount === 0 ? 'debug-row unmapped' : 'debug-row'
                  }
                >
                  <code className='debug-event'>{e.event}</code>
                  <span className='debug-count'>→ {e.partCount}</span>
                  <pre className='debug-data'>{e.data}</pre>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <form onSubmit={handleSubmit} className='composer'>
        <input
          value={input}
          onChange={handleInputChange}
          placeholder='Type a message...'
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button type='button' onClick={stop}>
            Stop
          </button>
        ) : (
          <button type='submit' disabled={!input.trim()}>
            Send
          </button>
        )}
        {status === 'error' && (
          <button type='button' onClick={() => reload()}>
            Retry
          </button>
        )}
      </form>
      </>
      )}
    </div>
  )
}
