import { useMemo, useState } from 'react'
import {
  useChat,
  DefaultChatTransport,
  SSEDebugPanel,
  Markdown,
  lastUserContent,
  type SSESchema,
} from '@axe-ai-sdk/react'
import { SchemaGenerator } from './SchemaGenerator'
import sseSchema from './sse-schema.json'

type Tab = 'chat' | 'schema'

const GATEWAY_URL =
  'https://ca-chatbot-backend.wittybay-7be49843.koreacentral.azurecontainerapps.io/api/v1/gateway/messages'

export function App() {
  const [tab, setTab] = useState<Tab>('chat')

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: GATEWAY_URL,
        schema: sseSchema as unknown as SSESchema,
        prepareBody: (request, { conversationId }) => ({
          content: lastUserContent(request),
          ...(conversationId ? { conversationId } : {}),
        }),
      }),
    []
  )

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

                {m.role === 'assistant' ? (
                  <Markdown className='content'>{m.content}</Markdown>
                ) : (
                  <div className='content'>{m.content}</div>
                )}

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

          <SSEDebugPanel transport={transport} className='debug' />

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
