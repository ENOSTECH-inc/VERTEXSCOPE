import { Database, FolderSearch, History, Search, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Input, Modal } from '@/components/ui'
import { shortName } from '@/lib/utils'
import { useConnectionStore } from '@/store/connectionStore'

interface PaletteItem {
  label: string
  icon: LucideIcon
  to: string
  description?: string
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const dataStores = useConnectionStore((s) => s.dataStores)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const items = useMemo<PaletteItem[]>(
    () => [
      {
        label: 'データストア一覧',
        icon: Database,
        to: '/',
        description: 'Vertex AI Search のデータストアを一覧',
      },
      {
        label: '検索・生成回答',
        icon: Sparkles,
        to: '/search',
        description: 'search / answer を実行',
      },
      {
        label: 'クエリ履歴',
        icon: History,
        to: '/history',
        description: '過去の実行結果とトレース',
      },
      ...dataStores.map((store) => ({
        label: store.displayName || store.name,
        icon: FolderSearch,
        to: `/datastores/${encodeURIComponent(store.name)}`,
        description: shortName(store.name),
      })),
    ],
    [dataStores],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q),
    )
  }, [items, query])

  const go = (item?: PaletteItem) => {
    if (!item) return
    navigate(item.to)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="コマンドパレット">
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go(filtered[0])
            }}
            placeholder="ページ / データストアを検索..."
            className="pl-8"
          />
        </div>

        {filtered.length > 0 ? (
          <div className="max-h-72 overflow-y-auto">
            {filtered.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => go(item)}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Icon className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    {item.description && (
                      <p className="truncate text-xs text-slate-500">{item.description}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          query && <div className="py-6 text-center text-sm text-slate-500">結果が見つかりません</div>
        )}
      </div>
    </Modal>
  )
}
