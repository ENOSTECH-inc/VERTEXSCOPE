import { Command, ScanSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { CommandPalette } from '@/components/CommandPalette'
import { ConnectionBar } from '@/components/ConnectionBar'
import { SidebarNav } from '@/components/SidebarNav'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Toaster } from '@/components/Toaster'

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800">
        <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <ScanSearch className="size-5 text-brand-600" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide">
            VERTEXSCOPE
          </span>
          <ThemeToggle />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarNav />
        </nav>

        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-1 text-left text-xs text-slate-400 transition-colors hover:text-brand-600"
          >
            <Command className="size-3" />
            コマンドパレット
            <kbd className="ml-1 font-mono">⌘K</kbd>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  )
}
