import { readSSEStream } from './sse-parser'
import { type ChatTransport } from './transport'
import { type ChatRequest, type StreamPart } from './types'

/**
 * JSON으로 선언하는 SSE 이벤트 → StreamPart 매핑 규칙.
 * - `type`: 출력할 StreamPart.type
 * - `fields`: { 타겟필드: 소스필드 } — data의 소스필드 값을 타겟필드로 복사
 * - `wrap`: 매핑된 필드를 한 번 더 감쌀 키 (예: "step", "citation", "data")
 *
 * 한 이벤트에서 여러 StreamPart를 내보내려면 Rule을 배열로 선언한다.
 */
export type SSERule = {
  type: string
  fields?: Record<string, string>
  wrap?: string
}

export type SSESchema = Record<string, SSERule | SSERule[]>

export type SSEDebugEvent = {
  event: string
  data: string
  parts: StreamPart[]
  ts: number
}

export type TransportState = {
  conversationId: string | null
}

export type DefaultChatTransportOptions = {
  /** Endpoint URL. */
  api: string
  /** Schema mapping server SSE events to `StreamPart` objects. */
  schema: SSESchema
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
 * HTTP+SSE chat transport with declarative event-schema mapping.
 *
 * - `api` 로 POST 스트리밍 호출
 * - 서버 SSE 이벤트를 `schema` 기반으로 `StreamPart`로 변환
 * - `metadata.conversationId` 자동 추적 → 다음 요청 body에 포함
 * - `onSSE(listener)` 로 raw 이벤트 구독 (디버그/시각화용)
 */
export class DefaultChatTransport implements ChatTransport {
  private state: TransportState = { conversationId: null }
  private listeners = new Set<(e: SSEDebugEvent) => void>()
  private interpret: (event: string, rawData: string) => StreamPart[]
  private fetchImpl: typeof fetch

  constructor(private opts: DefaultChatTransportOptions) {
    this.interpret = buildInterpreter(opts.schema)
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

    let finished = false
    try {
      for await (const ev of readSSEStream(res.body, request.signal)) {
        const parts = this.interpret(ev.event, ev.data)
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

function applyRule(rule: SSERule, data: any): StreamPart | null {
  const mapped: Record<string, unknown> = {}
  if (rule.fields) {
    for (const [target, source] of Object.entries(rule.fields)) {
      const value = data?.[source]
      if (value !== undefined) mapped[target] = value
    }
  }
  const payload = rule.wrap ? { [rule.wrap]: mapped } : mapped
  return { type: rule.type, ...payload } as StreamPart
}

function buildInterpreter(schema: SSESchema) {
  return (event: string, rawData: string): StreamPart[] => {
    if (rawData === '[DONE]') return [{ type: 'finish', reason: 'stop' }]
    const entry = schema[event]
    if (!entry) return []
    const rules = Array.isArray(entry) ? entry : [entry]
    const data = tryParseJson(rawData) ?? {}
    return rules
      .map((r) => applyRule(r, data))
      .filter((p): p is StreamPart => p !== null)
  }
}

function tryParseJson(raw: string): any {
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
