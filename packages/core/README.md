# @axe-ai-sdk/core

Transport-agnostic streaming chat core. Zero runtime dependencies.

## Install

```bash
pnpm add @axe-ai-sdk/core
```

## What you get

- `SSEParser` / `readSSEStream` — robust incremental SSE parser
- `ChatTransport` — adapter interface (OpenAI / Anthropic / MCP / custom)
- `StreamPart` — discriminated union with `text-delta`, `thinking`,
  `tool-call`, `tool-result`, `citation`, `metadata`, `error`, `finish`
- `ChatController` — request-scoped state machine with abort/idle-timeout
- `ChatError`, `AbortedError`, `TimeoutError`, `isAbortError()`

## Write a transport

```ts
import {
  type ChatTransport,
  type ChatRequest,
  type StreamPart,
  readSSEStream,
} from '@axe-ai-sdk/core'

export function createMyTransport(opts: { url: string }): ChatTransport {
  return {
    async *send(req: ChatRequest): AsyncIterable<StreamPart> {
      const response = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: req.messages }),
        signal: req.signal,
      })

      if (!response.ok || !response.body) {
        yield { type: 'error', error: `HTTP ${response.status}` }
        yield { type: 'finish', reason: 'error' }
        return
      }

      for await (const event of readSSEStream(response.body, req.signal)) {
        if (event.data === '[DONE]') continue
        const parsed = JSON.parse(event.data)
        if (parsed.delta) yield { type: 'text-delta', delta: parsed.delta }
      }

      yield { type: 'finish', reason: 'stop' }
    },
  }
}
```

## Use ChatController directly (framework-agnostic)

```ts
import { ChatController } from '@axe-ai-sdk/core'

const controller = new ChatController({
  transport: createMyTransport({ url: '/api/chat' }),
  idleTimeoutMs: 30_000,
  onMessagesChange: (messages) => render(messages),
  onStatusChange: (status) => console.log(status),
})

await controller.submit('Hello')
controller.stop()
```

For React, use [`@axe-ai-sdk/react`](../react).

## License

MIT
