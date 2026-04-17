# Changelog

All notable changes to `@axe-ai-sdk/*` packages are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.0.7

[compare changes](https://github.com/kimcy/axe-ai-sdk/compare/v0.0.6...v0.0.7)

## v0.0.6

[compare changes](https://github.com/kimcy/axe-ai-sdk/compare/v0.0.5...v0.0.6)

### 🩹 Fixes

- Markdown 스타일에서 다크 모드 관련 CSS 변수 제거 및 설명 수정 ([62d78b1](https://github.com/kimcy/axe-ai-sdk/commit/62d78b1))
- Markdown 테이블 마지막 행의 경계 스타일 제거 ([bae93b3](https://github.com/kimcy/axe-ai-sdk/commit/bae93b3))

### 📖 Documentation

- README.md에 pnpm release 스크립트 사용법 및 변경사항 추가 ([88614f2](https://github.com/kimcy/axe-ai-sdk/commit/88614f2))

### ❤️ Contributors

- Kimcy <kimcy1@gmail.com>

## v0.0.3

[compare changes](https://github.com/kimcy/axe-ai-sdk/compare/v0.0.4...v0.0.3)

### 🚀 Features

- 문서 및 설정 업데이트 - 새로운 Bash 명령 추가 및 문서 내용 개선 ([54a989f](https://github.com/kimcy/axe-ai-sdk/commit/54a989f))
- 문서에서 '영속화'를 'Persistence'로 변경 및 UI 관련 문서 제목 수정 ([d793692](https://github.com/kimcy/axe-ai-sdk/commit/d793692))
- 게이트웨이 환영 메시지 추가 및 Markdown 렌더링 제목 수정 ([cc96684](https://github.com/kimcy/axe-ai-sdk/commit/cc96684))
- OpenAI 브라우저 예제 추가 및 환경 변수 이름 변경 ([60bd5ff](https://github.com/kimcy/axe-ai-sdk/commit/60bd5ff))
- OpenAI 전송 방식 개선 및 커스텀 Transport 생성 함수 추가 ([cff0514](https://github.com/kimcy/axe-ai-sdk/commit/cff0514))

### 💅 Refactors

- App.tsx에서 주석 처리된 코드 정리 및 MockTransport 사용으로 변경 ([0bc6beb](https://github.com/kimcy/axe-ai-sdk/commit/0bc6beb))

### 📖 Documentation

- Update CHANGELOG for v0.0.4 ([e00737f](https://github.com/kimcy/axe-ai-sdk/commit/e00737f))
- ChatTransport 설명 수정 및 문서 링크 제목 변경 ([0197d0b](https://github.com/kimcy/axe-ai-sdk/commit/0197d0b))

### 🏡 Chore

- Package.json 및 pnpm-lock.yaml 업데이트 - 버전 변경 및 OpenAI 예제 추가 ([d6fd998](https://github.com/kimcy/axe-ai-sdk/commit/d6fd998))

### ❤️ Contributors

- Kimcy <kimcy1@gmail.com>

## [Unreleased]

## [0.0.4] - 2026-04-15

[compare changes](https://github.com/kimcy/axe-ai-sdk/compare/v0.0.2...v0.0.4)

### 🚀 Features

- 문서 업데이트 및 Markdown 컴포넌트 개선 ([2f830df](https://github.com/kimcy/axe-ai-sdk/commit/2f830df))
- 패키지 버전 변경 및 Markdown 컴포넌트에 rehype-raw 추가 ([4a73c7d](https://github.com/kimcy/axe-ai-sdk/commit/4a73c7d))
- 채팅 기능 개선 및 상태 관리 추가 ([641330a](https://github.com/kimcy/axe-ai-sdk/commit/641330a))
- 문서 업데이트 및 코드 정리 ([378602c](https://github.com/kimcy/axe-ai-sdk/commit/378602c))

### 🏡 Chore

- Release v0.0.4 ([806e9d4](https://github.com/kimcy/axe-ai-sdk/commit/806e9d4))

### ❤️ Contributors

- Kimcy <kimcy1@gmail.com>

## [0.0.2] - 2026-04-15

### 파괴적 변경 (pre-1.0 이라 patch 로 나가지만 기존 사용자 코드에 영향)

- **`DefaultChatTransport` 의 `schema` 옵션 제거.** 이제 canonical
  `axe-wire/1` 와이어 포맷만 이해합니다. `event:` 이름이 `StreamPart.type`
  과 같고 `data:` 는 나머지 필드의 JSON. 스키마 매핑 개념은 서버 측 BFF
  혹은 `ChatTransport.send` 직접 구현으로 밀어냈습니다.
- 관련 공개 심볼 제거: `SSESchema`, `SSERule`, `wrap`, `fields`,
  `parseSSEDump`, `inferSchema`, `inferSchemaFromRaw`, `ParsedSSEEvent`.
- `axe-infer-schema` CLI + `pnpm infer-schema` 스크립트 제거.

### 추가

- **canonical `axe-wire/1` 포맷 정립.** 서버가 규격만 맞추면 클라이언트는
  `new DefaultChatTransport({ api })` 한 줄로 동작합니다. 비표준 서버는
  (a) BFF 에서 한 번 번역 (b) `ChatTransport.send` 직접 구현 두 경로.
- **`@axe-ai-sdk/core` 의 auth 헬퍼** — 순수 함수, 의존성 없음:
  - `bearer(token)` → `{ Authorization: 'Bearer ...' }` (null 이면 `{}`)
  - `getCookie(name)` → SSR-safe 쿠키 판독기
  - `bearerFromCookie(name)` → `() => Record<string, string>` 리졸버 팩토리.
    `headers` 옵션에 그대로 꽂으면 매 요청마다 쿠키에서 토큰을 읽습니다.
  401 자동 리프레시 / localStorage / OAuth 는 의도적으로 포함하지 않음.
- **`@axe-ai-sdk/react` 의 `<Markdown>` 컴포넌트** —
  GitHub-flavored Markdown (`remark-gfm`), `highlight.js` 기반 syntax
  highlighting, 코드 블록 복사 버튼 + 언어 배지, 외부 링크 자동
  `target="_blank" rel="noreferrer"`. `@axe-ai-sdk/react/styles.css` 로
  기본 테마 제공.
- **`@axe-ai-sdk/react` 의 `<SSEDebugPanel>` + `useSSELog`** —
  `DefaultChatTransport.onSSE()` 를 구독해 raw SSE 이벤트와 매핑 결과
  (`StreamPart[]`) 를 나란히 보여주는 드롭인 devtools. `partCount: 0`
  이벤트는 강조되어 canonical 규격을 벗어난 서버 이벤트를 즉시 드러냅니다.
- `DefaultChatTransport.onSSE(listener)` — raw SSE 이벤트 구독 API.
- `lastUserContent(request)` 유틸 — 마지막 user 메시지 content 추출.
- **문서 신규 페이지:**
  - [`core/default-transport`](apps/docs/content/docs/core/default-transport.mdx)
  - [`react/markdown`](apps/docs/content/docs/react/markdown.mdx)
  - [`react/sse-debug`](apps/docs/content/docs/react/sse-debug.mdx)

### 이전 [Unreleased] 항목 (0.0.1 배포 후 ~ 0.0.2 이전)

- **패키지 네임스페이스 이름 변경**: `@axd-ai-sdk/*` → `@axe-ai-sdk/*`.
  모든 패키지·문서·예제·README 의 참조를 일괄 업데이트. `pnpm install` 로
  lockfile 재생성 필요.
- GitHub 저장소 URL 을 `kimcy/axe-ai-sdk` 로 통일.
- **`@axe-ai-sdk/docs`** — Nextra 4 (Next.js App Router) 기반 한국어 문서
  사이트 ([`apps/docs`](apps/docs)) 신규 추가.
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
