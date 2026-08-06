/** Vertex AI Search (Discovery Engine) の接続設定 */
export interface ConnectionConfig {
  project_id: string
  location: string
  collection: string
  credentials_path: string
}

export interface AuthStatus {
  authenticated: boolean
  source: string | null
  message: string | null
  config: ConnectionConfig
}

export interface ParsedConsoleUrl {
  project_id?: string
  location?: string
  collection?: string
  data_store?: string
  engine?: string
}

/** DataStore リソース */
export interface DataStore {
  name: string
  displayName?: string
  industryVertical?: string
  solutionTypes?: string[]
  defaultSchemaId?: string
  contentConfig?: string
  createTime?: string
  /** バックエンドが付与する概算ドキュメント数（集計前は undefined） */
  _documentCount?: number | string | null
  [key: string]: unknown
}

/** Document リソース */
export interface VertexDocument {
  name: string
  id?: string
  schemaId?: string
  parentDocumentId?: string
  structData?: Record<string, unknown>
  derivedStructData?: Record<string, unknown>
  content?: { mimeType?: string, uri?: string }
  [key: string]: unknown
}

export interface Engine {
  name: string
  displayName?: string
  dataStoreIds?: string[]
  solutionType?: string
  createTime?: string
}

/** search レスポンスから抽出した1件 */
export interface SearchHit {
  id: string
  title: string
  link: string
  mimeType?: string
  snippets: string[]
  extractiveAnswers: string[]
  documentName: string
  raw: Record<string, unknown>
}

export interface SearchOutcome {
  hits: SearchHit[]
  summaryText: string
  totalSize: number
  correctedQuery?: string
  nextPageToken?: string
  raw: Record<string, unknown>
}

/** answer レスポンスから抽出した回答 */
export interface AnswerReference {
  title: string
  uri: string
  documentName: string
  content: string
}

export interface AnswerOutcome {
  answerText: string
  state: string
  references: AnswerReference[]
  relatedQuestions: string[]
  sessionName?: string
  raw: Record<string, unknown>
}

export interface DebugTrace {
  endpoint: string
  requestBody: Record<string, unknown>
  responseBody?: Record<string, unknown>
  startedAt: number
  finishedAt?: number
  durationMs?: number
  error?: string
}

export type QueryMode = 'answer' | 'search'

export interface HistoryItem {
  id: string
  mode: QueryMode
  query: string
  dataStore: string
  answer?: AnswerOutcome
  search?: SearchOutcome
  timestamp: number
  trace?: DebugTrace
}

export const LOCATIONS = [
  { label: 'global', value: 'global' },
  { label: 'us', value: 'us' },
  { label: 'eu', value: 'eu' },
] as const

export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  project_id: '',
  location: 'global',
  collection: 'default_collection',
  credentials_path: '',
}
