# axe-ai-sdk

React-first streaming chat SDK. Adapter-based, SSE/stream safe, agent/tool/RAG
metadata first-class.

Inspired by Vercel's `ai` SDK but adapter-centric: bring your own backend
(OpenAI, Anthropic, MCP, custom gateway) by writing one `ChatTransport`.

## Packages

| Package | Description |
| --- | --- |
| [`@axe-ai-sdk/core`](packages/core) | Transport-agnostic streaming, SSE parser, `ChatController`, errors, types |
| [`@axe-ai-sdk/react`](packages/react) | `useChat` hook, optimistic UI, localStorage persistence |
| [`@axe-ai-sdk/docs`](apps/docs) | Nextra 4 기반 한국어 문서 사이트 |

## Documentation

한국어 문서 사이트는 [`apps/docs`](apps/docs) 에 있으며, 루트에서 바로 실행할 수 있습니다.

```bash
pnpm install       # 처음 한 번
pnpm docs:dev      # 개발 서버 → http://localhost:3000
pnpm docs:build    # 프로덕션 빌드
pnpm docs:start    # 빌드 결과 실행
pnpm docs:clean    # .next 정리
```

> `pnpm docs` 는 pnpm 내장 명령(패키지 npm 페이지 열기)과 충돌하므로
> `pnpm docs:dev` 를 사용합니다.

## Example (gateway)

Vite 기반 예제는 [`examples/gateway`](examples/gateway) 에 있습니다.

```bash
pnpm -r --filter './packages/*' build   # 패키지 먼저 빌드 (최초 1회)
pnpm example:dev                         # 개발 서버 → http://localhost:5173
pnpm example:build                       # 프로덕션 빌드
pnpm example:preview                     # 빌드 결과 미리보기
```

새 문서는 `apps/docs/content/docs/<섹션>/<slug>.mdx` 에 추가하고, 해당 폴더의
`_meta.js` 에 slug 를 등록하면 사이드바에 자동 반영됩니다.

## Features

- **Robust SSE parsing** — handles CRLF/LF, multi-line `data:`, comments,
  partial chunks at arbitrary byte boundaries, UTF-8 stream-safe.
- **Adapter pattern** — implement `ChatTransport.send(request)` once,
  swap backends freely.
- **Request isolation** — per-request abort controllers, no interleaved
  streams when users fire multiple messages in quick succession.
- **Idle timeout** — chunk-gap-based, not total request timeout
  (appropriate for long-running generations).
- **Agent / tool / RAG ready** — `StreamPart` union carries `thinking-step`,
  `tool-call`, `tool-result`, `citation`, and arbitrary `metadata`.
- **Typed status machine** — each message tracks `pending` → `streaming`
  → `done` / `error` / `aborted`.
- **Persistence** — opt-in `localStorage`, with in-flight state sanitization
  on save so refreshes never resurrect half-streamed messages.
- **Tiny footprint** — core ~11 KB, react ~4 KB (minified, pre-gzip).
  React is a peer dependency; core has zero runtime dependencies.

## Local development

```bash
pnpm install
pnpm -r build
```

Each package has `pnpm build`, `pnpm dev` (watch), `pnpm typecheck`,
and `pnpm clean`.

### Consuming from another repo during dev

Two options:

**1. Tarball via `pnpm pack` + `file:` reference** (reproducible, closest to
published behavior):

```bash
cd packages/core && pnpm pack
cd ../react && pnpm pack
```

In the consumer's `package.json`:

```json
{
  "dependencies": {
    "@axe-ai-sdk/core": "file:../axe-ai-sdk/packages/core/axe-ai-sdk-core-0.0.1.tgz",
    "@axe-ai-sdk/react": "file:../axe-ai-sdk/packages/react/axe-ai-sdk-react-0.0.1.tgz"
  },
  "pnpm": {
    "overrides": {
      "@axe-ai-sdk/core": "file:../axe-ai-sdk/packages/core/axe-ai-sdk-core-0.0.1.tgz"
    }
  }
}
```

The `pnpm.overrides` entry is needed because `@axe-ai-sdk/react` depends on
`@axe-ai-sdk/core` via `workspace:*`, which pnpm rewrites to `0.0.1` on pack
and then tries to fetch from the registry. The override forces it to use the
local tarball.

**2. Symlink via `link:` protocol** (edit-and-reload dev loop, no repack):

```json
{
  "dependencies": {
    "@axe-ai-sdk/core": "link:../axe-ai-sdk/packages/core",
    "@axe-ai-sdk/react": "link:../axe-ai-sdk/packages/react"
  }
}
```

Run `pnpm -r --filter @axe-ai-sdk/* dev` in this repo for watch-mode rebuilds.
The consumer picks up changes as soon as `dist/` updates.

## Quick example

```tsx
import { useChat } from '@axe-ai-sdk/react'
import { createMyTransport } from './my-transport'

const transport = createMyTransport({ url: '/api/chat' })

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isStreaming, stop } =
    useChat({ transport, persistence: { key: 'chat-demo' } })

  return (
    <form onSubmit={handleSubmit}>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role}</strong>: {m.content}
        </div>
      ))}
      <input value={input} onChange={handleInputChange} />
      {isStreaming ? (
        <button type='button' onClick={stop}>Stop</button>
      ) : (
        <button type='submit'>Send</button>
      )}
    </form>
  )
}
```

See [`examples/gateway/`](examples/gateway) for a full runnable example that
includes a mock SSE transport, request metadata, thinking-step rendering, and
error/retry flows.

## Commit & Release

커밋 메시지는 [Conventional Commits](https://www.conventionalcommits.org/) 형식을 따릅니다.
`commitlint` 가 husky `commit-msg` 훅에서 검증합니다.

```
<type>(<scope>): <subject>

feat(core): add reconnect logic
fix(react): avoid double submit on Enter
docs: add useChat examples
chore: bump deps
```

허용 타입: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`,
`build`, `ci`, `chore`, `revert`.

### 릴리스

커밋이 쌓인 뒤 `changelogen` 이 Conventional Commits 를 읽어 `CHANGELOG.md`
를 자동 생성하고 버전을 bump 합니다.

```bash
pnpm changelog     # dry-run. CHANGELOG.md 미리보기만 갱신
pnpm release       # 버전 bump + CHANGELOG + git tag + git push
```

## License

[MIT](LICENSE)
