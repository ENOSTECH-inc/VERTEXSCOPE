import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import {
  Braces,
  ChevronRight,
  Copy,
  FileText,
  FileX,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { asRecord, asString } from '@/api/parse'
import type { DataStore, VertexDocument } from '@/api/types'
import { DataTable } from '@/components/DataTable'
import { DocumentPreview } from '@/components/DocumentPreview'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  JsonBlock,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui'
import { shortName } from '@/lib/utils'
import { useConnectionStore } from '@/store/connectionStore'
import { toast } from '@/store/toastStore'

interface Row {
  name: string
  id: string
  title: string
  uri: string
  mimeType: string
}

const DATA_SCHEMAS = [
  { value: 'content', label: 'content (非構造化ファイル)' },
  { value: 'document', label: 'document (JSON)' },
  { value: 'csv', label: 'csv' },
  { value: 'custom', label: 'custom' },
]

const RECONCILIATION_MODES = [
  { value: 'INCREMENTAL', label: 'INCREMENTAL (追加/更新)' },
  { value: 'FULL', label: 'FULL (完全置換)' },
]

function toRow(doc: VertexDocument): Row {
  const derived = asRecord(doc.derivedStructData)
  const struct = asRecord(doc.structData)
  const id = doc.id || doc.name.split('/').pop() || doc.name
  return {
    name: doc.name,
    id,
    title: asString(derived.title) || asString(struct.title) || id,
    uri: doc.content?.uri || asString(derived.link) || asString(struct.uri) || '',
    mimeType: doc.content?.mimeType || asString(derived.mime_type) || '',
  }
}

export function DataStoreDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const documents = useConnectionStore((s) => s.documents)
  const loadingDocuments = useConnectionStore((s) => s.loadingDocuments)
  const error = useConnectionStore((s) => s.error)
  const init = useConnectionStore((s) => s.init)
  const fetchDataStoreDetail = useConnectionStore((s) => s.fetchDataStoreDetail)
  const fetchDocuments = useConnectionStore((s) => s.fetchDocuments)
  const removeDocument = useConnectionStore((s) => s.removeDocument)
  const bulkRemoveDocuments = useConnectionStore((s) => s.bulkRemoveDocuments)
  const importFromGcs = useConnectionStore((s) => s.importFromGcs)

  const dataStoreName = useMemo(() => decodeURIComponent(id ?? ''), [id])
  const dataStoreId = shortName(dataStoreName)

  const [detail, setDetail] = useState<DataStore | null>(null)
  const [filterText, setFilterText] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [detailTarget, setDetailTarget] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importOperation, setImportOperation] = useState('')
  const [gcsUrisText, setGcsUrisText] = useState('')
  const [dataSchema, setDataSchema] = useState('content')
  const [reconciliationMode, setReconciliationMode] = useState('INCREMENTAL')

  const reload = useCallback(async () => {
    setRowSelection({})
    const [d] = await Promise.all([
      fetchDataStoreDetail(dataStoreName),
      fetchDocuments(dataStoreName),
    ])
    setDetail(d)
  }, [dataStoreName, fetchDataStoreDetail, fetchDocuments])

  useEffect(() => {
    void (async () => {
      await init()
      await reload()
    })()
  }, [init, reload])

  const rows = useMemo(() => documents.map(toRow), [documents])

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.uri.toLowerCase().includes(q),
    )
  }, [rows, filterText])

  const selectedNames = useMemo(
    () => Object.keys(rowSelection).filter((name) => rowSelection[name]),
    [rowSelection],
  )
  const selectedRows = useMemo(
    () => rows.filter((r) => selectedNames.includes(r.name)),
    [rows, selectedNames],
  )

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="すべて選択"
            className="size-4 rounded border-slate-300 text-brand-600"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected()
            }}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label="この行を選択"
            className="size-4 rounded border-slate-300 text-brand-600"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
          />
        ),
      },
      {
        accessorKey: 'title',
        header: 'タイトル',
        cell: ({ row }) => (
          <button
            type="button"
            title={row.original.title}
            className="max-w-md truncate text-left font-medium text-brand-600 hover:underline dark:text-brand-400"
            onClick={() => setDetailTarget(row.original.name)}
          >
            {row.original.title}
          </button>
        ),
      },
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span
            className="inline-block max-w-64 truncate align-bottom font-mono text-xs text-slate-500"
            title={row.original.id}
          >
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: 'uri',
        header: 'URI',
        cell: ({ row }) => (
          <span
            className="inline-block max-w-88 truncate align-bottom font-mono text-xs text-slate-600 dark:text-slate-400"
            title={row.original.uri}
          >
            {row.original.uri || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'mimeType',
        header: 'MIME',
        cell: ({ row }) =>
          row.original.mimeType ? (
            <Badge>{row.original.mimeType.split('/').pop()}</Badge>
          ) : (
            <span className="text-xs text-slate-400">-</span>
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
              title="詳細とプレビュー"
              aria-label="詳細とプレビュー"
              icon={<Braces className="size-3.5" />}
              onClick={() => setDetailTarget(row.original.name)}
            />
            <Button
              variant="ghost"
              size="xs"
              title="削除"
              aria-label="削除"
              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setDeleteTarget(row.original)}
            />
          </div>
        ),
      },
    ],
    [],
  )

  const detailDoc = useMemo(() => {
    const doc = documents.find((d) => d.name === detailTarget)
    return doc ? { row: toRow(doc), raw: doc } : null
  }, [documents, detailTarget])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await removeDocument(deleteTarget.name)
      toast.success('ドキュメントを削除しました')
      setDeleteTarget(null)
    } catch (e) {
      toast.error('削除に失敗しました', e instanceof Error ? e.message : undefined)
    } finally {
      setDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    setDeleting(true)
    const deleted = await bulkRemoveDocuments(selectedNames)
    setDeleting(false)
    const err = useConnectionStore.getState().error
    if (err) toast.warning('一部の削除に失敗しました', err)
    else toast.success(`${deleted} 件を削除しました`)
    setRowSelection({})
    setBulkDeleteOpen(false)
  }

  const gcsUris = useMemo(
    () => gcsUrisText.split('\n').map((s) => s.trim()).filter(Boolean),
    [gcsUrisText],
  )

  const handleImport = async () => {
    setImporting(true)
    setImportOperation('')
    try {
      const operation = await importFromGcs({
        dataStore: dataStoreName,
        gcsUris,
        dataSchema,
        reconciliationMode,
      })
      setImportOperation(operation)
      toast.success('取り込みを開始しました')
    } catch (e) {
      toast.error('取り込みの開始に失敗しました', e instanceof Error ? e.message : undefined)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-sm text-slate-500">
        <Link to="/" className="hover:text-brand-600">
          データストア
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate text-slate-700 dark:text-slate-300">
          {detail?.displayName || dataStoreId}
        </span>
      </nav>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-extrabold">
            {detail?.displayName || dataStoreId}
          </h1>
          <p className="mt-1 font-mono text-xs break-all text-slate-500">{dataStoreName}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="md"
            loading={loadingDocuments}
            aria-label="再読み込み"
            icon={<RefreshCw className="size-4" />}
            onClick={() => void reload()}
          />
          <Button
            variant="soft"
            size="md"
            icon={<Sparkles className="size-4" />}
            onClick={() =>
              navigate(`/search?dataStore=${encodeURIComponent(dataStoreName)}`)
            }
          >
            このストアで検索
          </Button>
          <Button
            size="md"
            icon={<Upload className="size-4" />}
            onClick={() => setImportOpen(true)}
          >
            GCSから取り込み
          </Button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card bodyClassName="p-4">
          <p className="mb-1 text-xs text-slate-500">ドキュメント数</p>
          <p className="text-2xl font-bold">{documents.length}</p>
        </Card>
        <Card bodyClassName="p-4">
          <p className="mb-1 text-xs text-slate-500">業種</p>
          <p className="text-sm font-medium">{detail?.industryVertical || '-'}</p>
        </Card>
        <Card bodyClassName="p-4">
          <p className="mb-1 text-xs text-slate-500">コンテンツ構成</p>
          <p className="text-sm font-medium">{detail?.contentConfig || '-'}</p>
        </Card>
        <Card bodyClassName="p-4">
          <p className="mb-1 text-xs text-slate-500">スキーマ</p>
          <p className="font-mono text-sm font-medium">{detail?.defaultSchemaId || '-'}</p>
        </Card>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative w-80">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="タイトル / ID / URI で絞り込み"
              className="pl-8"
            />
          </div>
          <span className="shrink-0 text-sm text-slate-500">
            {filteredRows.length} / {documents.length} 件
          </span>
        </div>
        {selectedNames.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm font-medium">{selectedNames.length} 件選択中</span>
            <Button
              variant="danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setBulkDeleteOpen(true)}
            >
              一括削除
            </Button>
            <Button variant="ghost" onClick={() => setRowSelection({})}>
              選択解除
            </Button>
          </div>
        )}
      </div>

      {loadingDocuments && documents.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon={<FileX className="size-12" />}
          title="ドキュメントがありません"
          description="このデータストアの default_branch にドキュメントは登録されていません"
        />
      ) : (
        <DataTable
          columns={columns}
          data={filteredRows}
          pageSize={20}
          getRowId={(row) => row.name}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          initialSorting={[{ id: 'title', desc: false }]}
        />
      )}

      {/* 詳細: 左=メタデータ / 右=ファイルプレビュー */}
      <Modal
        open={!!detailDoc}
        onClose={() => setDetailTarget(null)}
        size="xl"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="size-5 shrink-0 text-brand-600" />
            <span className="truncate">{detailDoc?.row.title || 'ドキュメント詳細'}</span>
          </span>
        }
      >
        {detailDoc && (
          <div className="grid h-[70vh] min-h-0 grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500">ドキュメントID</span>
                  <p className="font-mono break-all">{detailDoc.row.id}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">MIME</span>
                  <p className="font-mono break-all">{detailDoc.row.mimeType || '-'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500">URI</span>
                  <p className="font-mono text-xs break-all">{detailDoc.row.uri || '-'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500">リソース名</span>
                  <p className="font-mono text-xs break-all">{detailDoc.row.name}</p>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Raw API Response</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Copy className="size-3" />}
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        JSON.stringify(detailDoc.raw, null, 2),
                      )
                      toast.success('JSONをコピーしました')
                    }}
                  >
                    コピー
                  </Button>
                </div>
                <JsonBlock value={detailDoc.raw} className="max-h-96" />
              </div>
            </div>

            <DocumentPreview
              key={detailDoc.row.name}
              uri={detailDoc.row.uri}
              mimeType={detailDoc.row.mimeType}
              fileName={detailDoc.row.title}
            />
          </div>
        )}
      </Modal>

      {/* 単体削除 */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ドキュメントの削除"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void handleDelete()}>
              削除
            </Button>
          </div>
        }
      >
        <p className="text-slate-700 dark:text-slate-300">
          <strong>{deleteTarget?.title}</strong> を削除しますか？この操作は取り消せません。
        </p>
      </Modal>

      {/* 一括削除 */}
      <Modal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title={<span className="text-red-600">ドキュメントの一括削除</span>}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBulkDeleteOpen(false)}>
              キャンセル
            </Button>
            <Button variant="danger" loading={deleting} onClick={() => void handleBulkDelete()}>
              {selectedNames.length} 件を削除
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-slate-700 dark:text-slate-300">
            <strong>{selectedNames.length} 件</strong>
            のドキュメントを削除しますか？この操作は取り消せません。
          </p>
          <div className="max-h-40 space-y-1 overflow-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
            {selectedRows.map((row) => (
              <p
                key={row.name}
                className="truncate font-mono text-xs text-slate-600 dark:text-slate-400"
              >
                {row.title}
              </p>
            ))}
          </div>
        </div>
      </Modal>

      {/* GCS 取り込み */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Upload className="size-5 text-brand-600" />
            Cloud Storage から取り込み
          </span>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              閉じる
            </Button>
            <Button
              loading={importing}
              disabled={gcsUris.length === 0}
              onClick={() => void handleImport()}
            >
              取り込みを開始
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="GCS URI (1行に1つ)">
            <Textarea
              rows={4}
              value={gcsUrisText}
              onChange={(e) => setGcsUrisText(e.target.value)}
              placeholder="gs://my-bucket/docs/*.pdf"
              className="font-mono"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="データスキーマ">
              <Select value={dataSchema} onChange={(e) => setDataSchema(e.target.value)}>
                {DATA_SCHEMAS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="取り込みモード">
              <Select
                value={reconciliationMode}
                onChange={(e) => setReconciliationMode(e.target.value)}
              >
                {RECONCILIATION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            取り込みは長時間実行オペレーションです。開始後の進捗は Cloud Console
            側でも確認できます。
          </p>
          {importOperation && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-1 text-xs text-slate-500">Operation</p>
              <p className="font-mono text-xs break-all">{importOperation}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
