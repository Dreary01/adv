import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Plus, Folder, Target, CheckSquare, Trash2, ChevronRight,
  Briefcase, Flag, Users, Layers, Settings
} from 'lucide-react'

const kindIcons: Record<string, any> = { directory: Folder, project: Target, task: CheckSquare }
const kindLabels: Record<string, string> = { directory: 'Директория', project: 'Проект', task: 'Задача' }
const iconOptions = [
  { value: 'briefcase', label: 'Портфель' },
  { value: 'folder', label: 'Папка' },
  { value: 'target', label: 'Цель' },
  { value: 'layers', label: 'Слои' },
  { value: 'check-square', label: 'Задача' },
  { value: 'flag', label: 'Флаг' },
  { value: 'users', label: 'Люди' },
  { value: 'settings', label: 'Настройки' },
]

const defaultForm = {
  name: '', kind: 'task', description: '', color: '#6366F1', icon: 'check-square',
  can_be_root: false, default_duration_days: null as number | null,
  auto_fill_effort: false, add_to_calendar: false, check_uniqueness: false,
}

export default function ObjectTypesPage() {
  const [types, setTypes] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ ...defaultForm })

  const load = () => api.getObjectTypes().then(setTypes).catch(() => {})
  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.createObjectType({
      ...form,
      default_duration_days: form.default_duration_days || null,
    })
    setShowCreate(false)
    setForm({ ...defaultForm })
    load()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Удалить тип объекта?')) return
    await api.deleteObjectType(id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Типы объектов</h1>
          <p className="page-subtitle">Настройка видов объектов дерева проектов</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-6 animate-slide-down">
          <div className="card-body">
            <h3 className="card-header-title mb-4">Новый тип объекта</h3>
            <div className="form-grid mb-4">
              <div>
                <label className="label">Название *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="input" required />
              </div>
              <div>
                <label className="label">Вид</label>
                <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}
                  className="select">
                  <option value="directory">Директория</option>
                  <option value="project">Проект</option>
                  <option value="task">Задача</option>
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="label">Описание</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="textarea" rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label">Иконка</label>
                <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                  className="select">
                  {iconOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Цвет</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
                  <span className="text-sm text-gray-500">{form.color}</span>
                </div>
              </div>
              <div>
                <label className="label">Длительность (дни)</label>
                <input type="number" min="0" value={form.default_duration_days ?? ''}
                  onChange={e => setForm({ ...form, default_duration_days: e.target.value ? Number(e.target.value) : null })}
                  className="input" placeholder="—" />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mb-5">
              <label className="label-inline">
                <input type="checkbox" checked={form.can_be_root} onChange={e => setForm({ ...form, can_be_root: e.target.checked })}
                  className="checkbox" />
                Может быть корневым
              </label>
              <label className="label-inline">
                <input type="checkbox" checked={form.auto_fill_effort} onChange={e => setForm({ ...form, auto_fill_effort: e.target.checked })}
                  className="checkbox" />
                Автозаполнение трудозатрат
              </label>
              <label className="label-inline">
                <input type="checkbox" checked={form.add_to_calendar} onChange={e => setForm({ ...form, add_to_calendar: e.target.checked })}
                  className="checkbox" />
                Добавлять в календарь
              </label>
              <label className="label-inline">
                <input type="checkbox" checked={form.check_uniqueness} onChange={e => setForm({ ...form, check_uniqueness: e.target.checked })}
                  className="checkbox" />
                Проверка уникальности
              </label>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">Создать</button>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Отмена</button>
            </div>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Тип объекта</th>
              <th className="w-36">Вид</th>
              <th className="text-center w-28">Корневой</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {types.map(t => {
              const Icon = kindIcons[t.kind] || CheckSquare
              return (
                <tr key={t.id} className="group">
                  <td>
                    <Link to={`/admin/object-types/${t.id}`} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: t.color || '#6366F1' }}>
                        <Icon size={16} className="text-white" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-900 group-hover:text-primary-600">{t.name}</span>
                        {t.description && <p className="text-xs text-gray-400 truncate max-w-md">{t.description}</p>}
                      </div>
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${t.kind === 'directory' ? 'badge-purple' : t.kind === 'project' ? 'badge-blue' : 'badge-green'}`}>
                      {kindLabels[t.kind] || t.kind}
                    </span>
                  </td>
                  <td className="text-center">
                    {t.can_be_root && <span className="badge badge-green">Да</span>}
                  </td>
                  <td className="text-right">
                    <button onClick={(e) => handleDelete(e, t.id)}
                      className="icon-btn-danger reveal-on-hover">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {types.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-text">Нет типов объектов. Создайте первый.</p>
          </div>
        )}
      </div>
    </div>
  )
}
