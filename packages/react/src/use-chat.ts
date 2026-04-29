import {
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ChatController,
  type ChatTransport,
  type ControllerStatus,
  type Message,
  type SubmitOptions,
} from '@axe-ai-sdk/core'
import {
  type PersistenceOptions,
  createStoragePersistence,
} from './persistence'

type TransportWithReset = ChatTransport & { reset?: () => void }

export type UseChatOptions<TMessage extends Message = Message> = {
  transport: ChatTransport
  initialMessages?: TMessage[]
  idleTimeoutMs?: number
  persistence?: PersistenceOptions
  /** localStorage key used to persist the conversation id. */
  conversationIdStorageKey?: string
  /** Custom Storage (defaults to window.localStorage). */
  storage?: Storage
  onError?: (error: Error) => void
  onFinish?: (message: TMessage) => void
}

export type UseChatReturn<TMessage extends Message = Message> = {
  messages: TMessage[]
  input: string
  setInput: (value: string) => void
  handleInputChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void
  handleSubmit: (e?: FormEvent, options?: SubmitOptions) => void
  submit: (content: string, options?: SubmitOptions) => void
  stop: () => void
  reload: (options?: Pick<SubmitOptions, 'metadata'>) => void
  setMessages: Dispatch<SetStateAction<TMessage[]>>
  clear: () => void
  /** Clears messages, resets conversation id + transport state, removes storage entry. */
  resetChat: () => void
  conversationId: string | null
  setConversationId: (id: string | null) => void
  status: ControllerStatus
  isStreaming: boolean
  error: Error | null
}

export function useChat<TMessage extends Message = Message>(
  options: UseChatOptions<TMessage>
): UseChatReturn<TMessage> {
  const optsRef = useRef(options)
  optsRef.current = options

  const persistence = useMemo(
    () =>
      options.persistence ? createStoragePersistence(options.persistence) : null,
    // Only re-create if the key changes; other fields are stable by convention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.persistence?.key]
  )

  const resolvedStorage = useMemo<Storage | null>(() => {
    if (options.storage) return options.storage
    if (typeof window === 'undefined') return null
    return window.localStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.storage])

  const [messages, setMessagesState] = useState<TMessage[]>(() => {
    const persisted = persistence?.load() as TMessage[] | null
    return persisted ?? options.initialMessages ?? []
  })
  const [status, setStatus] = useState<ControllerStatus>('idle')
  const [error, setError] = useState<Error | null>(null)
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (!options.conversationIdStorageKey || !resolvedStorage) return null
    return resolvedStorage.getItem(options.conversationIdStorageKey)
  })

  const controllerRef = useRef<ChatController | null>(null)

  if (controllerRef.current === null) {
    controllerRef.current = new ChatController({
      transport: options.transport,
      idleTimeoutMs: options.idleTimeoutMs,
      initialMessages: messages as Message[],
      onMessagesChange: (next) => {
        const typed = next as TMessage[]
        setMessagesState(typed)
        persistence?.save(next)
        const last = typed[typed.length - 1]
        if (
          last &&
          last.role === 'assistant' &&
          (last.status === 'done' || last.status === 'error')
        ) {
          optsRef.current.onFinish?.(last)
        }
      },
      onStatusChange: (s) => {
        setStatus(s)
        if (s === 'error') {
          const err = controllerRef.current?.getError() ?? null
          setError(err)
          if (err) optsRef.current.onError?.(err)
        } else if (s === 'idle') {
          setError(null)
        }
      },
    })
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.stop()
    }
  }, [])

  const latestGatewayConversationId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m || m.role !== 'assistant') continue
      const cid = (m.metadata as { conversationId?: unknown } | undefined)
        ?.conversationId
      return typeof cid === 'string' ? cid : null
    }
    return null
  })()

  if (
    latestGatewayConversationId &&
    latestGatewayConversationId !== conversationId
  ) {
    setConversationId(latestGatewayConversationId)
  }

  useEffect(() => {
    const key = optsRef.current.conversationIdStorageKey
    if (!key || !resolvedStorage) return
    if (conversationId) {
      resolvedStorage.setItem(key, conversationId)
    } else {
      resolvedStorage.removeItem(key)
    }
  }, [conversationId, resolvedStorage])

  const submit = useCallback((content: string, options?: SubmitOptions) => {
    const trimmed = content.trim()
    if (!trimmed) return
    void controllerRef.current?.submit(trimmed, options)
  }, [])

  const handleSubmit = useCallback(
    (e?: FormEvent, options?: SubmitOptions) => {
      e?.preventDefault()
      if (!input.trim()) return
      submit(input, options)
      setInput('')
    },
    [input, submit]
  )

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInput(e.target.value)
    },
    []
  )

  const stop = useCallback(() => {
    controllerRef.current?.stop()
  }, [])

  const reload = useCallback(
    (options?: Pick<SubmitOptions, 'metadata'>) => {
      void controllerRef.current?.reload(options)
    },
    []
  )

  const setMessages: Dispatch<SetStateAction<TMessage[]>> = useCallback(
    (updater) => {
      const controller = controllerRef.current
      if (!controller) return
      const prev = controller.getMessages() as TMessage[]
      const next =
        typeof updater === 'function'
          ? (updater as (p: TMessage[]) => TMessage[])(prev)
          : updater
      controller.setMessages(next as Message[])
    },
    []
  )

  const clear = useCallback(() => {
    controllerRef.current?.stop()
    controllerRef.current?.setMessages([])
    persistence?.clear()
  }, [persistence])

  const resetChat = useCallback(() => {
    clear()
    setConversationId(null)
    ;(optsRef.current.transport as TransportWithReset).reset?.()
  }, [clear])

  return {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    submit,
    stop,
    reload,
    setMessages,
    clear,
    resetChat,
    conversationId,
    setConversationId,
    status,
    isStreaming: status === 'streaming' || status === 'submitting',
    error,
  }
}
