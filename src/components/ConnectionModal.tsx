import { FolderSearch, ShieldAlert, ShieldCheck, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '@/api/client'
import { DEFAULT_CONNECTION_CONFIG, LOCATIONS, type ConnectionConfig } from '@/api/types'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/store/connectionStore'
import { toast } from '@/store/toastStore'

type AuthMode = 'adc' | 'service_account'

export function ConnectionModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const config = useConnectionStore((s) => s.config)
  const authStatus = useConnectionStore((s) => s.authStatus)
  const checkingAuth = useConnectionStore((s) => s.checkingAuth)
  const saveConfig = useConnectionStore((s) => s.saveConfig)
  const checkAuth = useConnectionStore((s) => s.checkAuth)
  const fetchDataStores = useConnectionStore((s) => s.fetchDataStores)

  const [form, setForm] = useState<ConnectionConfig>(DEFAULT_CONNECTION_CONFIG)
  const [authMode, setAuthMode] = useState<AuthMode>('adc')
  const [consoleUrl, setConsoleUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedDataStore, setParsedDataStore] = useState('')
  const [saving, setSaving] = useState(false)

  // 開くたびに現在の設定を読み直す
  useEffect(() => {
    if (!open) return
    setForm(config)
    setAuthMode(config.credentials_path ? 'service_account' : 'adc')
    setConsoleUrl('')
    setParseError('')
    setParsedDataStore('')
  }, [open, config])

  const update = (patch: Partial<ConnectionConfig>) =>
    setForm((prev) => ({ ...prev, ...patch }))

  const applyConsoleUrl = async () => {
    const url = consoleUrl.trim()
    if (!url) return
    setParsing(true)
    setParseError('')
    try {
      const parsed = await api.parseConsoleUrl(url)
      update({
        ...(parsed.project_id ? { project_id: parsed.project_id } : {}),
        ...(parsed.location ? { location: parsed.location } : {}),
        ...(parsed.collection ? { collection: parsed.collection } : {}),
      })
      setParsedDataStore(parsed.data_store || parsed.engine || '')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'URL を解析できませんでした')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveConfig({
        project_id: form.project_id.trim(),
        location: form.location || 'global',
        collection: form.collection.trim() || 'default_collection',
        credentials_path:
          authMode === 'service_account' ? form.credentials_path.trim() : '',
      })
      if (useConnectionStore.getState().authStatus?.authenticated) {
        toast.success('Vertex AI Search に接続しました')
        onClose()
        await fetchDataStores()
      } else {
        toast.warning(
          '設定は保存しましたが認証できていません',
          useConnectionStore.getState().authStatus?.message ?? undefined,
        )
      }
    } catch (e) {
      toast.error('設定の保存に失敗しました', e instanceof Error ? e.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  const authenticated = authStatus?.authenticated === true

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <FolderSearch className="size-5 text-brand-600" />
          接続設定
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" loading={checkingAuth} onClick={() => void checkAuth()}>
            認証を再確認
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              loading={saving}
              disabled={!form.project_id.trim()}
              onClick={() => void handleSave()}
            >
              保存して接続
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Console URL パースヘルパー */}
        <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Cloud Console の URL から自動入力
          </label>
          <div className="flex gap-2">
            <Input
              value={consoleUrl}
              onChange={(e) => setConsoleUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void applyConsoleUrl()
              }}
              placeholder="https://console.cloud.google.com/gen-app-builder/locations/global/collections/..."
            />
            <Button
              variant="soft"
              loading={parsing}
              disabled={!consoleUrl.trim()}
              icon={<Wand2 className="size-3.5" />}
              onClick={() => void applyConsoleUrl()}
            >
              解析
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            データストアの画面URLを貼り付けると、プロジェクト・ロケーション・コレクションを自動で埋めます。
          </p>
          {parseError && <p className="text-xs text-red-600">{parseError}</p>}
          {parsedDataStore && (
            <p className="text-xs text-brand-600 dark:text-brand-400">
              検出したデータストア: <span className="font-mono">{parsedDataStore}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={<>GCP プロジェクトID <span className="text-red-600">*</span></>}>
            <Input
              value={form.project_id}
              onChange={(e) => update({ project_id: e.target.value })}
              placeholder="my-project-123456"
            />
          </Field>
          <Field label="ロケーション">
            <Select
              value={form.location}
              onChange={(e) => update({ location: e.target.value })}
            >
              {LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="コレクション" className="sm:col-span-2">
            <Input
              value={form.collection}
              onChange={(e) => update({ collection: e.target.value })}
              placeholder="default_collection"
            />
          </Field>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
            認証方法
          </label>
          <div className="space-y-2">
            <div className="flex flex-col gap-1.5">
              {(
                [
                  ['adc', 'Application Default Credentials (gcloud)'],
                  ['service_account', 'サービスアカウントキー (JSON)'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="auth-mode"
                    value={value}
                    checked={authMode === value}
                    onChange={() => setAuthMode(value)}
                    className="size-4 border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {label}
                </label>
              ))}
            </div>

            {authMode === 'service_account' ? (
              <div>
                <Input
                  value={form.credentials_path}
                  onChange={(e) => update({ credentials_path: e.target.value })}
                  placeholder="/path/to/service-account.json"
                />
                <p className="mt-1 text-xs text-slate-500">
                  サーバープロセスから読めるパスを指定してください。Docker
                  で動かす場合はコンテナ内のパスです。
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Application Default Credentials を使用します。未設定の場合は{' '}
                <code className="font-mono">gcloud auth application-default login</code>{' '}
                を実行してください。
              </p>
            )}
          </div>
        </div>

        {authStatus && (
          <div
            className={cn(
              'rounded-lg border p-3 text-sm',
              authenticated
                ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
            )}
          >
            <div className="flex items-center gap-2">
              {authenticated ? (
                <ShieldCheck className="size-4 text-green-600" />
              ) : (
                <ShieldAlert className="size-4 text-amber-600" />
              )}
              <span className="font-medium">{authenticated ? '認証済み' : '未認証'}</span>
              {authStatus.source && (
                <span className="font-mono text-xs text-slate-500">{authStatus.source}</span>
              )}
            </div>
            {authStatus.message && (
              <p className="mt-1 text-xs break-all text-slate-600 dark:text-slate-400">
                {authStatus.message}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
