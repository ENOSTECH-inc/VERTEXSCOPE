import { Moon, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'vertexscope.theme'

function currentIsDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function ThemeToggle() {
  const [dark, setDark] = useState(currentIsDark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
    } catch {
      /* プライベートモードなどで書き込めない場合は諦める */
    }
  }, [dark])

  const toggle = useCallback(() => setDark((v) => !v), [])

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      title={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
    >
      {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  )
}
