import { useState } from 'react'
import { useChat, Markdown } from '@axe-ai-sdk/react'
import { transport } from './transport'

const STARTERS = [
  'OpenAI Responses API 와 Chat Completions 차이가 뭐야?',
  '리액트 서버 컴포넌트를 3줄로 요약해줘',
  'TypeScript strict 모드 쓰는 이유 알려줘',
  '코사인 유사도를 파이썬 코드로 보여줘',
]

export function App() {
  const [input, setInput] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const { messages, conversationId, isStreaming, submit, stop, resetChat } =
    useChat({
      transport,
      conversationIdStorageKey: 'axe-openai-example-cid',
      persistence: { key: 'axe-openai-example' },
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
    resetChat()
  }

  return (
    <div className='app'>
      <header>
        <h1>
          axe-ai-sdk <small>× OpenAI</small>
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
              안녕하세요! OpenAI 와 연결되어 있습니다.
            </p>
            <p className='welcome-sub'>
              아래 프롬프트를 골라보거나 직접 입력해보세요.
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
