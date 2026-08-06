/**
 * 接続 Store
 * - Vertex AI Search への接続設定 / 認証状態
 * - データストア一覧、ドキュメント一覧・削除・取り込み
 *
 * 設定の永続化はバックエンド (~/.vertexscope/config.json) が担当する。
 */
import { create } from 'zustand'

import { api } from '@/api/client'
import {
  DEFAULT_CONNECTION_CONFIG,
  type AuthStatus,
  type ConnectionConfig,
  type DataStore,
  type Engine,
  type VertexDocument,
} from '@/api/types'

interface ConnectionState {
  config: ConnectionConfig
  authStatus: AuthStatus | null
  initialized: boolean
  checkingAuth: boolean

  dataStores: DataStore[]
  currentDataStore: DataStore | null
  engines: Engine[]
  loadingStores: boolean
  enriching: boolean

  documents: VertexDocument[]
  loadingDocuments: boolean

  error: string | null

  init: () => Promise<void>
  saveConfig: (next: ConnectionConfig) => Promise<void>
  checkAuth: () => Promise<AuthStatus | null>
  fetchDataStores: () => Promise<void>
  fetchEngines: () => Promise<void>
  fetchDataStoreDetail: (dataStore: string) => Promise<DataStore | null>
  fetchDocuments: (dataStore: string) => Promise<void>
  removeDocument: (documentName: string) => Promise<void>
  bulkRemoveDocuments: (documentNames: string[]) => Promise<number>
  importFromGcs: (params: {
    dataStore: string
    gcsUris: string[]
    dataSchema: string
    reconciliationMode: string
  }) => Promise<string>
  clearError: () => void
}

const messageOf = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback

/**
 * 初期化は複数のコンポーネントから同時に呼ばれる。
 * 進行中の Promise を共有して、後発の呼び出しも完了を待てるようにする。
 */
let initPromise: Promise<void> | null = null

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  config: { ...DEFAULT_CONNECTION_CONFIG },
  authStatus: null,
  initialized: false,
  checkingAuth: false,

  dataStores: [],
  currentDataStore: null,
  engines: [],
  loadingStores: false,
  enriching: false,

  documents: [],
  loadingDocuments: false,

  error: null,

  async init() {
    initPromise ??= (async () => {
      try {
        set({ config: await api.getConfig() })
      } catch {
        /* バックエンド未起動時は checkAuth 側でエラーを表示する */
      }
      await get().checkAuth()
      set({ initialized: true })
    })()
    return initPromise
  },

  async saveConfig(next) {
    set({ error: null })
    try {
      set({ config: await api.saveConfig(next) })
    } catch (e) {
      set({ error: messageOf(e, '設定の保存に失敗しました') })
      await get().checkAuth()
      throw e
    }
    await get().checkAuth()
  },

  async checkAuth() {
    set({ checkingAuth: true })
    try {
      const status = await api.authStatus()
      set({ authStatus: status, config: status.config ?? get().config })
      return status
    } catch (e) {
      const status: AuthStatus = {
        authenticated: false,
        source: null,
        message: messageOf(e, '認証状態を取得できませんでした'),
        config: get().config,
      }
      set({ authStatus: status })
      return status
    } finally {
      set({ checkingAuth: false })
    }
  },

  async fetchDataStores() {
    if (!get().config.project_id) {
      set({ error: 'GCP プロジェクトIDを設定してください' })
      return
    }
    set({ loadingStores: true, error: null })
    try {
      // まず一覧を即座に描画し、そのあと件数付きで置き換える
      const quick = await api.listDataStores(false)
      set({
        dataStores: (quick.dataStores ?? []) as DataStore[],
        loadingStores: false,
        enriching: true,
      })

      const enriched = await api.listDataStores(true)
      set({ dataStores: (enriched.dataStores ?? []) as DataStore[] })
    } catch (e) {
      set({ error: messageOf(e, 'データストアの取得に失敗しました') })
    } finally {
      set({ loadingStores: false, enriching: false })
    }
  },

  async fetchEngines() {
    if (!get().config.project_id) return
    try {
      const data = await api.listEngines()
      set({ engines: (data.engines ?? []) as Engine[] })
    } catch {
      set({ engines: [] })
    }
  },

  async fetchDataStoreDetail(dataStore) {
    set({ error: null })
    try {
      const detail = (await api.getDataStore(dataStore)) as DataStore
      set({ currentDataStore: detail })
      return detail
    } catch (e) {
      set({ error: messageOf(e, 'データストア詳細の取得に失敗しました') })
      return null
    }
  },

  async fetchDocuments(dataStore) {
    set({ loadingDocuments: true, error: null, documents: [] })
    try {
      const all: VertexDocument[] = []
      let pageToken: string | undefined
      do {
        const data = await api.listDocuments(dataStore, pageToken)
        all.push(...((data.documents ?? []) as VertexDocument[]))
        set({ documents: [...all] })
        pageToken = data.nextPageToken as string | undefined
      } while (pageToken)
    } catch (e) {
      set({ error: messageOf(e, 'ドキュメントの取得に失敗しました') })
    } finally {
      set({ loadingDocuments: false })
    }
  },

  async removeDocument(documentName) {
    set({ error: null })
    try {
      await api.deleteDocument(documentName)
      set({ documents: get().documents.filter((d) => d.name !== documentName) })
    } catch (e) {
      set({ error: messageOf(e, 'ドキュメントの削除に失敗しました') })
      throw e
    }
  },

  async bulkRemoveDocuments(documentNames) {
    set({ error: null })
    let failed = 0
    for (const name of documentNames) {
      try {
        await api.deleteDocument(name)
        set({ documents: get().documents.filter((d) => d.name !== name) })
      } catch {
        failed += 1
      }
    }
    if (failed > 0) set({ error: `${failed} 件の削除に失敗しました` })
    return documentNames.length - failed
  },

  async importFromGcs(params) {
    set({ error: null })
    const result = await api.importFromGcs(params)
    return String(result.name ?? '')
  },

  clearError() {
    set({ error: null })
  },
}))
