/** クエリ実行 Store — answer (生成回答) と search (検索結果) の2モードを扱う。 */
import { create } from 'zustand'

import { api, type Json } from '@/api/client'
import { parseAnswerResponse, parseSearchResponse } from '@/api/parse'
import type {
  AnswerOutcome,
  DebugTrace,
  HistoryItem,
  QueryMode,
  SearchOutcome,
} from '@/api/types'

const HISTORY_LIMIT = 100

interface SearchState {
  querying: boolean
  error: string | null
  currentAnswer: AnswerOutcome | null
  currentSearch: SearchOutcome | null
  lastTrace: DebugTrace | null
  history: HistoryItem[]
  sessionName: string | null

  executeAnswer: (params: {
    dataStore: string
    query: string
    preamble?: string
    useSession?: boolean
    relatedQuestions?: boolean
    servingConfig?: string
  }) => Promise<void>

  executeSearch: (params: {
    dataStore: string
    query: string
    pageSize?: number
    filter?: string
    withSummary?: boolean
    withSnippets?: boolean
    withExtractive?: boolean
    servingConfig?: string
  }) => Promise<void>

  resetSession: () => void
  clearHistory: () => void
  clearError: () => void
}

export const useSearchStore = create<SearchState>((set, get) => {
  /** 実行してトレースを残す共通処理。 */
  async function run<T>(
    endpoint: string,
    requestBody: Json,
    call: (body: Json) => Promise<Json>,
    parse: (raw: Json) => T,
  ): Promise<{ outcome: T, trace: DebugTrace }> {
    const trace: DebugTrace = { endpoint, requestBody, startedAt: Date.now() }
    set({ lastTrace: trace })
    try {
      const raw = await call(requestBody)
      const finishedAt = Date.now()
      const done: DebugTrace = {
        ...trace,
        responseBody: raw,
        finishedAt,
        durationMs: finishedAt - trace.startedAt,
      }
      set({ lastTrace: done })
      return { outcome: parse(raw), trace: done }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'クエリの実行に失敗しました'
      const finishedAt = Date.now()
      set({
        lastTrace: {
          ...trace,
          error: message,
          finishedAt,
          durationMs: finishedAt - trace.startedAt,
        },
      })
      throw new Error(message)
    }
  }

  const pushHistory = (item: HistoryItem) =>
    set({ history: [item, ...get().history].slice(0, HISTORY_LIMIT) })

  return {
    querying: false,
    error: null,
    currentAnswer: null,
    currentSearch: null,
    lastTrace: null,
    history: [],
    sessionName: null,

    async executeAnswer(params) {
      set({ querying: true, error: null, currentSearch: null })
      try {
        const body: Json = {
          data_store: params.dataStore,
          query: params.query,
          preamble: params.preamble || null,
          related_questions: params.relatedQuestions ?? true,
          serving_config: params.servingConfig || 'default_search',
        }
        const session = get().sessionName
        if (params.useSession && session) body.session = session

        const { outcome, trace } = await run(
          '/api/answer', body, api.answer, parseAnswerResponse,
        )
        set({ currentAnswer: outcome })
        if (outcome.sessionName) set({ sessionName: outcome.sessionName })

        pushHistory({
          id: `${Date.now()}`,
          mode: 'answer',
          query: params.query,
          dataStore: params.dataStore,
          answer: outcome,
          timestamp: Date.now(),
          trace,
        })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'クエリの実行に失敗しました' })
      } finally {
        set({ querying: false })
      }
    },

    async executeSearch(params) {
      set({ querying: true, error: null, currentAnswer: null })
      try {
        const body: Json = {
          data_store: params.dataStore,
          query: params.query,
          page_size: params.pageSize ?? 10,
          filter: params.filter || null,
          with_summary: params.withSummary ?? false,
          with_snippets: params.withSnippets ?? false,
          with_extractive: params.withExtractive ?? false,
          serving_config: params.servingConfig || 'default_search',
        }

        const { outcome, trace } = await run(
          '/api/search', body, api.search, parseSearchResponse,
        )
        set({ currentSearch: outcome })

        pushHistory({
          id: `${Date.now()}`,
          mode: 'search' as QueryMode,
          query: params.query,
          dataStore: params.dataStore,
          search: outcome,
          timestamp: Date.now(),
          trace,
        })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : '検索に失敗しました' })
      } finally {
        set({ querying: false })
      }
    },

    resetSession: () => set({ sessionName: null }),
    clearHistory: () => set({ history: [] }),
    clearError: () => set({ error: null }),
  }
})
