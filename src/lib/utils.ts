import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function shortName(resourceName: string): string {
  return resourceName.split('/').pop() || resourceName
}

/** `_documentCount` は集計前 undefined / 失敗時 null / `"200+"` のこともある。 */
export function documentCountToNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return -1
  if (typeof v === 'number') return v
  return parseInt(v, 10) || 0
}

export function formatDocumentCount(v: number | string | null | undefined): string {
  if (v === undefined) return '…'
  if (v === null) return '-'
  return String(v)
}
