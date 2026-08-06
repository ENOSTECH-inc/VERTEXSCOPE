import { AlertTriangle, CloudCog, Pencil, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge, Button } from '@/components/ui'
import { ConnectionModal } from '@/components/ConnectionModal'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/store/connectionStore'

export function ConnectionBar() {
  const config = useConnectionStore((s) => s.config)
  const authStatus = useConnectionStore((s) => s.authStatus)
  const checkingAuth = useConnectionStore((s) => s.checkingAuth)
  const init = useConnectionStore((s) => s.init)
  const checkAuth = useConnectionStore((s) => s.checkAuth)

  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  const configured = !!config.project_id
  const authenticated = authStatus?.authenticated === true

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 px-6 text-sm dark:border-slate-800">
      <span className="shrink-0 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
        接続先
      </span>

      {!configured ? (
        <>
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          <span className="font-medium text-amber-700 dark:text-amber-400">
            プロジェクト未設定
          </span>
          <Button
            size="xs"
            icon={<CloudCog className="size-3.5" />}
            onClick={() => setModalOpen(true)}
          >
            接続設定
          </Button>
        </>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                authenticated ? 'bg-green-500' : 'bg-amber-500',
              )}
            />
            <span className="truncate font-mono">{config.project_id}</span>
            <span className="text-slate-400">/</span>
            <span className="font-mono">{config.location}</span>
            <span className="text-slate-400">/</span>
            <span className="truncate font-mono">{config.collection}</span>
          </span>

          {!authenticated && <Badge tone="warning">未認証</Badge>}

          <Button
            variant="ghost"
            size="xs"
            icon={<Pencil className="size-3.5" />}
            onClick={() => setModalOpen(true)}
          >
            変更
          </Button>
          <Button
            variant="ghost"
            size="xs"
            loading={checkingAuth}
            title="認証を再確認"
            aria-label="認証を再確認"
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void checkAuth()}
          />
        </>
      )}

      {!authenticated && authStatus?.message && (
        <span
          className="truncate text-xs text-amber-600 dark:text-amber-400"
          title={authStatus.message}
        >
          {authStatus.message}
        </span>
      )}

      <ConnectionModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
