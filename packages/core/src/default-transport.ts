import { readSSEStream } from './sse-parser'
import { type ChatTransport } from './transport'
import { type ChatRequest, type StreamPart } from './types'

/**
 * SSE wire format (`axe-wire/1`).
 *
 * Event names and their payload shapes:
 *
 *   event: message_created
 *   data: {"messageId":"..."}
 *
 *   event: thinking
 *   data: {"agent":"...","status":"running"|"complete"|"thinking","thought":"..."}
 *   // status:"thinking" is treated as an in-flight echo: chat-controller uses
 *   // it as a signal to demote any text-deltas streamed during the open
 *   // running step out of message.content and into that step's thought.
 *
 *   event: message
 *   data: {"content":"..."}
 *
 *   event: done
 *   data: {"conversationId":"...","conversationStatus":"ACTIVE"}
 *
 * `:heartbeat` SSE comments are ignored by the parser. Servers whose
 * format differs should provide a custom `interpret` or implement
 * `ChatTransport.send` directly.
 */

export type SSEDebugEvent = {
  event: string
  data: string
  parts: StreamPart[]
  ts: number
}

export type TransportState = {
  conversationId: string | null
}

/**
 * Maps one raw SSE event (event name + data payload) to zero or more
 * `StreamPart`s. Return `[]` to drop an event, or multiple parts to
 * fan one wire event out into several logical parts (e.g. the `done`
 * event becomes `metadata` + `finish`).
 *
 * The default implementation (`interpretAxeWire1`) speaks the canonical
 * `axe-wire/1` format. Override via `DefaultChatTransportOptions.interpret`
 * for servers whose SSE event names / payloads don't match canonical.
 */
export type InterpretSSE = (event: string, data: string) => StreamPart[]

export type DefaultChatTransportOptions = {
  /** Endpoint URL. */
  api: string
  /** Extra headers (static or resolver). */
  headers?: Record<string, string> | (() => Record<string, string>)
  /**
   * Build the POST body from the chat request + transport state.
   * Default: `{ messages, conversationId? }`.
   */
  prepareBody?: (
    request: ChatRequest,
    state: TransportState
  ) => Record<string, unknown>
  /**
   * Custom SSE → StreamPart mapper. Defaults to `interpretAxeWire1` which
   * speaks the canonical `axe-wire/1` format (`message_created`, `thinking`,
   * `message`, `done`). Provide this only when your server's wire format
   * differs.
   */
  interpret?: InterpretSSE
  /** Custom fetch (useful for SSR/testing). */
  fetch?: typeof fetch
}

const defaultPrepareBody = (
  request: ChatRequest,
  state: TransportState
): Record<string, unknown> => {
  const body: Record<string, unknown> = { messages: request.messages }
  if (state.conversationId) body.conversationId = state.conversationId
  return body
}

/**
 * HTTP+SSE chat transport speaking the canonical `axe-wire/1` format.
 *
 * - `api` 로 POST 스트리밍 호출
 * - 서버 SSE 이벤트(`event:` 이름이 `StreamPart.type`) 를 그대로 yield
 * - `metadata.conversationId` 자동 추적 → 다음 요청 body 에 포함
 * - `onSSE(listener)` 로 raw 이벤트 구독 (디버그/시각화용)
 *
 * 서버 포맷이 canonical 이 아니면 `ChatTransport.send` 를 직접 구현하세요.
 */
export class DefaultChatTransport implements ChatTransport {
  private state: TransportState = { conversationId: null }
  private listeners = new Set<(e: SSEDebugEvent) => void>()
  private fetchImpl: typeof fetch

  constructor(private opts: DefaultChatTransportOptions) {
    this.fetchImpl = opts.fetch ?? ((...args) => fetch(...args))
  }

  /** Subscribe to raw SSE events. Returns an unsubscribe function. */
  onSSE(listener: (e: SSEDebugEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Current conversation id captured from metadata events. */
  getConversationId(): string | null {
    return this.state.conversationId
  }

  /** Reset conversation state (e.g. when starting a new chat). */
  reset(): void {
    this.state.conversationId = null
  }

  async *send(request: ChatRequest): AsyncIterable<StreamPart> {
    const prepareBody = this.opts.prepareBody ?? defaultPrepareBody
    const body = prepareBody(request, { ...this.state })
    const headers =
      typeof this.opts.headers === 'function'
        ? this.opts.headers()
        : (this.opts.headers ?? {})

    const res = await this.fetchImpl(this.opts.api, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    })

    if (!res.ok || !res.body) {
      const text = await safeText(res)
      yield {
        type: 'error',
        error: `${res.status} ${res.statusText}${text ? ` · ${text}` : ''}`,
        code: `HTTP_${res.status}`,
      }
      yield { type: 'finish', reason: 'error' }
      return
    }

    const interpret = this.opts.interpret ?? interpretAxeWire1
    let finished = false
    try {
      for await (const ev of readSSEStream(res.body, request.signal)) {
        const parts = interpret(ev.event, ev.data)
        this.emit({ event: ev.event, data: ev.data, parts, ts: Date.now() })
        for (const part of parts) {
          if (part.type === 'metadata') {
            const cid = part.data?.conversationId
            if (typeof cid === 'string') this.state.conversationId = cid
          }
          yield part
          if (part.type === 'finish') {
            finished = true
            break
          }
        }
        if (finished) break
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        yield { type: 'finish', reason: 'abort' }
        return
      }
      yield {
        type: 'error',
        error: (err as Error)?.message ?? 'Stream read error',
      }
      yield { type: 'finish', reason: 'error' }
      return
    }

    if (!finished) yield { type: 'finish', reason: 'stop' }
  }

  private emit(e: SSEDebugEvent): void {
    for (const l of this.listeners) l(e)
  }
}

type WireEventData = {
  conversationId?: string
  conversationStatus?: string
  messageId?: string
  content?: string
  code?: string
  message?: string
  agent?: string
  status?: 'running' | 'complete' | 'thinking'
  thought?: string
}

/**
 * Default `InterpretSSE` for the canonical `axe-wire/1` format.
 *
 * Event → StreamPart mapping:
 *
 * - `event: message_created` `{ messageId }`
 *       → `message-start`
 * - `event: thinking` `{ agent, status: 'running' | 'complete', thought? }`
 *       → `thinking`
 *   (a wire `status: 'thinking'` is an in-flight thought update and is
 *    dropped — the running step is already open and the streaming `message`
 *    deltas already carry the same text.)
 * - `event: message` `{ content }` → `text-delta`
 * - `event: done` `{ conversationId?, conversationStatus? }`
 *       → `metadata` (when `conversationId` present) + `finish`
 * - Any event whose JSON payload has `{ code, message? }`
 *       → `error`
 * - `data: [DONE]` → `finish` (alias)
 *
 * Exported so custom interpreters can compose / fall back to it.
 */
export function interpretAxeWire1(
  event: string,
  rawData: string
): StreamPart[] {
  if (rawData === '[DONE]') return [{ type: 'finish', reason: 'stop' }]

  const parsed = tryParseJson(rawData) as WireEventData | null
  if (!parsed) return []

  if (parsed.code) {
    return [
      {
        type: 'error',
        error: parsed.message ?? 'Server error',
        code: parsed.code,
      },
    ]
  }

  if (event === 'message_created') {
    if (!parsed.messageId) return []
    return [{ type: 'message-start', messageId: parsed.messageId }]
  }

  if (event === 'thinking') {
    if (!parsed.agent || !parsed.status) return []
    if (
      parsed.status !== 'running' &&
      parsed.status !== 'complete' &&
      parsed.status !== 'thinking'
    ) {
      return []
    }
    return [
      {
        type: 'thinking',
        step: {
          agent: parsed.agent,
          status: parsed.status,
          thought: parsed.thought ?? '',
        },
      },
    ]
  }

  if (event === 'message') {
    if (typeof parsed.content !== 'string' || !parsed.content) return []
    return [{ type: 'text-delta', delta: parsed.content }]
  }

  if (event === 'done') {
    const parts: StreamPart[] = []
    if (parsed.conversationId) {
      parts.push({
        type: 'metadata',
        data: { conversationId: parsed.conversationId },
      })
    }
    parts.push({ type: 'finish', reason: doneReason(parsed.conversationStatus) })
    return parts
  }

  return []
}

function doneReason(
  status: string | undefined
): 'stop' | 'error' | 'abort' | 'length' {
  switch (status) {
    case 'ERROR':
      return 'error'
    case 'ABORTED':
      return 'abort'
    case 'LENGTH':
      return 'length'
    default:
      return 'stop'
  }
}

/** Safe `JSON.parse` wrapper exported for custom interpreter authors. */
export function tryParseJson(raw: string): any {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/** Helper: extract the last user message's content from a chat request. */
export function lastUserContent(request: ChatRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i--) {
    const m = request.messages[i]
    if (m && m.role === 'user') return m.content
  }
  return ''
}
