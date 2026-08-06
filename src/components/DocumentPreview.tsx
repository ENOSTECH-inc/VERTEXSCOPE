import {
  Code,
  Download,
  ExternalLink,
  File as FileIcon,
  FileQuestion,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music,
  TriangleAlert,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { api } from '@/api/client'
import { Badge, Button } from '@/components/ui'

type PreviewKind = 'image' | 'pdf' | 'html' | 'text' | 'video' | 'audio' | 'unsupported'

const TEXT_PREVIEW_LIMIT = 200_000

/** Document に content.mimeType が無い場合の拡張子フォールバック */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  pdf: 'application/pdf',
  html: 'text/html', htm: 'text/html',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json', xml: 'application/xml',
  yaml: 'text/yaml', yml: 'text/yaml', log: 'text/plain', sql: 'text/plain',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
}

const KIND_META: Record<PreviewKind, { label: string, icon: LucideIcon }> = {
  image: { label: '画像プレビュー', icon: ImageIcon },
  pdf: { label: 'PDF プレビュー', icon: FileText },
  html: { label: 'HTML プレビュー', icon: Code },
  text: { label: 'テキストプレビュー', icon: FileText },
  video: { label: '動画プレビュー', icon: Video },
  audio: { label: '音声プレビュー', icon: Music },
  unsupported: { label: 'プレビュー', icon: FileIcon },
}

function detectKind(mimeType: string): PreviewKind {
  const mime = mimeType.toLowerCase()
  if (!mime) return 'unsupported'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  ) {
    return 'text'
  }
  return 'unsupported'
}

export function DocumentPreview({
  uri,
  mimeType,
  fileName,
}: {
  uri?: string
  mimeType?: string
  fileName?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [truncated, setTruncated] = useState(false)

  const displayName = useMemo(() => {
    if (fileName) return fileName
    try {
      return decodeURIComponent((uri || '').split('/').pop() || 'document')
    } catch {
      return (uri || '').split('/').pop() || 'document'
    }
  }, [fileName, uri])

  const resolvedMime = useMemo(() => {
    if (mimeType) return mimeType
    const ext = displayName.split('.').pop()?.toLowerCase() || ''
    return EXTENSION_MIME[ext] || ''
  }, [mimeType, displayName])

  const kind = useMemo(() => detectKind(resolvedMime), [resolvedMime])
  const previewUrl = uri ? api.previewUrl(uri) : ''
  const downloadUrl = uri ? api.previewUrl(uri, true) : ''

  useEffect(() => {
    setError('')
    if (kind !== 'text' || !previewUrl) return

    let cancelled = false
    setLoading(true)
    setText('')
    setTruncated(false)

    void (async () => {
      try {
        const res = await fetch(previewUrl)
        if (!res.ok) {
          throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
        }
        const body = await res.text()
        if (cancelled) return
        setTruncated(body.length > TEXT_PREVIEW_LIMIT)
        setText(body.slice(0, TEXT_PREVIEW_LIMIT))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'テキストの取得に失敗しました')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [kind, previewUrl])

  const onMediaError = () =>
    setError('ファイルの読み込みに失敗しました。権限または URI を確認してください。')

  const { label, icon: KindIcon } = KIND_META[kind]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <KindIcon className="size-4 shrink-0 text-brand-600" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
          {resolvedMime && (
            <Badge tone="neutral" className="max-w-56 truncate">
              {resolvedMime}
            </Badge>
          )}
        </div>
        {previewUrl && (
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="別タブで開く"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ExternalLink className="size-3.5" />
            </a>
            <a
              href={downloadUrl}
              title="ダウンロード"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Download className="size-3.5" />
            </a>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
        {!uri ? (
          <div className="p-6 text-center text-slate-400">
            <FileQuestion className="mx-auto mb-2 size-10 opacity-60" />
            <p className="text-sm">このドキュメントには参照可能な URI がありません</p>
          </div>
        ) : loading ? (
          <div className="p-6 text-center text-slate-400">
            <Loader2 className="mx-auto size-8 animate-spin text-brand-600" />
            <p className="mt-2 text-xs">読み込み中...</p>
          </div>
        ) : error ? (
          <div className="max-w-sm p-6 text-center text-slate-500">
            <TriangleAlert className="mx-auto mb-2 size-10 text-amber-500" />
            <p className="mb-1 text-sm font-medium">プレビューを取得できませんでした</p>
            <p className="text-xs break-all text-slate-500">{error}</p>
          </div>
        ) : kind === 'image' ? (
          <img
            src={previewUrl}
            alt={displayName}
            className="max-h-full max-w-full object-contain"
            onError={onMediaError}
          />
        ) : kind === 'pdf' ? (
          <iframe src={previewUrl} title={displayName} className="h-full w-full border-0 bg-white" />
        ) : kind === 'html' ? (
          // 外部由来の HTML なのでスクリプトを完全に無効化して描画する
          <iframe
            src={previewUrl}
            title={displayName}
            sandbox=""
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-white"
          />
        ) : kind === 'video' ? (
          <video src={previewUrl} controls className="max-h-full max-w-full" onError={onMediaError} />
        ) : kind === 'audio' ? (
          <audio src={previewUrl} controls className="w-full px-4" onError={onMediaError} />
        ) : kind === 'text' ? (
          <div className="h-full w-full overflow-auto">
            <pre className="p-4 font-mono text-xs break-all whitespace-pre-wrap">{text}</pre>
            {truncated && (
              <p className="px-4 pb-4 text-xs text-slate-500">
                （先頭 {TEXT_PREVIEW_LIMIT.toLocaleString()} 文字のみ表示しています）
              </p>
            )}
          </div>
        ) : (
          <div className="max-w-sm p-6 text-center text-slate-500">
            <FileIcon className="mx-auto mb-2 size-10 opacity-60" />
            <p className="mb-1 text-sm font-medium">このファイル形式はプレビューに対応していません</p>
            <p className="mb-3 text-xs break-all text-slate-500">{resolvedMime || '不明な形式'}</p>
            <a href={downloadUrl}>
              <Button size="xs" icon={<Download className="size-3.5" />}>
                ダウンロードして開く
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
