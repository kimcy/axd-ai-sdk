import { useMemo, useState } from 'react'
import { parseSSEDump, inferSchema } from '@axe-ai-sdk/react'

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
      const events = parseSSEDump(input)
      if (events.length === 0) return '// SSE 이벤트를 찾지 못했어요'
      return JSON.stringify(inferSchema(events), null, 2)
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
        서버 SSE 덤프를 붙여넣으면 자동으로 <code>sse-schema.json</code>{' '}
        형태로 변환돼요. 그대로 복사해서 스키마 파일에 붙여넣으면 됩니다.
        <br />
        터미널에서는:{' '}
        <code>npx axe-infer-schema dump.txt &gt; sse-schema.json</code>
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
