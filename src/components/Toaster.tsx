import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { useToastStore, type ToastTone } from '@/store/toastStore'
import { cn } from '@/lib/utils'

const TONE_STYLES: Record<ToastTone, { icon: typeof Info, className: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950',
  },
  error: {
    icon: XCircle,
    className: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
  },
  info: {
    icon: Info,
    className: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  },
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-100 flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, className } = TONE_STYLES[t.tone]
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border p-3 shadow-lg',
              className,
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs break-all text-slate-600 dark:text-slate-400">
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="閉じる"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
