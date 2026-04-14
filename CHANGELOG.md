# Changelog

All notable changes to `@axe-ai-sdk/*` packages are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 변경

- **패키지 네임스페이스 이름 변경**: `@axd-ai-sdk/*` → `@axe-ai-sdk/*`.
  모든 패키지·문서·예제·README 의 참조를 일괄 업데이트. `pnpm install` 로
  lockfile 재생성 필요.
- GitHub 저장소 URL 을 `kimcy/axe-ai-sdk` 로 통일.

### 추가

- **`@axe-ai-sdk/docs`** — Nextra 4 (Next.js App Router) 기반 한국어 문서 사이트
  ([`apps/docs`](apps/docs)) 신규 추가.
  - 랜딩 + 빠른시작 통합 페이지 (`/docs`).
  - 섹션: 기본 개념 (전송/스트리밍/상태기계), core 레퍼런스, react 훅,
    고급(에이전트·툴·RAG·에러처리).
  - Pretendard Variable 웹폰트 (jsDelivr dynamic-subset).
  - 좌측 사이드바 기본 펼침 (`autoCollapse: false`).
  - `/` → `/docs` 리다이렉트.
- `pnpm-workspace.yaml` 에 `apps/*` 추가.
- 루트 `package.json` 스크립트:
  - `docs:dev` / `docs:build` / `docs:start` / `docs:clean`
    (`pnpm docs` 는 pnpm 내장 명령과 충돌하므로 `docs:dev` 사용)
  - `example:dev` / `example:build` / `example:preview`

## [0.0.1] - 2026-04-14

### @axe-ai-sdk/core

Initial release.

- `SSEParser` — incremental Server-Sent Events parser with robust handling
  of CRLF/LF, multi-line `data:` fields, `event:` / `id:` / `retry:` fields,
  comments, and partial chunks at arbitrary byte boundaries.
- `readSSEStream(body, signal)` — async generator over `ReadableStream<Uint8Array>`,
  UTF-8 stream-safe via `TextDecoder({ stream: true })`, respects `AbortSignal`.
- `ChatTransport` interface — swap-in adapter contract. Transports emit
  `StreamPart` async iterables; they own wire-format parsing.
- `StreamPart` discriminated union — `message-start`, `text-delta`,
  `thinking-step`, `tool-call`, `tool-result`, `citation`, `metadata`,
  `error`, `finish`. Agent and RAG metadata are first-class.
- `ChatController` — request-scoped state machine.
  - Per-request isolation (no interleaved streams).
  - Idle-timeout (chunk-gap-based, not total).
  - Applies `StreamPart`s to a message with proper status transitions
    (`pending` → `streaming` → `done` / `error` / `aborted`).
  - Thinking-step merge semantics (completes in-progress `running` entries).
  - `submit(content, { metadata })`, `reload()`, `stop()`.
- Errors: `ChatError`, `AbortedError`, `TimeoutError`, `isAbortError()`.

### @axe-ai-sdk/react

Initial release.

- `useChat(options)` — returns `messages`, `input`, `handleInputChange`,
  `handleSubmit`, `submit`, `stop`, `reload`, `setMessages`, `clear`,
  `status`, `isStreaming`, `error`. Familiar Vercel-AI-SDK-style surface.
- `createStoragePersistence({ key, storage?, sanitize? })` — opt-in
  `localStorage`/`sessionStorage` persistence. Sanitizes in-flight messages
  by default so a refresh never resurrects half-streamed state.
- `onFinish` / `onError` callbacks.

### Not yet included

- Automatic reconnect with `Last-Event-ID`. Requires backend cursor support.
  Use `reload()` for manual retry after an error.
- IndexedDB persistence adapter. `localStorage` is the only built-in.
- Tool-call execution helpers. Transports may emit `tool-call` /
  `tool-result` parts; client-side execution loops are not yet abstracted.
