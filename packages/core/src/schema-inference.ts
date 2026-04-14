import type { SSERule, SSESchema } from './default-transport'

export type ParsedSSEEvent = { event: string; data: string }

/**
 * Parse a raw SSE dump (event: / data: lines) into event records.
 * Accepts CRLF/LF, handles multi-line `data:` fields, skips comments.
 */
export function parseSSEDump(raw: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = []
  let currentEvent = ''
  let currentData: string[] = []

  const flush = () => {
    if (currentEvent || currentData.length) {
      events.push({
        event: currentEvent || 'message',
        data: currentData.join('\n'),
      })
    }
    currentEvent = ''
    currentData = []
  }

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line === '') {
      flush()
      continue
    }
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const field = line.slice(0, colon)
    let value = line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') currentEvent = value
    else if (field === 'data') currentData.push(value)
  }
  flush()
  return events
}

type TypeHeuristic = {
  match: RegExp
  type: string
  wrap?: string
  fieldAliases: Record<string, RegExp>
  extra?: (data: any) => SSERule[]
}

const HEURISTICS: TypeHeuristic[] = [
  {
    match: /^(token|text[-_]?delta|delta|chunk|message)$/i,
    type: 'text-delta',
    fieldAliases: { delta: /^(text|delta|content|chunk)$/i },
  },
  {
    match: /^(thinking|thought|reasoning|step)$/i,
    type: 'thinking-step',
    wrap: 'step',
    fieldAliases: {
      agent: /^(agent|name|role)$/i,
      status: /^(status|state)$/i,
      thought: /^(thought|content|text|message)$/i,
    },
  },
  {
    match: /^(citation|source|reference)$/i,
    type: 'citation',
    wrap: 'citation',
    fieldAliases: {
      id: /^id$/i,
      title: /^title$/i,
      url: /^(url|link|href)$/i,
      snippet: /^(snippet|content|excerpt)$/i,
    },
  },
  {
    match: /^(message[-_]?start|message[-_]?created|start|begin)$/i,
    type: 'message-start',
    fieldAliases: { messageId: /^(message[-_]?id|messageId|id)$/i },
  },
  {
    match: /^(conversation[-_]?created|conversation[-_]?start)$/i,
    type: 'metadata',
    wrap: 'data',
    fieldAliases: {
      conversationId: /^(conversation[-_]?id|conversationId|id)$/i,
    },
  },
  {
    match: /^(done|finish|end|complete|stop)$/i,
    type: 'finish',
    fieldAliases: { reason: /^(finish[-_]?reason|reason)$/i },
  },
  {
    match: /^(error|fail|failure)$/i,
    type: 'error',
    fieldAliases: {
      error: /^(message|error|detail)$/i,
      code: /^code$/i,
    },
  },
  {
    match: /^(meta|metadata)$/i,
    type: 'metadata',
    wrap: 'data',
    fieldAliases: {},
  },
]

/**
 * Infer a best-guess `SSESchema` from a list of parsed SSE events.
 * Heuristic-based: matches event names to known `StreamPart` types and
 * maps observed data fields via field-name aliases. Unrecognized events
 * fall back to a kebab-case type with all fields spread.
 */
export function inferSchema(events: ParsedSSEEvent[]): SSESchema {
  const byEvent = new Map<string, Record<string, true>>()
  const samples = new Map<string, any>()

  for (const ev of events) {
    const data = tryParseJson(ev.data)
    if (!samples.has(ev.event)) samples.set(ev.event, data)
    if (data && typeof data === 'object') {
      const fields = byEvent.get(ev.event) ?? {}
      for (const key of Object.keys(data)) fields[key] = true
      byEvent.set(ev.event, fields)
    } else if (!byEvent.has(ev.event)) {
      byEvent.set(ev.event, {})
    }
  }

  const schema: SSESchema = {}
  for (const [eventName, fieldSet] of byEvent) {
    const observedFields = Object.keys(fieldSet)
    const heuristic = HEURISTICS.find((h) => h.match.test(eventName))
    const sample = samples.get(eventName)

    if (heuristic) {
      const fields: Record<string, string> = {}
      for (const [target, pattern] of Object.entries(heuristic.fieldAliases)) {
        const match = observedFields.find((f) => pattern.test(f))
        if (match) fields[target] = match
      }
      const rule: SSERule = { type: heuristic.type }
      if (heuristic.wrap) rule.wrap = heuristic.wrap
      if (Object.keys(fields).length > 0) rule.fields = fields
      else if (heuristic.type === 'metadata') {
        const spread: Record<string, string> = {}
        for (const f of observedFields) spread[toCamel(f)] = f
        if (Object.keys(spread).length) rule.fields = spread
      }

      const extra = heuristic.extra?.(sample) ?? []
      schema[eventName] = extra.length > 0 ? [rule, ...extra] : rule
    } else {
      const fields: Record<string, string> = {}
      for (const f of observedFields) fields[toCamel(f)] = f
      schema[eventName] = {
        type: kebab(eventName),
        ...(Object.keys(fields).length ? { fields } : {}),
      }
    }
  }
  return schema
}

/** Convenience: parse raw SSE and infer a schema in one call. */
export function inferSchemaFromRaw(raw: string): SSESchema {
  return inferSchema(parseSSEDump(raw))
}

function toCamel(s: string): string {
  return s.replace(/[_-](\w)/g, (_, c) => c.toUpperCase())
}

function kebab(s: string): string {
  return s.replace(/_/g, '-').toLowerCase()
}

function tryParseJson(raw: string): any {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
