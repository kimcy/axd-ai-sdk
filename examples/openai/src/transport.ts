import { DefaultChatTransport } from '@axe-ai-sdk/react'

export const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareBody: (request, state) => ({
    messages: request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    ...(state.conversationId ? { conversationId: state.conversationId } : {}),
    model: import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini',
  }),
})

if (import.meta.env.DEV) {
  transport.onSSE((e) => {
    if (e.parts.length > 0) console.debug('[sse]', e.event, e.parts)
  })
}
