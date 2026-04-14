import {
  type ChatRequest,
  type ChatTransport,
  type StreamPart,
  readSSEStream,
} from '@axe-ai-sdk/core'
import defaultSchema from './sse-schema.json'

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

const GATEWAY_URL =
  'https://ca-chatbot-backend.wittybay-7be49843.koreacentral.azurecontainerapps.io/api/v1/gateway/messages'

export type GatewayTransportOptions = {
  url?: string
  headers?: Record<string, string>
  schema?: SSESchema
  getConversationId?: () => string | null
  getMessageId?: () => string | null
  onConversationId?: (id: string) => void
}

export function createGatewayTransport(
  options: GatewayTransportOptions = {}
): ChatTransport {
  const url = options.url ?? GATEWAY_URL
  const interpret = buildInterpreter(
    options.schema ?? (defaultSchema as unknown as SSESchema)
  )

  return {
    async *send(request: ChatRequest): AsyncIterable<StreamPart> {
      const content = lastUserContent(request)
      const body: Record<string, unknown> = { content }
      const conversationId = options.getConversationId?.() ?? null
      const messageId = options.getMessageId?.() ?? null
      if (conversationId) body.conversationId = conversationId
      if (messageId) body.messageId = messageId

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(options.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal: request.signal,
      })

      if (!res.ok || !res.body) {
        const text = await safeText(res)
        yield {
          type: 'error',
          error: `Gateway ${res.status} ${res.statusText}${text ? ` · ${text}` : ''}`,
          code: `HTTP_${res.status}`,
        }
        yield { type: 'finish', reason: 'error' }
        return
      }

      let finished = false
      try {
        for await (const ev of readSSEStream(res.body, request.signal)) {
          for (const part of interpret(ev.event, ev.data)) {
            if (part.type === 'metadata') {
              const cid = part.data?.conversationId
              if (typeof cid === 'string') options.onConversationId?.(cid)
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
    },
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

function lastUserContent(request: ChatRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i--) {
    const m = request.messages[i]
    if (m && m.role === 'user') return m.content
  }
  return ''
}
