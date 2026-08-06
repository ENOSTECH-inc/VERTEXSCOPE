import type { ColumnDef } from '@tanstack/react-table'
import {
  Braces,
  CloudCog,
  Copy,
  Database,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type { DataStore } from '@/api/types'
import { ConnectionModal } from '@/components/ConnectionModal'
import { DataTable } from '@/components/DataTable'
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  JsonBlock,
  Modal,
  Skeleton,
} from '@/components/ui'
import { documentCountToNumber, formatDateTime } from '@/lib/utils'
import { useConnectionStore } from '@/store/connectionStore'
import { toast } from '@/store/toastStore'

interface Row {
  name: string
  id: string
  displayName: string
  documentCount: number | string | null | undefined
  industryVertical: string
  contentConfig: string
  createTime?: string
}

export function DataStoresPage() {
  const navigate = useNavigate()

  const config = useConnectionStore((s) => s.config)
  const authStatus = useConnectionStore((s) => s.authStatus)
  const checkingAuth = useConnectionStore((s) => s.checkingAuth)
  const dataStores = useConnectionStore((s) => s.dataStores)
  const loadingStores = useConnectionStore((s) => s.loadingStores)
  const enriching = useConnectionStore((s) => s.enriching)
  const error = useConnectionStore((s) => s.error)
  const init = useConnectionStore((s) => s.init)
  const checkAuth = useConnectionStore((s) => s.checkAuth)
  const fetchDataStores = useConnectionStore((s) => s.fetchDataStores)

  const [filterText, setFilterText] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [jsonTarget, setJsonTarget] = useState<DataStore | null>(null)

  const configured = !!config.project_id
  const authenticated = authStatus?.authenticated === true
  const ready = configured && authenticated

  useEffect(() => {
    void (async () => {
      await init()
      const state = useConnectionStore.getState()
      if (state.config.project_id && state.authStatus?.authenticated) {
        await state.fetchDataStores()
      }
    })()
  }, [init])

  const rows = useMemo<Row[]>(
    () =>
      dataStores.map((s) => ({
        name: s.name,
        id: s.name.split('/').pop() || s.name,
        displayName: s.displayName || '(名前なし)',
        documentCount: s._documentCount,
        industryVertical: s.industryVertical || '-',
        contentConfig: s.contentConfig || '-',
        createTime: s.createTime,
      })),
    [dataStores],
  )

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.displayName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
    )
  }, [rows, filterText])

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        accessorKey: 'displayName',
        header: '表示名',
        cell: ({ row }) => (
          <Link
            to={`/datastores/${encodeURIComponent(row.original.name)}`}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            {row.original.displayName}
          </Link>
        ),
      },
      {
        accessorKey: 'id',
        header: 'データストアID',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-500">{row.original.id}</span>
        ),
      },
      {
        accessorKey: 'documentCount',
        header: 'ドキュメント数',
        sortingFn: (a, b) =>
          documentCountToNumber(a.original.documentCount) -
          documentCountToNumber(b.original.documentCount),
        cell: ({ row }) => {
          const count = row.original.documentCount
          if (count === undefined) {
            return <Loader2 className="size-3 animate-spin text-slate-400" />
          }
          if (count === null) return <span className="text-xs text-slate-400">-</span>
          return <Badge tone={count === 0 ? 'neutral' : 'brand'}>{count}</Badge>
        },
      },
      {
        accessorKey: 'industryVertical',
        header: '業種',
        cell: ({ row }) => <Badge>{row.original.industryVertical}</Badge>,
      },
      {
        accessorKey: 'contentConfig',
        header: 'コンテンツ構成',
        cell: ({ row }) => (
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {row.original.contentConfig}
          </span>
        ),
      },
      {
        accessorKey: 'createTime',
        header: '作成日時',
        cell: ({ row }) => (
          <span className="text-xs whitespace-nowrap text-slate-600 dark:text-slate-400">
            {formatDateTime(row.original.createTime)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="xs"
              title="JSON詳細"
              aria-label="JSON詳細"
              icon={<Braces className="size-3.5" />}
              onClick={() =>
                setJsonTarget(dataStores.find((s) => s.name === row.original.name) ?? null)
              }
            />
            <Link to={`/datastores/${encodeURIComponent(row.original.name)}`}>
              <Button
                variant="ghost"
                size="xs"
                title="ドキュメント一覧"
                aria-label="ドキュメント一覧"
                icon={<Eye className="size-3.5" />}
              />
            </Link>
            <Button
              variant="ghost"
              size="xs"
              title="このデータストアで検索"
              aria-label="このデータストアで検索"
              icon={<Sparkles className="size-3.5" />}
              onClick={() =>
                navigate(`/search?dataStore=${encodeURIComponent(row.original.name)}`)
              }
            />
          </div>
        ),
      },
    ],
    [dataStores, navigate],
  )

  const recheck = async () => {
    await checkAuth()
    const state = useConnectionStore.getState()
    if (state.config.project_id && state.authStatus?.authenticated) {
      await state.fetchDataStores()
    }
  }

  const jsonText = jsonTarget ? JSON.stringify(jsonTarget, null, 2) : ''

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">データストア</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Vertex AI Search (Discovery Engine) のデータストアを一覧・点検する
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="md"
            loading={loadingStores || enriching}
            disabled={!configured}
            aria-label="再読み込み"
            icon={<RefreshCw className="size-4" />}
            onClick={() => void fetchDataStores()}
          />
          <Button
            variant="soft"
            size="md"
            icon={<CloudCog className="size-4" />}
            onClick={() => setConfigOpen(true)}
          >
            接続設定
          </Button>
        </div>
      </header>

      {!ready && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <h3 className="mb-1 font-semibold">
                {!configured ? '接続先が未設定です' : 'Google 認証が必要です'}
              </h3>
              <p className="mb-2 text-sm text-slate-700 dark:text-slate-300">
                {!configured
                  ? 'Cloud Console のデータストア画面URLを貼り付けると、接続設定を自動入力できます。'
                  : (authStatus?.message ?? '認証情報を取得できませんでした。')}
              </p>
              {configured && (
                <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                  <p className="mb-1">
                    ターミナルで次を実行してから「認証を再確認」を押してください:
                  </p>
                  <pre className="overflow-x-auto rounded border border-amber-200 bg-white/70 px-3 py-2 font-mono dark:border-amber-900 dark:bg-slate-900/60">
                    gcloud auth application-default login --project=
                    {config.project_id || '<PROJECT_ID>'}
                  </pre>
                </div>
              )}
              <div className="flex gap-2">
                <Button icon={<CloudCog className="size-3.5" />} onClick={() => setConfigOpen(true)}>
                  接続設定を開く
                </Button>
                <Button
                  variant="soft"
                  loading={checkingAuth}
                  icon={<RefreshCw className="size-3.5" />}
                  onClick={() => void recheck()}
                >
                  認証を再確認
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {ready && (
        <div className="mb-4 flex items-center gap-4">
          <div className="relative w-72">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="表示名 / ID で絞り込み"
              className="pl-8"
            />
          </div>
          <span className="text-sm text-slate-500">
            {filteredRows.length} / {dataStores.length} 件
          </span>
          {enriching && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Loader2 className="size-3 animate-spin" />
              ドキュメント数を集計中...
            </span>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {loadingStores && dataStores.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : ready && dataStores.length === 0 ? (
        <EmptyState
          icon={<Database className="size-12" />}
          title="データストアがありません"
          description={
            <>
              コレクション <span className="font-mono">{config.collection}</span>{' '}
              にデータストアが見つかりませんでした
            </>
          }
        />
      ) : dataStores.length > 0 ? (
        <DataTable
          columns={columns}
          data={filteredRows}
          getRowId={(row) => row.name}
          initialSorting={[{ id: 'documentCount', desc: true }]}
        />
      ) : null}

      <Modal
        open={!!jsonTarget}
        onClose={() => setJsonTarget(null)}
        title={
          <span className="flex items-center gap-2">
            <Braces className="size-5 text-brand-600" />
            データストア詳細 (JSON)
          </span>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              icon={<Copy className="size-3.5" />}
              onClick={() => {
                void navigator.clipboard.writeText(jsonText)
                toast.success('JSONをコピーしました')
              }}
            >
              コピー
            </Button>
            <Button variant="ghost" onClick={() => setJsonTarget(null)}>
              閉じる
            </Button>
          </div>
        }
      >
        <JsonBlock value={jsonText} className="max-h-[60vh]" />
      </Modal>

      <ConnectionModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  )
}
