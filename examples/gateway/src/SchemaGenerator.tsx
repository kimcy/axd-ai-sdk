import { useMemo, useState } from 'react'

type ParsedEvent = { event: string; data: string }

type Rule = {
  type: string
  wrap?: string
  fields?: Record<string, string>
}

type Schema = Record<string, Rule | Rule[]>

const SAMPLE = `event: message_start
data: {"message_id":"msg_01abc","conversation_id":"conv_123"}

event: token
data: {"text":"안녕"}

event: done
data: {"finish_reason":"stop"}
`

export function SchemaGenerator() {
  const [input, setInput] = useState('')
  const [copied, setCopied] = useState(false)

  const output = useMemo(() => {
    if (!input.trim()) return ''
    try {
      const events = parseSSE(input)
      if (events.length === 0) return '// SSE 이벤트를 찾지 못했어요'
      const schema = inferSchema(events)
      return JSON.stringify(schema, null, 2)
    } catch (e) {
      return `// 파싱 오류: ${(e as Error).message}`
    }
  }, [input])

  const handleCopy = async () => {
    if (!output || output.startsWith('//')) return
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className='schema-gen'>
      <p className='hint'>
        서버 SSE 덤프를 붙여넣고 <strong>Output</strong>을 누르면{' '}
        <code>sse-schema.json</code> 형태로 변환돼요. 그대로 복사해서 스키마
        파일에 붙여넣으면 됩니다.
      </p>

      <div className='gen-row'>
        <label>
          <div className='gen-label'>
            <span>Raw SSE</span>
            <button
              type='button'
              className='clear'
              onClick={() => setInput(SAMPLE)}
            >
              Load sample
            </button>
          </div>
          <textarea
            className='gen-textarea'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'event: token\ndata: {"text":"hi"}\n\n...'}
            spellCheck={false}
          />
        </label>

        <label>
          <div className='gen-label'>
            <span>Output (sse-schema.json)</span>
            <button
              type='button'
              className='clear'
              onClick={handleCopy}
              disabled={!output || output.startsWith('//')}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <textarea
            className='gen-textarea'
            value={output}
            readOnly
            spellCheck={false}
            placeholder='여기에 변환 결과가 나와요'
          />
        </label>
      </div>
    </div>
  )
}

function parseSSE(raw: string): ParsedEvent[] {
  const events: ParsedEvent[] = []
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
  extra?: (data: any) => Rule[]
}

const HEURISTICS: TypeHeuristic[] = [
  {
    match: /^(token|text[-_]?delta|delta|chunk)$/i,
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
    match: /^(message[-_]?start|start|begin)$/i,
    type: 'message-start',
    fieldAliases: { messageId: /^(message[-_]?id|messageId|id)$/i },
    extra: (data) =>
      data && typeof data.conversation_id === 'string'
        ? [
            {
              type: 'metadata',
              wrap: 'data',
              fields: { conversationId: 'conversation_id' },
            },
          ]
        : [],
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

function inferSchema(events: ParsedEvent[]): Schema {
  const byEvent = new Map<string, Record<string, true>>()
  const samples = new Map<string, any>()

  for (const ev of events) {
    const data = tryParseJson(ev.data)
    if (!samples.has(ev.event)) samples.set(ev.event, data)
    if (data && typeof data === 'object') {
      const fields = byEvent.get(ev.event) ?? {}
      for (const key of Object.keys(data)) fields[key] = true
      byEvent.set(ev.event, fields)
    } else {
      if (!byEvent.has(ev.event)) byEvent.set(ev.event, {})
    }
  }

  const schema: Schema = {}
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
      const rule: Rule = { type: heuristic.type }
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
