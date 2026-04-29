import {
  type ChatRequest,
  type ChatTransport,
  type StreamPart,
} from '@axe-ai-sdk/core'

/**
 * A purely client-side transport that simulates a streaming LLM response.
 *
 * Mirrors a realistic multi-agent run on the canonical `axe-wire/1` order:
 *   conversation_created → message_created
 *     → preflight thinking steps (개인정보 검사 / 컨텍스트 주입 / 도메인 용어 매칭
 *       / 업무 영역 검사 / 작업 분해)
 *     → Agent 판단 running → reasoning text-deltas → status:'thinking' echo
 *       (chat-controller demotes the deltas into the step's thought) → complete
 *     → 서브에이전트 + tool steps
 *     → final Agent 판단 running → answer text-deltas (post-echo behaviour:
 *       once an echo has fired for the open running step, subsequent deltas
 *       stream straight to message.content) → complete
 *     → 꼬리질문 running → complete
 *     → done
 *
 * No backend required.
 */
export function createMockTransport(): ChatTransport {
  return {
    async *send(request: ChatRequest): AsyncIterable<StreamPart> {
      const userContent = lastUserContent(request)
      const triggerError = userContent.toLowerCase().includes('fail')
      const triggerSlow = userContent.toLowerCase().includes('slow')

      const conversationId = '69f14c1710071f2036e80630'
      const messageId = '69f14c1810071f2036e80632'
      const stepDelay = triggerSlow ? 250 : 90
      const tokenDelay = triggerSlow ? 80 : 20

      // `conversation_created` on the wire — surfaces as metadata up front.
      yield { type: 'metadata', data: { conversationId } }
      await sleep(stepDelay, request.signal)

      yield { type: 'message-start', messageId }
      await sleep(stepDelay, request.signal)

      const preflight: Array<[string, string, string]> = [
        ['개인정보 검사', '개인정보 검사 진행 중...', '개인정보 없음 - 정상 처리'],
        ['컨텍스트 주입', '컨텍스트 주입 진행 중...', '컨텍스트 주입 완료'],
        ['도메인 용어 매칭', '도메인 용어 매칭 진행 중...', '매칭된 도메인 용어 없음'],
        ['업무 영역 검사', '업무 영역 검사 진행 중...', '업무 범위 내 질의 - 정상 처리'],
        ['작업 분해', '작업 분해 진행 중...', '작업 계획 수립: pr_product_recommendation'],
      ]
      for (const [agent, runningThought, completeThought] of preflight) {
        yield {
          type: 'thinking',
          step: { agent, status: 'running', thought: runningThought },
        }
        await sleep(stepDelay, request.signal)
        yield {
          type: 'thinking',
          step: { agent, status: 'complete', thought: completeThought },
        }
        await sleep(stepDelay, request.signal)
      }

      if (triggerError) {
        yield {
          type: 'error',
          error: 'Mock transport failure (keyword "fail" detected)',
          code: 'MOCK_FAIL',
        }
        yield { type: 'finish', reason: 'error' }
        return
      }

      // ── Agent 판단: reasoning phase ────────────────────────────────────
      // Open the step, stream a sentence as text-deltas (the controller
      // BUFFERS them while the running step is open), then emit the
      // `status:'thinking'` echo to flush them into the step's thought.
      yield {
        type: 'thinking',
        step: { agent: 'Agent 판단', status: 'running', thought: 'Agent 판단 진행 중...' },
      }
      await sleep(stepDelay, request.signal)

      const reasoningChunks = [
        '추천', ' 가능한', ' 상품', '과', ' 주요', ' 담', '보',
        ' 정보를', ' 먼저', ' 확인', '하', '겠습니다', '.',
      ]
      for (const chunk of reasoningChunks) {
        await sleep(tokenDelay, request.signal)
        yield { type: 'text-delta', delta: chunk }
      }

      await sleep(stepDelay, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: 'Agent 판단',
          status: 'thinking',
          thought: '추천 가능한 상품과 주요 담보 정보를 먼저 확인하겠습니다.',
        },
      }
      await sleep(stepDelay, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: 'Agent 판단',
          status: 'complete',
          thought: '도구 사용 결정: pr_product_recommendation',
        },
      }
      await sleep(stepDelay, request.signal)

      // ── 서브에이전트 + tool ─────────────────────────────────────────────
      yield {
        type: 'thinking',
        step: {
          agent: '서브에이전트',
          status: 'running',
          thought: '서브에이전트 실행 중: pr_product_recommendation',
        },
      }
      await sleep(stepDelay, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: 'pr_product_recommendation tool',
          status: 'running',
          thought: 'getRecommandGoods (t04) 호출 중',
        },
      }
      await sleep(stepDelay * 2, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: 'pr_product_recommendation tool',
          status: 'complete',
          thought: 'getRecommandGoods (t04) 완료',
        },
      }
      await sleep(stepDelay, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: '서브에이전트',
          status: 'complete',
          thought: '실행 완료: pr_product_recommendation',
        },
      }
      await sleep(stepDelay, request.signal)

      // ── Final Agent 판단: answer phase ─────────────────────────────────
      // Re-open Agent 판단, then stream the answer as text-deltas. Because
      // the prior step closed, this new running step starts with a fresh
      // post-echo flag. Here we DON'T emit an echo — the deltas land in the
      // step's buffer and are flushed to `message.content` on `complete`.
      yield {
        type: 'thinking',
        step: { agent: 'Agent 판단', status: 'running', thought: 'Agent 판단 진행 중...' },
      }
      await sleep(stepDelay, request.signal)

      // `reasoningChunks`와 같은 방식: 토큰 단위로 쪼개 스트리밍 (합치면 한 덩어리 문장)
      const answerChunks = [
        '## ', '추천 ', '상품 ', '안내\n\n',
        '요청하신 ', '조건에 ', '맞는 ',
        '상품을 ', '선별했', '으며, ',
        '세부 ', '내용은 ', '담당 ', '채널에서 ',
        '안내', '드리', '겠습니다', '.', ' 😊',
      ]
      for (const chunk of answerChunks) {
        await sleep(tokenDelay, request.signal)
        yield { type: 'text-delta', delta: chunk }
      }

      await sleep(stepDelay, request.signal)
      yield {
        type: 'thinking',
        step: {
          agent: 'Agent 판단',
          status: 'complete',
          thought: '직접 답변 생성',
        },
      }
      await sleep(stepDelay, request.signal)

      // ── 꼬리질문 ───────────────────────────────────────────────────────
      // `running` arrives after content is already populated — chat-controller
      // suppresses it so no "thinking..." indicator flashes back in.
      yield {
        type: 'thinking',
        step: { agent: '꼬리질문', status: 'running', thought: '꼬리질문 생성 중' },
      }
      await sleep(stepDelay, request.signal)
      yield {
        type: 'thinking',
        step: { agent: '꼬리질문', status: 'complete', thought: '꼬리질문 3개 생성 완료' },
      }
      await sleep(stepDelay, request.signal)

      yield { type: 'metadata', data: { conversationId } }
      yield { type: 'finish', reason: 'stop' }
    },
  }
}

function lastUserContent(request: ChatRequest): string {
  for (let i = request.messages.length - 1; i >= 0; i--) {
    const m = request.messages[i]
    if (m && m.role === 'user') return m.content
  }
  return ''
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
