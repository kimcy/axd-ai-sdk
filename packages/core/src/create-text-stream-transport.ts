import { createId } from './id'
import { type ChatTransport } from './transport'
import { type ChatRequest, type StreamPart } from './types'

/**
 * User-supplied generator: receives the chat request and yields plain text
 * deltas. Everything else (metadata, message-start, error/abort/finish
 * framing) is handled by `createTextStreamTransport` so vendor adapters
 * stay focused on "how do I get tokens from this API".
 */
export type TextStreamGenerator = (
  request: ChatRequest
) => AsyncIterable<string>

export type CreateTextStreamTransportOptions = {
  /**
   * Supply a conversation id. If omitted, a fresh id is generated on the
   * first `send()` call and reused until `reset()` is called. Set to
   * `false` to skip emitting the `metadata` part entirely (useful when the
   * generator itself yields metadata for you).
   */
  conversationId?: string | false
  /** Override id generator for `messageId` / conversationId. */
  idFactory?: () => string
}

/**
 * Wrap a text-delta generator into a `ChatTransport`.
 *
 * The generator yields plain strings and this helper emits the full
 * `metadata` → `message-start` → `text-delta`* → `finish` envelope for you,
 * including mapping `AbortError` → `finish({reason:'abort'})` and any
 * other throw → `error` + `finish({reason:'error'})`.
 *
 * @example
 * ```ts
 * import OpenAI from 'openai'
 * import { createTextStreamTransport } from '@axe-ai-sdk/core'
 *
 * const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
 *
 * export const transport = createTextStreamTransport(async function* (req) {
 *   const stream = await openai.chat.completions.create(
 *     { model: 'gpt-4o-mini', stream: true,
 *       messages: req.messages.map(m => ({ role: m.role, content: m.content })) },
 *     { signal: req.signal }
 *   )
 *   for await (const chunk of stream) {
 *     const delta = chunk.choices[0]?.delta?.content
 *     if (delta) yield delta
 *   }
 * })
 * ```
 */
export function createTextStreamTransport(
  generate: TextStreamGenerator,
  options: CreateTextStreamTransportOptions = {}
): ChatTransport & { reset: () => void } {
  const idFactory = options.idFactory ?? (() => createId('msg'))
  let conversationId: string | null =
    typeof options.conversationId === 'string' ? options.conversationId : null
  const suppressMetadata = options.conversationId === false

  return {
    reset() {
      if (typeof options.conversationId !== 'string') {
        conversationId = null
      }
    },

    async *send(request: ChatRequest): AsyncIterable<StreamPart> {
      if (!suppressMetadata) {
        if (!conversationId) conversationId = idFactory()
        yield { type: 'metadata', data: { conversationId } }
      }
      yield { type: 'message-start', messageId: idFactory() }

      try {
        for await (const delta of generate(request)) {
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
          error: (err as Error).message ?? 'Stream generator error',
        }
        yield { type: 'finish', reason: 'error' }
      }
    },
  }
}
