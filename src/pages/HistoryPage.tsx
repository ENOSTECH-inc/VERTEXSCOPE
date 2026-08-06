import { History, Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Button, Card, EmptyState, JsonBlock } from '@/components/ui'
import { shortName } from '@/lib/utils'
import { useSearchStore } from '@/store/searchStore'

export function HistoryPage() {
  const history = useSearchStore((s) => s.history)
  const clearHistory = useSearchStore((s) => s.clearHistory)

  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">クエリ履歴</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            このセッションで実行した search / answer の結果とトレース
          </p>
        </div>
        {history.length > 0 && (
          <Button variant="soft" icon={<Trash2 className="size-3.5" />} onClick={clearHistory}>
            履歴をクリア
          </Button>
        )}
      </header>

      {history.length === 0 ? (
        <EmptyState
          icon={<History className="size-12" />}
          title="履歴がありません"
          description="検索・生成回答を実行すると、ここに結果が残ります"
          action={
            <Link to="/search">
              <Button icon={<Sparkles className="size-3.5" />}>検索・生成回答へ</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <Card
              key={item.id}
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <Badge tone={item.mode === 'answer' ? 'brand' : 'neutral'}>{item.mode}</Badge>
                  <span className="truncate font-medium" title={item.query}>
                    {item.query}
                  </span>
                </span>
              }
              actions={
                <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                  <span>{item.trace?.durationMs ?? '-'} ms</span>
                  <span>{new Date(item.timestamp).toLocaleString('ja-JP')}</span>
                </div>
              }
            >
              <div className="space-y-2 text-sm">
                <p className="truncate font-mono text-xs text-slate-500" title={item.dataStore}>
                  {shortName(item.dataStore)}
                </p>

                {item.trace?.error ? (
                  <p className="text-xs break-all text-red-600">{item.trace.error}</p>
                ) : item.mode === 'answer' ? (
                  <p className="line-clamp-3 text-slate-700 dark:text-slate-300">
                    {item.answer?.answerText || '(回答テキストなし)'}
                  </p>
                ) : (
                  <p className="text-slate-700 dark:text-slate-300">
                    ヒット {item.search?.hits.length ?? 0} 件 / 全{' '}
                    {item.search?.totalSize ?? 0} 件
                  </p>
                )}

                <details>
                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-brand-600">
                    リクエスト / レスポンスを表示
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Request</p>
                      <JsonBlock value={item.trace?.requestBody} className="max-h-60" />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">Response</p>
                      <JsonBlock value={item.trace?.responseBody} className="max-h-60" />
                    </div>
                  </div>
                </details>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
