import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import OpenAI from 'openai'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
const SYSTEM_PROMPT =
  process.env.OPENAI_SYSTEM_PROMPT ??
  'You are a concise, helpful assistant. Reply in Korean unless the user writes in another language. Use Markdown when it helps.'

if (!process.env.OPENAI_API_KEY) {
  console.error('[server] OPENAI_API_KEY is not set. Create a .env file.')
  process.exit(1)
}

const openai = new OpenAI()

type IncomingMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type IncomingBody = {
  messages: IncomingMessage[]
  conversationId?: string
  model?: string
}

const app = new Hono()

app.post('/api/chat', async (c) => {
  const body = (await c.req.json()) as IncomingBody
  const conversationId = body.conversationId ?? randomUUID()
  const messageId = randomUUID()
  const model = body.model ?? MODEL

  const hasSystem = body.messages.some((m) => m.role === 'system')
  const messages: IncomingMessage[] = hasSystem
    ? body.messages
    : [{ role: 'system', content: SYSTEM_PROMPT }, ...body.messages]

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    stream.onAbort(() => controller.abort())

    const write = (event: string, data: unknown) =>
      stream.writeSSE({ event, data: JSON.stringify(data) })

    try {
      await write('metadata', { data: { conversationId } })
      await write('message-start', { messageId })

      const completion = await openai.chat.completions.create(
        {
          model,
          stream: true,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        { signal: controller.signal }
      )

      let reason: 'stop' | 'abort' | 'error' = 'stop'
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) await write('text-delta', { delta })
          const finish = chunk.choices[0]?.finish_reason
          if (finish && finish !== 'stop') {
            // pass through non-stop reasons (length / content_filter / tool_calls)
            reason = 'stop'
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          reason = 'abort'
        } else {
          reason = 'error'
          await write('error', {
            error: (err as Error).message ?? 'OpenAI stream error',
            code: 'OPENAI_STREAM_ERROR',
          })
        }
      }

      await write('finish', { reason })
    } catch (err) {
      await write('error', {
        error: (err as Error).message ?? 'Unknown server error',
        code: 'SERVER_ERROR',
      })
      await write('finish', { reason: 'error' })
    }
  })
})

app.get('/api/health', (c) => c.json({ ok: true, model: MODEL }))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`)
  console.log(`[server] model=${MODEL}`)
})
