export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type MessageStatus =
  | 'pending'
  | 'streaming'
  | 'done'
  | 'error'
  | 'aborted'

export type ThinkingStep = {
  id?: string
  agent: string
  status: 'running' | 'complete'
  thought?: string
  startedAt?: number
  completedAt?: number
}

export type ToolCall = {
  id: string
  name: string
  args?: unknown
  result?: unknown
  status: 'running' | 'complete' | 'error'
  error?: string
}

export type Citation = {
  id: string
  title?: string
  url?: string
  snippet?: string
  source?: string
}

export type Message = {
  id: string
  role: MessageRole
  content: string
  status: MessageStatus
  createdAt: number
  updatedAt: number
  error?: string
  thinkingSteps?: ThinkingStep[]
  toolCalls?: ToolCall[]
  citations?: Citation[]
  metadata?: Record<string, unknown>
}

export type StreamPart =
  | { type: 'message-start'; messageId?: string; role?: MessageRole }
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking'; step: ThinkingStep }
  | { type: 'tool-call'; toolCall: ToolCall }
  | { type: 'tool-result'; id: string; result: unknown }
  | { type: 'citation'; citation: Citation }
  | { type: 'metadata'; data: Record<string, unknown> }
  | { type: 'error'; error: string; code?: string }
  | { type: 'finish'; reason?: 'stop' | 'length' | 'error' | 'abort' }

export type ChatRequest = {
  messages: Message[]
  signal: AbortSignal
  metadata?: Record<string, unknown>
}

export type SendContext = {
  requestId: string
  signal: AbortSignal
}
