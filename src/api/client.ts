/**
 * VERTEXSCOPE バックエンド (FastAPI) との通信。
 *
 * 開発時は Vite の proxy が `/api` を localhost:8765 に転送し、
 * 本番ビルドではバックエンドが UI ごと同一オリジンで配信するため、
 * どちらの場合も相対パスのままで動作する。
 */
import type {
  AuthStatus,
  ConnectionConfig,
  ParsedConsoleUrl,
} from './types'

export type Json = Record<string, unknown>

/** FastAPI の `{"detail": "..."}` を読み取り、人が読めるエラーメッセージにする。 */
async function extractErrorMessage(res: Response): Promise<string> {
  const body = await res.text()
  try {
    const parsed = JSON.parse(body) as { detail?: unknown }
    if (typeof parsed.detail === 'string' && parsed.detail) return parsed.detail
    if (parsed.detail) return JSON.stringify(parsed.detail)
  } catch {
    /* JSON でなければ本文をそのまま使う */
  }
  return `API Error ${res.status}: ${body.slice(0, 500)}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (!res.ok) throw new Error(await extractErrorMessage(res))
  return (await res.json()) as T
}

function withQuery(path: string, params?: Record<string, string>): string {
  if (!params) return path
  return `${path}?${new URLSearchParams(params).toString()}`
}

const get = <T>(path: string, params?: Record<string, string>) =>
  request<T>(withQuery(path, params))

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) })

const del = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'DELETE',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

export const api = {
  // ── 接続設定 / 認証 ──
  getConfig: () => get<ConnectionConfig>('/api/config'),

  saveConfig: (config: ConnectionConfig) =>
    post<ConnectionConfig>('/api/config', config),

  parseConsoleUrl: (url: string) =>
    post<ParsedConsoleUrl>('/api/config/parse-url', { url }),

  authStatus: () => get<AuthStatus>('/api/auth/status'),

  // ── データストア ──
  listDataStores: (enrich = false) =>
    get<Json>('/api/datastores', {
      page_size: '100',
      ...(enrich ? { enrich: 'true' } : {}),
    }),

  getDataStore: (dataStore: string) =>
    get<Json>(`/api/datastores/${encodeURI(dataStore)}`),

  listEngines: () => get<Json>('/api/engines', { page_size: '100' }),

  // ── ドキュメント ──
  listDocuments: (dataStore: string, pageToken?: string) =>
    get<Json>('/api/documents', {
      data_store: dataStore,
      page_size: '100',
      ...(pageToken ? { page_token: pageToken } : {}),
    }),

  deleteDocument: (name: string) => del<Json>('/api/documents', { name }),

  importFromGcs: (params: {
    dataStore: string
    gcsUris: string[]
    dataSchema: string
    reconciliationMode: string
  }) =>
    post<Json>('/api/documents/import-gcs', {
      data_store: params.dataStore,
      gcs_uris: params.gcsUris,
      data_schema: params.dataSchema,
      reconciliation_mode: params.reconciliationMode,
    }),

  // ── クエリ ──
  search: (body: Json) => post<Json>('/api/search', body),

  answer: (body: Json) => post<Json>('/api/answer', body),

  /** `<img src>` など fetch 以外で URL が必要な場合に使う。 */
  previewUrl: (uri: string, download = false) =>
    withQuery('/api/preview', { uri, ...(download ? { download: 'true' } : {}) }),
}
