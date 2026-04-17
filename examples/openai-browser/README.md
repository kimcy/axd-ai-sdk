# axe-ai-sdk × OpenAI (browser-direct)

백엔드 없이 **브라우저가 `api.openai.com` 에 직접 요청**하는 예제입니다.
`ChatTransport` 인터페이스를 직접 구현해서 `openai` SDK 를 그대로 호출합니다.

## ⚠️ 프로덕션에서 쓰지 마세요

- API 키가 **번들/DevTools/Network 탭에 노출**됩니다.
- OpenAI SDK 도 `dangerouslyAllowBrowser: true` 를 명시해야 동작합니다.
- 적절한 용도:
  - 로컬 개발 데모
  - 사용자가 자기 키를 붙여 넣는 "Bring Your Own Key" 플레이그라운드
  - 인증 뒤의 내부 툴 (그래도 서버 프록시가 나음)

프로덕션은 [examples/openai/](../openai/) 의 서버 프록시 패턴을 쓰세요.

## 구조

```
examples/openai-browser/
├── src/transport.ts   # OpenAIBrowserTransport — ChatTransport 직접 구현
├── src/App.tsx        # 키 입력 게이트 + useChat UI
└── vite.config.ts     # 포트 5577
```

`OpenAIBrowserTransport.send()` 가 OpenAI 스트림 청크를 직접 `StreamPart` 로 yield 합니다:

```ts
async *send(request) {
  yield { type: 'metadata', data: { conversationId } }
  yield { type: 'message-start', messageId }
  const stream = await this.client.chat.completions.create({...})
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) yield { type: 'text-delta', delta }
  }
  yield { type: 'finish', reason: 'stop' }
}
```

`DefaultChatTransport` 는 SSE 와이어 포맷을 파싱하지만, 여기선 **와이어가 없으니** 직접 `ChatTransport` 를 구현하는 게 맞습니다.

## 실행

```bash
pnpm install  # 루트에서
pnpm --filter @axe-ai-sdk/example-openai-browser dev
```

브라우저: http://localhost:5577

API 키는 UI 에서 입력하거나, `.env.local` 에 `VITE_OPENAI_API_KEY` 를 넣으면 게이트를 건너뜁니다.
