import type {
  ChatRequest,
  ChatTransport,
  StreamPart,
} from '@axe-ai-sdk/react'
import OpenAI from 'openai'

/**
 * Browser-direct OpenAI transport.
 *
 * Bypasses a backend entirely — the browser talks to api.openai.com using the
 * user-provided API key. This is ONLY appropriate for local demos, internal
 * tools behind auth, or user-supplied-key scenarios (e.g. "bring your own key"
 * playgrounds). In production you want the server-proxy pattern instead
 * (see `examples/openai`).
 */
export class OpenAIBrowserTransport implements ChatTransport {
  private client: OpenAI
  private model: string
  private conversationId: string | null = null

  constructor(opts: { apiKey: string; model?: string; baseURL?: string }) {
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      dangerouslyAllowBrowser: true,
    })
    this.model = opts.model ?? 'gpt-4o-mini'
  }

  reset(): void {
    this.conversationId = null
  }

  async *send(request: ChatRequest): AsyncIterable<StreamPart> {
    if (!this.conversationId) {
      this.conversationId = crypto.randomUUID()
      yield {
        type: 'metadata',
        data: { conversationId: this.conversationId },
      }
    }

    yield { type: 'message-start', messageId: crypto.randomUUID() }

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          messages: request.messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          })),
        },
        { signal: request.signal }
      )

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) yield { type: 'text-delta', delta }
      }

      yield { type: 'finish', reason: 'stop' }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        yield { type: 'finish', reason: 'abort' }
        return
      }
      yield {
        type: 'error',
        error: (err as Error).message ?? 'OpenAI request failed',
        code: 'OPENAI_ERROR',
      }
      yield { type: 'finish', reason: 'error' }
    }
  }
}
