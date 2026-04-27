# @axe-ai-sdk example — gateway

Runnable Vite + React example demonstrating `@axe-ai-sdk/react` with a
mock streaming transport (no backend required).

## Run

From the repo root:

```bash
pnpm install
pnpm -r --filter @axe-ai-sdk/* build
pnpm --filter @axe-ai-sdk/example-gateway dev
```

Open the printed localhost URL.

## What it shows

- `useChat` with `localStorage` persistence
- Agent reasoning steps (`thinking` parts, `running` → `complete`)
- RAG-style citations
- Error path — send a message containing `fail`
- Slow stream cadence — send a message containing `slow`
- Abort mid-stream with the Stop button
- Retry after error with the Retry button
- Request isolation — Send is disabled while a stream is active

## Files

- [`src/mock-transport.ts`](src/mock-transport.ts) — full `ChatTransport`
  implementation showing every `StreamPart` type
- [`src/App.tsx`](src/App.tsx) — minimal UI using `useChat`
