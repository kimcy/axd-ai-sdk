import {
  type ChatRequest,
  type ChatTransport,
  type StreamPart,
} from '@axe-ai-sdk/core'

/**
 * A purely client-side transport that simulates a streaming LLM response.
 *
 * Mirrors the canonical `axe-wire/1` event order:
 *   message_created → thinking* → message* → done
 *
 * Demonstrates:
 * - `message-start` (from `message_created`)
 * - `thinking` (agent reasoning steps, running → complete)
 * - `text-delta` chunked character-by-character (from `message`)
 * - `metadata` (conversation id, arrives at end via `done`)
 * - `error` for the error-demo keyword
 * - respecting `request.signal` for aborts
 *
 * No backend required.
 */
export function createMockTransport(): ChatTransport {
  return {
    async *send(request: ChatRequest): AsyncIterable<StreamPart> {
      const userContent = lastUserContent(request)
      const triggerError = userContent.toLowerCase().includes('fail')
      const triggerSlow = userContent.toLowerCase().includes('slow')

      yield {
        type: 'message-start',
        messageId: `mock-${Date.now()}`,
      }

      await sleep(120, request.signal)

      yield {
        type: 'thinking',
        step: { agent: 'planner', status: 'running', thought: 'Parsing intent' },
      }
      await sleep(300, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: 'planner',
          status: 'complete',
          thought: 'Plan ready: answer with a greeting',
        },
      }

      yield {
        type: 'thinking',
        step: { agent: 'retriever', status: 'running', thought: 'Searching docs' },
      }
      await sleep(400, request.signal)
      yield {
        type: 'citation',
        citation: {
          id: 'doc-1',
          title: 'Getting started',
          url: 'https://example.com/docs/getting-started',
          snippet: 'axe-ai-sdk is a streaming chat SDK ...',
        },
      }
      yield {
        type: 'thinking',
        step: {
          agent: 'retriever',
          status: 'complete',
          thought: 'Found 1 relevant doc',
        },
      }

      if (triggerError) {
        yield {
          type: 'error',
          error: 'Mock transport failure (keyword "fail" detected)',
          code: 'MOCK_FAIL',
        }
        yield { type: 'finish', reason: 'error' }
        return
      }

      const reply = buildReply(userContent)
      for (const ch of reply) {
        await sleep(triggerSlow ? 80 : 20, request.signal)
        yield { type: 'text-delta', delta: ch }
      }

      yield { type: 'metadata', data: { conversationId: 'mock-convo-1' } }
      yield { type: 'finish', reason: 'stop' }
    },
  }
}

function buildReply(userContent: string): string {
  if (!userContent) return 'Please ask something.'
  return `You said: "${userContent}". This is a mock streaming reply from the axe-ai-sdk example. Try sending a message containing "fail" to see an error path, or "slow" to see a slower delta cadence.`
}

function lastUserContent(request: ChatRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i--) {
    const m = request.messages[i]
    if (m && m.role === 'user') return m.content
  }
  return ''
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
