import { ChatError, TimeoutError, isAbortError } from './errors'
import { createId } from './id'
import { type ChatTransport } from './transport'
import { type Message, type StreamPart } from './types'

export type ChatControllerOptions = {
  transport: ChatTransport
  /** Max ms between stream parts before aborting with TimeoutError. 0 = off. */
  idleTimeoutMs?: number
  /** Called whenever messages array changes. */
  onMessagesChange?: (messages: Message[]) => void
  /** Called when overall status changes. */
  onStatusChange?: (status: ControllerStatus) => void
  /** Initial messages. */
  initialMessages?: Message[]
}

export type ControllerStatus = 'idle' | 'submitting' | 'streaming' | 'error'

export type SubmitOptions = {
  /** Metadata threaded into the transport for this request only. */
  metadata?: Record<string, unknown>
  /** Metadata saved on the user message itself (persisted with the message). */
  userMetadata?: Record<string, unknown>
}

type ActiveRequest = {
  id: string
  abortController: AbortController
  assistantMessageId: string
}

export class ChatController {
  private messages: Message[]
  private active: ActiveRequest | null = null
  private status: ControllerStatus = 'idle'
  private lastError: Error | null = null
  /**
   * Per-message: index in `message.content` where the currently-open running
   * thinking step's text-deltas began. Used to demote those deltas out of
   * `content` and into the step's `thought` if a `status:'thinking'` echo
   * arrives (signalling the deltas were reasoning, not the final answer).
   * Cleared when the step closes or the stream finishes.
   */
  private pendingDeltaStart = new Map<string, number>()

  constructor(private opts: ChatControllerOptions) {
    this.messages = opts.initialMessages ?? []
  }

  getMessages(): Message[] {
    return this.messages
  }

  getStatus(): ControllerStatus {
    return this.status
  }

  getError(): Error | null {
    return this.lastError
  }

  setMessages(next: Message[]): void {
    this.messages = next
    this.opts.onMessagesChange?.(this.messages)
  }

  /**
   * Append a user message and kick off an assistant response.
   * Returns the ID of the assistant message being generated, or null if
   * a request is already in flight (in which case this is a no-op).
   */
  async submit(
    userContent: string,
    options?: SubmitOptions
  ): Promise<string | null> {
    if (this.active) return null

    const now = Date.now()
    const userMsg: Message = {
      id: createId('msg'),
      role: 'user',
      content: userContent,
      status: 'done',
      createdAt: now,
      updatedAt: now,
      metadata: options?.userMetadata,
    }
    const assistantMsg: Message = {
      id: createId('msg'),
      role: 'assistant',
      content: '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    this.setMessages([...this.messages, userMsg, assistantMsg])
    return this.runRequest(assistantMsg.id, options?.metadata)
  }

  /**
   * Re-run the last assistant message (drops it and re-requests).
   */
  async reload(
    options?: Pick<SubmitOptions, 'metadata'>
  ): Promise<string | null> {
    if (this.active) return null
    const last = this.messages[this.messages.length - 1]
    if (!last || last.role !== 'assistant') return null

    const now = Date.now()
    const replacement: Message = {
      ...last,
      content: '',
      status: 'pending',
      error: undefined,
      thinkingSteps: undefined,
      toolCalls: undefined,
      citations: undefined,
      updatedAt: now,
    }
    this.pendingDeltaStart.delete(last.id)
    this.setMessages([...this.messages.slice(0, -1), replacement])
    return this.runRequest(replacement.id, options?.metadata)
  }

  stop(): void {
    if (!this.active) return
    const { abortController, assistantMessageId } = this.active
    abortController.abort()
    this.patchMessage(assistantMessageId, { status: 'aborted' })
  }

  private setStatus(next: ControllerStatus): void {
    if (this.status === next) return
    this.status = next
    this.opts.onStatusChange?.(next)
  }

  private patchMessage(id: string, patch: Partial<Message>): void {
    const idx = this.messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    const existing = this.messages[idx]!
    const next: Message = { ...existing, ...patch, updatedAt: Date.now() }
    const nextList = this.messages.slice()
    nextList[idx] = next
    this.setMessages(nextList)
  }

  private applyPart(id: string, part: StreamPart): void {
    const idx = this.messages.findIndex((m) => m.id === id)
    if (idx === -1) return
    const msg = this.messages[idx]!
    let next: Message = msg

    switch (part.type) {
      case 'message-start':
        next = {
          ...msg,
          status: 'streaming',
          metadata: part.messageId
            ? { ...msg.metadata, serverId: part.messageId }
            : msg.metadata,
        }
        break
      case 'text-delta': {
        // Append to message content live. If a running thinking step is open
        // and a `status:'thinking'` echo later arrives, those deltas will be
        // demoted from content into the step's thought (see 'thinking' case).
        const steps = msg.thinkingSteps ?? []
        const lastIdx = steps.length - 1
        const last = lastIdx >= 0 ? steps[lastIdx] : undefined
        if (
          last &&
          last.status === 'running' &&
          !this.pendingDeltaStart.has(msg.id)
        ) {
          this.pendingDeltaStart.set(msg.id, msg.content.length)
        }
        next = {
          ...msg,
          status: 'streaming',
          content: msg.content + part.delta,
        }
        break
      }
      case 'thinking': {
        const incoming = part.step
        if (incoming.status === 'thinking') {
          // Echo: demote any deltas streamed during the open running step
          // out of `content` and into that step's `thought`.
          const start = this.pendingDeltaStart.get(msg.id)
          const steps = msg.thinkingSteps ?? []
          const lastIdx = steps.length - 1
          const last = lastIdx >= 0 ? steps[lastIdx] : undefined
          if (
            last &&
            last.status === 'running' &&
            last.agent === incoming.agent &&
            typeof start === 'number'
          ) {
            const reasoning =
              incoming.thought && incoming.thought.length > 0
                ? incoming.thought
                : msg.content.slice(start)
            const updatedSteps = steps.slice()
            updatedSteps[lastIdx] = { ...last, thought: reasoning }
            next = {
              ...msg,
              status: 'streaming',
              content: msg.content.slice(0, start),
              thinkingSteps: updatedSteps,
            }
            this.pendingDeltaStart.delete(msg.id)
          } else {
            // Nothing to demote — drop the echo (the running step + any
            // streaming deltas already carry the same information).
            next = msg
          }
          break
        }
        // running | complete: clear pending tracker (deltas, if any, stay in
        // content as the answer) and append the step entry.
        this.pendingDeltaStart.delete(msg.id)
        next = {
          ...msg,
          status: 'streaming',
          thinkingSteps: [...(msg.thinkingSteps ?? []), incoming],
        }
        break
      }
      case 'tool-call': {
        const existingCalls = msg.toolCalls ?? []
        const existingIdx = existingCalls.findIndex(
          (c) => c.id === part.toolCall.id
        )
        const nextCalls =
          existingIdx === -1
            ? [...existingCalls, part.toolCall]
            : existingCalls.map((c, i) =>
                i === existingIdx ? { ...c, ...part.toolCall } : c
              )
        next = { ...msg, status: 'streaming', toolCalls: nextCalls }
        break
      }
      case 'tool-result': {
        const existingCalls = msg.toolCalls ?? []
        const nextCalls = existingCalls.map((c) =>
          c.id === part.id
            ? { ...c, result: part.result, status: 'complete' as const }
            : c
        )
        next = { ...msg, toolCalls: nextCalls }
        break
      }
      case 'citation': {
        const existing = msg.citations ?? []
        next = { ...msg, citations: [...existing, part.citation] }
        break
      }
      case 'metadata':
        next = { ...msg, metadata: { ...msg.metadata, ...part.data } }
        break
      case 'error':
        next = { ...msg, status: 'error', error: part.error }
        break
      case 'finish':
        this.pendingDeltaStart.delete(msg.id)
        next = {
          ...msg,
          status:
            part.reason === 'abort'
              ? 'aborted'
              : part.reason === 'error'
                ? 'error'
                : 'done',
        }
        break
    }

    next = { ...next, updatedAt: Date.now() }
    const nextList = this.messages.slice()
    nextList[idx] = next
    this.setMessages(nextList)
  }

  private async runRequest(
    assistantMessageId: string,
    requestMetadata?: Record<string, unknown>
  ): Promise<string> {
    const abortController = new AbortController()
    const requestId = createId('req')
    this.active = { id: requestId, abortController, assistantMessageId }
    this.lastError = null
    this.setStatus('submitting')

    let idleTimer: ReturnType<typeof setTimeout> | null = null
    const { idleTimeoutMs } = this.opts
    const resetIdle = () => {
      if (!idleTimeoutMs) return
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        abortController.abort(new TimeoutError())
      }, idleTimeoutMs)
    }

    try {
      const stream = this.opts.transport.send({
        messages: this.messages,
        signal: abortController.signal,
        metadata: requestMetadata,
      })
      this.setStatus('streaming')
      resetIdle()

      let finished = false
      for await (const part of stream) {
        if (abortController.signal.aborted) break
        // Ignore late parts that target a stale assistant (shouldn't happen
        // since we guard against concurrent requests, but future-proofed).
        if (this.active?.id !== requestId) break
        this.applyPart(assistantMessageId, part)
        resetIdle()
        if (part.type === 'finish') {
          finished = true
        }
      }

      if (!finished && !abortController.signal.aborted) {
        // Stream ended without an explicit finish; mark done.
        this.patchMessage(assistantMessageId, { status: 'done' })
      }
      this.setStatus('idle')
    } catch (err) {
      if (isAbortError(err)) {
        this.patchMessage(assistantMessageId, { status: 'aborted' })
        this.setStatus('idle')
      } else {
        const error =
          err instanceof Error
            ? err
            : new ChatError('Unknown stream error', { cause: err })
        if (err instanceof TimeoutError) {
          this.patchMessage(assistantMessageId, {
            status: 'error',
            error: error.message,
          })
        } else {
          this.patchMessage(assistantMessageId, {
            status: 'error',
            error: error.message,
          })
        }
        this.lastError = error
        this.setStatus('error')
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer)
      if (this.active?.id === requestId) this.active = null
    }

    return assistantMessageId
  }
}

