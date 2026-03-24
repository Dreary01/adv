import { useState, useEffect } from 'react'
import { Save, Check, HardDrive, Cloud, ArrowRightLeft, Loader2 } from 'lucide-react'
import { api } from '../lib/api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => {})
  }, [])

  const storageType = settings['storage.type'] || 'local'
  const localPath = settings['storage.local.path'] || '/uploads'
  const s3Bucket = settings['storage.s3.bucket'] || ''
  const s3Region = settings['storage.s3.region'] || ''
  const s3Endpoint = settings['storage.s3.endpoint'] || ''
  const s3AccessKey = settings['storage.s3.access_key'] || ''
  const s3SecretKey = settings['storage.s3.secret_key'] || ''

  const update = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  return (
    <div className="page space-y-5">
      <div>
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Системные параметры платформы</p>
      </div>

      {/* Storage settings */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Хранилище документов</h2>
          <p className="text-xs text-gray-400 mt-0.5">Активным может быть только одно хранилище</p>
        </div>

        <div className="p-5 space-y-5">
          {/* Storage type selector */}
          <div className="flex gap-3">
            <button onClick={() => update('storage.type', 'local')}
              className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                storageType === 'local' ? 'border-primary-500 bg-primary-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <HardDrive size={20} className={storageType === 'local' ? 'text-primary-600' : 'text-gray-400'} />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Локальное хранилище</p>
                <p className="text-xs text-gray-400">Файлы на сервере</p>
              </div>
              {storageType === 'local' && <Check size={16} className="text-primary-600 ml-auto" />}
            </button>

            <button onClick={() => update('storage.type', 's3')}
              className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                storageType === 's3' ? 'border-primary-500 bg-primary-50/50' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <Cloud size={20} className={storageType === 's3' ? 'text-primary-600' : 'text-gray-400'} />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">S3-совместимое</p>
                <p className="text-xs text-gray-400">AWS S3, MinIO, и др.</p>
              </div>
              {storageType === 's3' && <Check size={16} className="text-primary-600 ml-auto" />}
            </button>
          </div>

          {/* Local storage config */}
          {storageType === 'local' && (
            <div>
              <label className="label">Путь на сервере</label>
              <input value={localPath} onChange={e => update('storage.local.path', e.target.value)}
                className="input input-sm max-w-md" placeholder="/uploads" />
            </div>
          )}

          {/* S3 storage config */}
          {storageType === 's3' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bucket</label>
                  <input value={s3Bucket} onChange={e => update('storage.s3.bucket', e.target.value)}
                    className="input input-sm" placeholder="adv-documents" />
                </div>
                <div>
                  <label className="label">Region</label>
                  <input value={s3Region} onChange={e => update('storage.s3.region', e.target.value)}
                    className="input input-sm" placeholder="us-east-1" />
                </div>
              </div>
              <div>
                <label className="label">Endpoint (для MinIO и других S3-совместимых)</label>
                <input value={s3Endpoint} onChange={e => update('storage.s3.endpoint', e.target.value)}
                  className="input input-sm" placeholder="https://s3.amazonaws.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Access Key</label>
                  <input value={s3AccessKey} onChange={e => update('storage.s3.access_key', e.target.value)}
                    className="input input-sm" placeholder="AKIA..." />
                </div>
                <div>
                  <label className="label">Secret Key</label>
                  <input type="password" value={s3SecretKey} onChange={e => update('storage.s3.secret_key', e.target.value)}
                    className="input input-sm" placeholder="••••••••" />
                </div>
              </div>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className={`btn-primary btn-sm flex items-center gap-1.5 ${saved ? 'bg-green-600 hover:bg-green-700' : ''}`}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? 'Сохранено' : 'Сохранить'}
            </button>

            <button className="btn-ghost btn-sm flex items-center gap-1.5" title="Миграция документов между хранилищами (скоро)">
              <ArrowRightLeft size={14} />
              Мигрировать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
