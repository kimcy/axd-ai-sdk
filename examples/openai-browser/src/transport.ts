import { createTextStreamTransport } from '@axe-ai-sdk/react'
import OpenAI from 'openai'

export function createOpenAITransport(opts: {
  apiKey: string
  model?: string
}) {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    dangerouslyAllowBrowser: true,
  })
  const model = opts.model ?? 'gpt-4o-mini'

  return createTextStreamTransport(async function* (req) {
    const stream = await client.chat.completions.create(
      {
        model,
        stream: true,
        messages: req.messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
      },
      { signal: req.signal }
    )
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  })
}
