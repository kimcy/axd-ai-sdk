import { useMemo, useState } from 'react'
import { useChat, Markdown } from '@axe-ai-sdk/react'
import { OpenAIBrowserTransport } from './transport'

const STARTERS = [
  'OpenAI Chat Completions 스트리밍 원리 설명해줘',
  'TypeScript 의 satisfies 연산자 예제 보여줘',
  '리액트 useMemo 와 useCallback 차이',
  'axe-ai-sdk 의 ChatTransport 인터페이스 요약',
]

export function App() {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY
  const [apiKey, setApiKey] = useState(envKey ?? '')
  const [keyInput, setKeyInput] = useState(envKey ?? '')
  const [input, setInput] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const transport = useMemo(() => {
    if (!apiKey) return null
    return new OpenAIBrowserTransport({
      apiKey,
      model: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini',
    })
  }, [apiKey])

  if (!transport) {
    return (
      <div className='app'>
        <header>
          <h1>
            axe-ai-sdk <small>× OpenAI (browser-direct)</small>
          </h1>
        </header>
        <div className='key-gate'>
          <div className='warn'>
            ⚠ 이 예제는 <strong>브라우저에서 OpenAI API 를 직접 호출</strong>{' '}
            합니다. 키가 DevTools / 네트워크 탭에 노출되므로{' '}
            <strong>프로덕션에서 쓰지 마세요</strong>. 로컬 데모 전용입니다.
          </div>
          <label>
            <span>OpenAI API Key</span>
            <input
              type='password'
              placeholder='sk-...'
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </label>
          <button
            onClick={() => setApiKey(keyInput.trim())}
            disabled={!keyInput.trim()}
          >
            시작하기
          </button>
          <p className='hint'>
            <code>.env.local</code> 에 <code>VITE_OPENAI_API_KEY</code> 를
            설정하면 이 화면을 건너뜁니다.
          </p>
        </div>
      </div>
    )
  }

  return <Chat transport={transport} input={input} setInput={setInput} error={error} setError={setError} />
}

function Chat({
  transport,
  input,
  setInput,
  error,
  setError,
}: {
  transport: OpenAIBrowserTransport
  input: string
  setInput: (v: string) => void
  error: Error | null
  setError: (e: Error | null) => void
}) {
  const { messages, conversationId, isStreaming, submit, stop, resetChat } =
    useChat({
      transport,
      conversationIdStorageKey: 'axe-openai-browser-cid',
      persistence: { key: 'axe-openai-browser' },
      idleTimeoutMs: 65_000,
      onError: (e) => setError(e),
      onFinish: () => setError(null),
    })

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    setError(null)
    submit(content)
    setInput('')
  }

  const handleReset = () => {
    setError(null)
    transport.reset()
    resetChat()
  }

  return (
    <div className='app'>
      <header>
        <h1>
          axe-ai-sdk <small>× OpenAI (browser-direct)</small>
        </h1>
        <div className='status'>
          {isStreaming ? <code>streaming</code> : <code>idle</code>}
          {conversationId && (
            <span>
              · cid: <code>{conversationId.slice(0, 8)}</code>
            </span>
          )}
          {error && <span className='error'> · {error.message}</span>}
          <button
            className='clear'
            onClick={handleReset}
            disabled={isStreaming}
          >
            Reset
          </button>
        </div>
      </header>

      <ul className='messages'>
        {messages.length === 0 && (
          <li className='welcome'>
            <p className='welcome-greeting'>
              브라우저가 OpenAI 에 직접 연결되어 있습니다.
            </p>
            <p className='welcome-sub'>
              키는 DevTools 에서 확인할 수 있습니다 — 데모 전용입니다.
            </p>
            <div className='chips'>
              {STARTERS.map((text) => (
                <button
                  key={text}
                  className='chip'
                  onClick={() => submit(text)}
                  disabled={isStreaming}
                >
                  {text}
                </button>
              ))}
            </div>
          </li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={`msg msg-${m.role}`}>
            <div className='msg-head'>
              <strong>{m.role}</strong>
              <span className={`badge badge-${m.status}`}>{m.status}</span>
            </div>
            <Markdown>{m.content}</Markdown>
            {m.error && <div className='err'>⚠ {m.error}</div>}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit} className='composer'>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='메시지를 입력하세요...'
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
      </form>
    </div>
  )
}
