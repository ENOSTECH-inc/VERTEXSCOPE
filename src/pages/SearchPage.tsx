import {
  ArrowUp,
  Copy,
  Eraser,
  FileWarning,
  Files,
  MessageSquareDashed,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import type { QueryMode } from '@/api/types'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  JsonBlock,
  Select,
  Textarea,
} from '@/components/ui'
import { renderMarkdown, stripHtml } from '@/lib/markdown'
import { cn, formatDocumentCount, shortName } from '@/lib/utils'
import { useConnectionStore } from '@/store/connectionStore'
import { useSearchStore } from '@/store/searchStore'
import { toast } from '@/store/toastStore'

export function SearchPage() {
  const [searchParams] = useSearchParams()

  const config = useConnectionStore((s) => s.config)
  const authStatus = useConnectionStore((s) => s.authStatus)
  const dataStores = useConnectionStore((s) => s.dataStores)
  const loadingStores = useConnectionStore((s) => s.loadingStores)
  const init = useConnectionStore((s) => s.init)

  const querying = useSearchStore((s) => s.querying)
  const error = useSearchStore((s) => s.error)
  const currentAnswer = useSearchStore((s) => s.currentAnswer)
  const currentSearch = useSearchStore((s) => s.currentSearch)
  const lastTrace = useSearchStore((s) => s.lastTrace)
  const history = useSearchStore((s) => s.history)
  const sessionName = useSearchStore((s) => s.sessionName)
  const chatMessages = useSearchStore((s) => s.chatMessages)
  const executeChat = useSearchStore((s) => s.executeChat)
  const clearChat = useSearchStore((s) => s.clearChat)
  const executeAnswer = useSearchStore((s) => s.executeAnswer)
  const executeSearch = useSearchStore((s) => s.executeSearch)
  const resetSession = useSearchStore((s) => s.resetSession)
  const clearError = useSearchStore((s) => s.clearError)

  const [selectedDataStore, setSelectedDataStore] = useState('')
  // 既定は「会話」。Standard エディションのデータストアでも動く唯一の生成経路。
  const [mode, setMode] = useState<QueryMode>('chat')
  const [topK, setTopK] = useState(5)
  const [pane, setPane] = useState<'result' | 'debug'>('result')
  const [queryText, setQueryText] = useState('')
  const [preamble, setPreamble] = useState('')
  const [useSession, setUseSession] = useState(true)
  const [relatedQuestions, setRelatedQuestions] = useState(true)
  const [filterExpr, setFilterExpr] = useState('')
  const [pageSize, setPageSize] = useState(10)
  // スニペット・抽出回答・要約は Enterprise エディション限定なので既定はオフ
  const [withSummary, setWithSummary] = useState(false)
  const [withSnippets, setWithSnippets] = useState(false)
  const [withExtractive, setWithExtractive] = useState(false)
  const [servingConfig, setServingConfig] = useState('default_search')

  const ready = !!config.project_id && authStatus?.authenticated === true

  useEffect(() => {
    void (async () => {
      await init()
      const state = useConnectionStore.getState()
      if (state.config.project_id && state.authStatus?.authenticated && state.dataStores.length === 0) {
        await state.fetchDataStores()
      }
      const fromQuery = searchParams.get('dataStore')
      const stores = useConnectionStore.getState().dataStores
      if (fromQuery) setSelectedDataStore(fromQuery)
      else if (stores.length === 1) setSelectedDataStore(stores[0]!.name)
    })()
  }, [init, searchParams])

  useEffect(() => {
    clearError()
  }, [mode, clearError])

  useEffect(() => {
    resetSession()
  }, [selectedDataStore, resetSession])

  const currentDetail = useMemo(
    () => dataStores.find((s) => s.name === selectedDataStore) ?? null,
    [dataStores, selectedDataStore],
  )

  const canExecute = !!queryText.trim() && !!selectedDataStore && ready

  const onSubmit = async () => {
    const text = queryText.trim()
    if (!text || !selectedDataStore) return

    if (mode === 'chat') {
      await executeChat({
        dataStore: selectedDataStore,
        query: text,
        topK,
        filter: filterExpr || undefined,
        servingConfig,
      })
      setQueryText('')
    } else if (mode === 'answer') {
      await executeAnswer({
        dataStore: selectedDataStore,
        query: text,
        preamble: preamble || undefined,
        useSession,
        relatedQuestions,
        servingConfig,
      })
    } else {
      await executeSearch({
        dataStore: selectedDataStore,
        query: text,
        pageSize,
        filter: filterExpr || undefined,
        withSummary,
        withSnippets,
        withExtractive,
        servingConfig,
      })
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-0 flex-col px-2 py-3 md:px-4">
      <header className="mb-5 shrink-0">
        <h1 className="text-3xl font-extrabold">検索・生成回答</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          データストアに対して生成回答 (answer) と検索 (search) を実行
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
        {/* 左カラム: 設定 */}
        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto lg:w-80 xl:w-96">
          <Card title="検索設定">
            <div className="flex flex-col gap-4">
              <Field label="データストア">
                <Select
                  value={selectedDataStore}
                  disabled={loadingStores}
                  onChange={(e) => setSelectedDataStore(e.target.value)}
                >
                  <option value="">データストアを選択...</option>
                  {dataStores.map((s) => {
                    const id = shortName(s.name)
                    const count = s._documentCount
                    const suffix =
                      count === undefined || count === null ? '' : ` · ${count}件`
                    return (
                      <option key={s.name} value={s.name}>
                        {s.displayName ? `${s.displayName} (${id})` : id}
                        {suffix}
                      </option>
                    )
                  })}
                </Select>
              </Field>

              <Field label="実行モード">
                <div className="inline-flex w-full overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
                  {(
                    [
                      ['chat', '会話'],
                      ['search', '検索'],
                      ['answer', 'answer API'],
                    ] as const
                  ).map(([value, label], i) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={cn(
                        'flex-1 px-3 py-1.5 text-xs font-medium transition',
                        i > 0 && 'border-l border-slate-200 dark:border-slate-700',
                        mode === value
                          ? 'bg-brand-600 text-white'
                          : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="サービング構成 (servingConfig)">
                <Input
                  value={servingConfig}
                  onChange={(e) => setServingConfig(e.target.value)}
                  placeholder="default_search"
                />
              </Field>

              {mode === 'chat' ? (
                <>
                  <Field
                    label="参照する資料の数"
                    hint="検索上位の資料を Vertex AI Gemini に読ませます。多いほど文脈は広がりますが遅くなります。"
                  >
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={topK}
                      onChange={(e) => setTopK(Number(e.target.value) || 5)}
                    />
                  </Field>
                  <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800/60">
                    Discovery Engine で検索し、ヒットした資料の実体を Vertex AI Gemini
                    に読ませて回答します。Standard エディションのデータストアでも動きます。
                  </p>
                  {chatMessages.length > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Eraser className="size-3.5" />}
                      onClick={clearChat}
                    >
                      会話をクリア
                    </Button>
                  )}
                </>
              ) : mode === 'answer' ? (
                <>
                  <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    Discovery Engine の answer API は Enterprise エディション + LLM
                    アドオンが有効なアプリでのみ利用できます。
                  </p>
                  <Field label="プリアンブル (任意)">
                    <Textarea
                      rows={3}
                      value={preamble}
                      onChange={(e) => setPreamble(e.target.value)}
                      placeholder="回答スタイルの指示。例: 箇条書きで簡潔に日本語で答えてください。"
                    />
                  </Field>
                  <div className="flex flex-col gap-2">
                    <Checkbox
                      label="会話セッションを継続する"
                      checked={useSession}
                      onChange={setUseSession}
                    />
                    <Checkbox
                      label="関連質問を生成する"
                      checked={relatedQuestions}
                      onChange={setRelatedQuestions}
                    />
                  </div>
                  {sessionName && (
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<RotateCcw className="size-3.5" />}
                      onClick={resetSession}
                    >
                      セッションをリセット
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Field label="フィルター (任意)">
                    <Input
                      value={filterExpr}
                      onChange={(e) => setFilterExpr(e.target.value)}
                      placeholder='例: category: ANY("news")'
                    />
                  </Field>
                  <Field label="取得件数">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value) || 10)}
                    />
                  </Field>
                  <div className="flex flex-col gap-2">
                    <Checkbox
                      label="スニペットを取得する"
                      checked={withSnippets}
                      onChange={setWithSnippets}
                    />
                    <Checkbox
                      label="抽出回答を取得する"
                      checked={withExtractive}
                      onChange={setWithExtractive}
                    />
                    <Checkbox
                      label="要約 (summary) を生成する"
                      checked={withSummary}
                      onChange={setWithSummary}
                    />
                    <p className="text-xs text-slate-500">
                      これら3つは Enterprise エディションのアプリでのみ利用できます。
                      Standard エディションのデータストアではオフのままにしてください。
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>

          {currentDetail && (
            <Card title="接続対象">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="text-slate-500">表示名</div>
                <div className="truncate font-medium" title={currentDetail.displayName}>
                  {currentDetail.displayName || '(名前なし)'}
                </div>
                <div className="text-slate-500">ID</div>
                <div className="truncate font-mono">{shortName(currentDetail.name)}</div>
                <div className="text-slate-500">ドキュメント数</div>
                <div className="font-medium">
                  {formatDocumentCount(currentDetail._documentCount)}
                </div>
                <div className="text-slate-500">業種</div>
                <div className="font-medium">{currentDetail.industryVertical || '-'}</div>
              </div>
              <Link
                to={`/datastores/${encodeURIComponent(currentDetail.name)}`}
                className="mt-3 block"
              >
                <Button variant="soft" size="xs" className="w-full" icon={<Files className="size-3.5" />}>
                  ドキュメント一覧を開く
                </Button>
              </Link>
            </Card>
          )}

          {history.length > 0 && (
            <Card
              title="履歴"
              actions={
                <Link to="/history">
                  <Button variant="ghost" size="xs">
                    すべて見る
                  </Button>
                </Link>
              }
            >
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {history.slice(0, 12).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setQueryText(item.query)}
                    className="w-full truncate rounded px-2 py-1.5 text-left text-xs transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Badge tone={item.mode === 'answer' ? 'brand' : 'neutral'} className="mr-1">
                      {item.mode}
                    </Badge>
                    {item.query}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </aside>

        {/* 右カラム: 結果 */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-2 dark:border-slate-700 dark:bg-slate-950/40">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
              {(['result', 'debug'] as const).map((value, i) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPane(value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium capitalize transition',
                    i > 0 && 'border-l border-slate-200 dark:border-slate-700',
                    pane === value
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            {lastTrace?.durationMs !== undefined && (
              <span className="text-xs text-slate-500">{lastTrace.durationMs} ms</span>
            )}
          </div>

          {pane === 'result' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
                {!ready ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
                      <ShieldAlert className="mx-auto mb-2 size-10 opacity-60" />
                      <p className="mb-1 text-base">Vertex AI Search に未接続です</p>
                      <p className="text-xs">
                        上部バーの「接続設定」からプロジェクトと認証情報を設定してください
                      </p>
                    </div>
                  </div>
                ) : mode === 'chat' ? (
                  chatMessages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="max-w-md text-center text-slate-500 dark:text-slate-400">
                        <MessageSquareDashed className="mx-auto mb-2 size-10 opacity-60" />
                        <p className="mb-1 text-base">資料について質問してみましょう</p>
                        <p className="text-xs">検索でヒットした資料の中身を読んで回答します</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {chatMessages.map((message) =>
                        message.role === 'user' ? (
                          <div key={message.id} className="flex justify-end">
                            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                              {message.text}
                            </div>
                          </div>
                        ) : (
                          <div key={message.id} className="flex justify-start">
                            <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-950/40">
                              <div
                                className="markdown-body"
                                // renderMarkdown 内で DOMPurify によりサニタイズ済み
                                dangerouslySetInnerHTML={{
                                  __html: renderMarkdown(message.text),
                                }}
                              />
                              {message.sources && message.sources.length > 0 && (
                                <details className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-brand-600">
                                    参照した資料 {message.sources.length} 件
                                  </summary>
                                  <ol className="mt-2 space-y-1.5">
                                    {message.sources.map((source, i) => (
                                      <li
                                        key={`${message.id}-src-${i}`}
                                        className="flex items-start gap-2 text-xs"
                                      >
                                        <span className="shrink-0 text-slate-400">[{i + 1}]</span>
                                        <div className="min-w-0">
                                          <p className="truncate" title={source.title}>
                                            {source.title}
                                          </p>
                                          {!source.readable && (
                                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                              <FileWarning className="size-3 shrink-0" />
                                              {source.missing
                                                ? '実体が見つからないため題名のみ参照'
                                                : 'この形式は本文を読めないため題名のみ参照'}
                                            </p>
                                          )}
                                        </div>
                                      </li>
                                    ))}
                                  </ol>
                                </details>
                              )}
                            </div>
                          </div>
                        ),
                      )}
                      {querying && (
                        <div className="flex justify-start">
                          <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40">
                            資料を読んでいます...
                          </div>
                        </div>
                      )}
                    </div>
                  )
                ) : !currentAnswer && !currentSearch ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center text-slate-500 dark:text-slate-400">
                      <MessageSquareDashed className="mx-auto mb-2 size-10 opacity-60" />
                      <p className="mb-1 text-base">クエリを実行してみましょう</p>
                      <p className="text-xs">選択したデータストアの内容に基づいて回答します</p>
                    </div>
                  </div>
                ) : currentAnswer ? (
                  <div className="space-y-4">
                    <Card
                      title="生成回答"
                      actions={
                        <Badge tone={currentAnswer.state === 'SUCCEEDED' ? 'success' : 'warning'}>
                          {currentAnswer.state}
                        </Badge>
                      }
                    >
                      {currentAnswer.answerText ? (
                        <div
                          className="markdown-body"
                          // 生成テキストは renderMarkdown 内で DOMPurify によりサニタイズ済み
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(currentAnswer.answerText),
                          }}
                        />
                      ) : (
                        <p className="text-sm text-slate-500">
                          回答テキストが返りませんでした。データストアに関連情報がないか、
                          クエリが対象外と判定された可能性があります。
                        </p>
                      )}
                    </Card>

                    {currentAnswer.references.length > 0 && (
                      <Card
                        title="参照元"
                        actions={<Badge>{currentAnswer.references.length} 件</Badge>}
                      >
                        <div className="space-y-2">
                          {currentAnswer.references.map((ref, i) => (
                            <div
                              key={`${ref.documentName}-${i}`}
                              className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40"
                            >
                              <p className="truncate text-sm font-medium" title={ref.title}>
                                {ref.title}
                              </p>
                              {ref.uri && (
                                <p
                                  className="mt-0.5 truncate font-mono text-[11px] text-slate-500"
                                  title={ref.uri}
                                >
                                  {ref.uri}
                                </p>
                              )}
                              {ref.content && (
                                <details className="mt-1.5">
                                  <summary className="cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                                    引用箇所を表示
                                  </summary>
                                  <p className="mt-1 max-h-48 overflow-y-auto text-xs whitespace-pre-wrap text-slate-600 dark:text-slate-400">
                                    {ref.content}
                                  </p>
                                </details>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {currentAnswer.relatedQuestions.length > 0 && (
                      <Card title="関連質問">
                        <div className="flex flex-wrap gap-1.5">
                          {currentAnswer.relatedQuestions.map((q, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setQueryText(q)}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                ) : currentSearch ? (
                  <div className="space-y-4">
                    {currentSearch.summaryText && (
                      <Card title="要約">
                        <div
                          className="markdown-body"
                          // 要約は renderMarkdown 内で DOMPurify によりサニタイズ済み
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(currentSearch.summaryText),
                          }}
                        />
                      </Card>
                    )}

                    <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                      <span>
                        ヒット {currentSearch.hits.length} 件 / 全 {currentSearch.totalSize} 件
                      </span>
                      {currentSearch.correctedQuery && (
                        <span>もしかして: {currentSearch.correctedQuery}</span>
                      )}
                    </div>

                    {currentSearch.hits.map((hit) => (
                      <div
                        key={hit.id || hit.documentName}
                        className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold" title={hit.title}>
                            {hit.title}
                          </p>
                          {hit.mimeType && (
                            <Badge className="shrink-0">{hit.mimeType.split('/').pop()}</Badge>
                          )}
                        </div>
                        {hit.link && (
                          <p
                            className="mt-0.5 truncate font-mono text-[11px] text-slate-500"
                            title={hit.link}
                          >
                            {hit.link}
                          </p>
                        )}
                        {hit.extractiveAnswers.map((ans, i) => (
                          <p
                            key={`ea-${i}`}
                            className="mt-2 border-l-2 border-brand-400 pl-2 text-xs text-slate-700 dark:text-slate-300"
                          >
                            {ans}
                          </p>
                        ))}
                        {hit.snippets.map((sn, i) => (
                          <p
                            key={`sn-${i}`}
                            className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
                          >
                            {stripHtml(sn)}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <form
                className="shrink-0 border-t border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                onSubmit={(e) => {
                  e.preventDefault()
                  void onSubmit()
                }}
              >
                <div className="flex items-end gap-2">
                  <textarea
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void onSubmit()
                      }
                    }}
                    rows={2}
                    placeholder={
                      mode === 'search'
                        ? '検索キーワードを入力... (Enter で送信)'
                        : '質問を入力... (Enter で送信 / Shift+Enter で改行)'
                    }
                    className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  />
                  <Button
                    type="submit"
                    loading={querying}
                    disabled={!canExecute}
                    icon={<ArrowUp className="size-3.5" />}
                  >
                    {mode === 'search' ? '検索' : '質問'}
                  </Button>
                </div>
                {error ? (
                  <p className="mt-2 text-xs break-all text-red-600">{error}</p>
                ) : !selectedDataStore ? (
                  <p className="mt-2 text-xs text-slate-500">データストアを選択してください</p>
                ) : null}
              </form>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-6">
              <Card title="接続情報">
                <div className="space-y-1 text-xs">
                  <p>
                    <span className="text-slate-500">Project:</span>{' '}
                    {config.project_id || '(未設定)'}
                  </p>
                  <p>
                    <span className="text-slate-500">Location:</span> {config.location}
                  </p>
                  <p>
                    <span className="text-slate-500">Collection:</span> {config.collection}
                  </p>
                  <p>
                    <span className="text-slate-500">Credentials:</span>{' '}
                    {authStatus?.source || '(なし)'}
                  </p>
                  <p>
                    <span className="text-slate-500">DataStore:</span>{' '}
                    {selectedDataStore || '(未選択)'}
                  </p>
                  <p>
                    <span className="text-slate-500">Session:</span> {sessionName || '(なし)'}
                  </p>
                </div>
              </Card>
              <Card title="Request (raw)">
                <JsonBlock value={lastTrace?.requestBody} className="max-h-72" />
              </Card>
              <Card
                title="Response (raw)"
                actions={
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Copy className="size-3" />}
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        JSON.stringify(lastTrace?.responseBody ?? {}, null, 2),
                      )
                      toast.success('レスポンスをコピーしました')
                    }}
                  >
                    コピー
                  </Button>
                }
              >
                <JsonBlock value={lastTrace?.responseBody} className="max-h-96" />
                {lastTrace?.error && (
                  <p className="mt-2 text-xs break-all text-red-600">{lastTrace.error}</p>
                )}
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
