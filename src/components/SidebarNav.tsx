import { Database, History, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  icon: LucideIcon
  to: string
  /** 詳細ページも同じ項目をアクティブにするためのプレフィックス */
  alsoMatch?: string
}

const SECTIONS: Array<{ label: string, items: NavItem[] }> = [
  {
    label: 'データストア',
    items: [{ label: '一覧', icon: Database, to: '/', alsoMatch: '/datastores' }],
  },
  {
    label: 'クエリ',
    items: [
      { label: '検索・生成回答', icon: Sparkles, to: '/search' },
      { label: '履歴', icon: History, to: '/history' },
    ],
  },
]

export function SidebarNav() {
  const { pathname } = useLocation()

  const isActive = (item: NavItem) =>
    item.to === '/'
      ? pathname === '/' || (!!item.alsoMatch && pathname.startsWith(item.alsoMatch))
      : pathname.startsWith(item.to)

  return (
    <div className="space-y-1">
      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-2 pt-3 pb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
            {section.label}
          </p>
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                  isActive(item)
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            )
          })}
        </div>
      ))}
    </div>
  )
}
