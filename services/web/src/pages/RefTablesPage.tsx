import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Plus, Trash2, Database } from 'lucide-react'

const structureLabels: Record<string, string> = { flat: 'Плоский список', hierarchical: 'Иерархическая', vertical: 'Вертикальный список' }
const inputModeLabels: Record<string, string> = { inline: 'Строка ввода', modal: 'Всплывающее окно' }

export default function RefTablesPage() {
  const [tables, setTables] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '', description: '', structure: 'hierarchical', input_mode: 'modal',
    use_date: false, has_approval: false, show_on_main_page: false,
  })

  const load = () => api.getRefTables().then(setTables).catch(() => {})
  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.createRefTable(form)
    setShowCreate(false)
    setForm({ name: '', description: '', structure: 'hierarchical', input_mode: 'modal', use_date: false, has_approval: false, show_on_main_page: false })
    load()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Удалить справочник?')) return
    await api.deleteRefTable(id); load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Справочники</h1>
          <p className="page-subtitle">Настройка справочных таблиц</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
          <Plus size={16} /> Добавить
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="card mb-6">
          <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
            {/* Left panel — General properties */}
            <div className="card-body">
              <h3 className="form-section-title">Общие свойства справочника</h3>
              <div className="form-section">
                <table className="w-full">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2 pr-4 w-2/5"><label className="label">Название</label></td>
                      <td className="py-2"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        className="input" required /></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 align-top"><label className="label">Описание</label></td>
                      <td className="py-2"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                        className="textarea" rows={3} /></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Использовать дату</label></td>
                      <td className="py-2">
                        <select value={form.use_date ? 'yes' : 'no'} onChange={e => setForm({ ...form, use_date: e.target.value === 'yes' })}
                          className="select">
                          <option value="no">Нет</option>
                          <option value="yes">Да</option>
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Использовать процедуру утверждения</label></td>
                      <td className="py-2"><input type="checkbox" checked={form.has_approval} onChange={e => setForm({ ...form, has_approval: e.target.checked })}
                        className="checkbox" /></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Связать с объектным справочником</label></td>
                      <td className="py-2"><input type="checkbox" disabled className="checkbox" /></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Добавить разрез по ресурсам</label></td>
                      <td className="py-2"><input type="checkbox" disabled className="checkbox" /></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Иконка закладки</label></td>
                      <td className="py-2"><span className="text-link cursor-pointer">установить иконку</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right panel — Structure */}
            <div className="card-body">
              <h3 className="form-section-title">Структура справочника</h3>
              <div className="form-section">
                <table className="w-full">
                  <tbody className="divide-y divide-gray-100">
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Структура записей справочника</label></td>
                      <td className="py-2">
                        <select value={form.structure} onChange={e => setForm({ ...form, structure: e.target.value })}
                          className="select">
                          <option value="hierarchical">Иерархическая</option>
                          <option value="flat">Плоский список</option>
                          <option value="vertical">Вертикальный список</option>
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Место отображения списка записей</label></td>
                      <td className="py-2">
                        <select value={form.show_on_main_page ? 'main' : 'tab'}
                          onChange={e => setForm({ ...form, show_on_main_page: e.target.value === 'main' })}
                          className="select">
                          <option value="tab">На закладке справочника</option>
                          <option value="main">На Главной проекта</option>
                        </select>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><label className="label">Форма ввода записи</label></td>
                      <td className="py-2">
                        <select value={form.input_mode} onChange={e => setForm({ ...form, input_mode: e.target.value })}
                          className="select">
                          <option value="modal">Всплывающее окно</option>
                          <option value="inline">Строка ввода</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card-footer form-actions">
            <button type="submit" className="btn-primary btn-sm">Сохранить</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost btn-sm">отмена</button>
          </div>
        </form>
      )}

      {/* Table list */}
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Справочник</th>
              <th className="w-40">Структура</th>
              <th className="w-40">Форма ввода</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {tables.map(t => (
              <tr key={t.id}>
                <td>
                  <Link to={`/admin/ref-tables/${t.id}`} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Database size={16} className="text-amber-600" />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900 group-hover:text-primary-600">{t.name}</span>
                      {t.description && <p className="text-xs text-gray-400 truncate max-w-md">{t.description}</p>}
                    </div>
                  </Link>
                </td>
                <td>{structureLabels[t.structure] || t.structure}</td>
                <td>{inputModeLabels[t.input_mode] || t.input_mode}</td>
                <td className="text-right">
                  <button onClick={(e) => handleDelete(e, t.id)} className="icon-btn-danger reveal-on-hover">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tables.length === 0 && (
          <div className="empty-state">
            <p className="empty-state-text">Нет справочников. Создайте первый.</p>
          </div>
        )}
      </div>
    </div>
  )
}
