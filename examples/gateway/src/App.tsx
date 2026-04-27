import { useMemo, useState } from 'react'
import {
  useChat,
  // DefaultChatTransport,
  Markdown,
  // lastUserContent,
  // bearer,
  // bearerFromCookie, // [B] 용 — 아래 주석 참고
} from '@axe-ai-sdk/react'
import { createMockTransport } from './mock-transport'

// const GATEWAY_URL =
//   'https://ca-chatbot-backend.wittybay-7be49843.koreacentral.azurecontainerapps.io/api/v1/gateway/messages'

// const GATEWAY_TOKEN_COOKIE = 'gateway_token' // [B] 용

export function App() {
  const transport = useMemo(() => createMockTransport(), [])
  // const transport = useMemo(
  //   () =>
  //     new DefaultChatTransport({
  //       api: GATEWAY_URL,

  // [A] env 폴백 포함 (dev 편의용, 현재 활성)
  //   VITE_GATEWAY_TOKEN 이 있으면 우선, 없으면 쿠키에서 읽음
  // headers: () => bearer(import.meta.env.VITE_GATEWAY_TOKEN),

  // [B] 쿠키만 쓰는 운영용 — 위 [A] 를 지우고 이 한 줄로 교체
  // headers: bearerFromCookie(GATEWAY_TOKEN_COOKIE),

  // 게이트웨이는 `{ content, conversationId? }` 형태의 body 를 기대합니다.
  // (기본 `interpret: interpretAxeWire1` 가 message_created / thinking /
  //  message / done 이벤트를 canonical StreamPart 로 자동 변환합니다.)
  // prepareBody: (request, { conversationId }) => ({
  //   content: lastUserContent(request),
  //   ...(conversationId ? { conversationId } : {}),
  // }),
  // }),
  // []
  // )

  const [input, setInput] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const {
    messages,
    conversationId,
    isStreaming,
    submit,
    stop,
    resetChat,
  } = useChat({
    transport,
    conversationIdStorageKey: 'axe-ai-sdk-example-cid',
    persistence: { key: 'axe-ai-sdk-example' },
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
        <h1>axe-ai-sdk example</h1>
        <div className='status'>
          {isStreaming ? (
            <code>streaming</code>
          ) : (
            <code>idle</code>
          )}
          {conversationId && (
            <span className='cid'> · cid: <code>{conversationId.slice(0, 8)}</code></span>
          )}
          {error && <span className='error'> · {error.message}</span>}
          <button className='clear' onClick={handleReset} disabled={isStreaming}>
            Reset
          </button>
        </div>
      </header>

      <ul className='messages'>
        {messages.length === 0 && (
          <li className='welcome'>
            <p className='welcome-greeting'>안녕하세요! 무엇을 도와드릴까요?</p>
            <p className='welcome-sub'>
              아래 질문을 선택하거나 직접 입력해 보세요.
            </p>
            <div className='chips'>
              {[
                'axe-ai-sdk 시작하는 방법 알려줘',
                'useChat 훅 사용법이 궁금해',
                '스트리밍 응답은 어떻게 처리해?',
                '게이트웨이 연동 예제 보여줘',
              ].map((text) => (
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

            <Markdown>{m.content}</Markdown>

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

      <form onSubmit={handleSubmit} className='composer'>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
      </form>
    </div>
  )
}
