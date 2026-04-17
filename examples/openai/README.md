# axe-ai-sdk × OpenAI example

`@axe-ai-sdk/react` 의 `useChat` 훅과 `DefaultChatTransport` 로 OpenAI Chat Completions 스트리밍을 띄우는 최소 예제입니다.

## 구조

```
examples/openai/
├── server/index.ts   # Hono 서버 — OpenAI 스트림을 axe-wire/1 SSE 로 변환
├── src/App.tsx       # useChat + Markdown 렌더링 UI
├── src/transport.ts  # DefaultChatTransport 구성
└── vite.config.ts    # /api/* → http://localhost:8787 프록시
```

서버는 OpenAI 스트림 청크를 아래 이벤트로 변환해 송신합니다 (`axe-wire/1` 포맷).

| 이벤트 | 데이터 | 설명 |
| --- | --- | --- |
| `metadata` | `{ data: { conversationId } }` | 최초 1회. 클라이언트가 자동으로 다음 요청에 이어 붙임 |
| `message-start` | `{ messageId }` | assistant 메시지 시작 |
| `text-delta` | `{ delta }` | OpenAI delta 청크 |
| `finish` | `{ reason: 'stop' \| 'abort' \| 'error' }` | 스트림 종료 |
| `error` | `{ error, code }` | 에러 발생 시 `finish` 직전에 방출 |

## 실행

1. 루트에서 패키지 설치

   ```bash
   pnpm install
   ```

2. `.env` 생성

   ```bash
   cp examples/openai/.env.example examples/openai/.env
   # OPENAI_API_KEY 를 채워 넣으세요
   ```

3. 개발 서버 실행 (Vite + Hono 동시)

   ```bash
   pnpm --filter @axe-ai-sdk/example-openai dev
   ```

   - 프론트: http://localhost:5566
   - API: http://localhost:8787/api/chat

## 커스터마이징 포인트

- **모델 변경**: `.env` 의 `OPENAI_MODEL` 또는 요청당 `src/transport.ts` 의 `prepareBody` 에서 override.
- **시스템 프롬프트**: `.env` 의 `OPENAI_SYSTEM_PROMPT`. 클라이언트가 system 메시지를 보내면 그대로 사용.
- **툴/함수 호출**: `server/index.ts` 의 `chat.completions.create` 에 `tools` 를 추가하고, tool_call delta 를 `tool-call` / `tool-result` StreamPart 로 매핑하세요.
- **인증**: 실서비스에서는 `DefaultChatTransport({ headers: bearerFromCookie(...) })` 로 토큰을 주입.
