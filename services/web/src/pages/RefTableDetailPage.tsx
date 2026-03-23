import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useRef } from 'react'
import { ArrowLeft, Plus, X, Pencil, Save, Database, Trash2, GripVertical } from 'lucide-react'

const UNIVERSAL_AGGREGATIONS: { value: string; label: string }[] = [
  { value: '', label: 'Пусто' },
  { value: 'count_empty', label: 'Пустые' },
  { value: 'count_filled', label: 'Заполненные' },
  { value: 'count_unique', label: 'Уникальные' },
  { value: 'pct_empty', label: '% пустых' },
  { value: 'pct_filled', label: '% заполненных' },
  { value: 'pct_unique', label: '% уникальных' },
]

const NUMERIC_AGGREGATIONS: { value: string; label: string }[] = [
  { value: '', label: 'Пусто' },
  { value: 'sum', label: 'Сумма' },
  { value: 'min', label: 'Минимум' },
  { value: 'max', label: 'Максимум' },
  { value: 'avg', label: 'Среднее' },
  { value: 'median', label: 'Медиана' },
  { value: 'count_empty', label: 'Пустые' },
  { value: 'count_filled', label: 'Заполненные' },
  { value: 'count_unique', label: 'Уникальные' },
  { value: 'pct_empty', label: '% пустых' },
  { value: 'pct_filled', label: '% заполненных' },
  { value: 'pct_unique', label: '% уникальных' },
]

const structureLabels: Record<string, string> = { flat: 'Плоский список', hierarchical: 'Иерархическая', vertical: 'Вертикальный список' }
const inputModeLabels: Record<string, string> = { inline: 'Строка ввода', modal: 'Всплывающее окно' }
const typeBadges: Record<string, string> = {
  string: 'badge badge-blue', number: 'badge badge-green',
  date: 'badge badge-purple', boolean: 'badge badge-amber',
  classifier: 'badge badge-pink', html: 'badge badge-orange',
  file: 'badge badge-gray', formula: 'badge badge-cyan',
  counter: 'badge badge-indigo', process: 'badge badge-red',
}

export default function RefTableDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [table, setTable] = useState<any>(null)
  const [allReqs, setAllReqs] = useState<any[]>([])

  const load = () => {
    if (!id) return
    api.getRefTable(id).then(setTable)
    api.getRequisites().then(setAllReqs).catch(() => setAllReqs([]))
  }
  useEffect(() => { load() }, [id])

  if (!table) return <div className="p-8 text-gray-400">Загрузка...</div>

  return (
    <div className="page space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/ref-tables" className="icon-btn">
          <ArrowLeft size={18} />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Database size={18} className="text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{table.name}</h1>
          <p className="text-sm text-gray-500">{structureLabels[table.structure]} · {inputModeLabels[table.input_mode]}</p>
        </div>
      </div>

      {/* Two-panel settings */}
      <SettingsPanels table={table} onSave={load} />

      {/* Columns (requisites) */}
      <ColumnsPortlet table={table} allReqs={allReqs} tableId={id!} onReload={load} />
    </div>
  )
}

// --- Two-panel settings -----------------------------------------

function SettingsPanels({ table, onSave }: { table: any; onSave: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})

  const startEdit = () => {
    setForm({
      name: table.name || '', description: table.description || '',
      use_date: table.use_date || false, has_approval: table.has_approval || false,
      show_author: table.show_author || false,
      structure: table.structure || 'flat', input_mode: table.input_mode || 'inline',
      show_on_main_page: table.show_on_main_page || false,
    })
    setEditing(true)
  }

  const handleSave = async () => {
    await api.updateRefTable(table.id, form)
    setEditing(false)
    onSave()
  }

  if (editing) {
    return (
      <div className="card">
        <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
          {/* Left -- General properties */}
          <div className="p-5">
            <h3 className="form-section-title mb-4">Общие свойства справочника</h3>
            <table className="w-full">
              <tbody className="divide-y divide-gray-100">
                <FormRow label="Название">
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="input input-sm w-full" />
                </FormRow>
                <FormRow label="Описание">
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    className="textarea w-full" rows={3} />
                </FormRow>
                <FormRow label="Возможность изменения статуса задач">
                  <input type="checkbox" disabled className="checkbox" />
                </FormRow>
                <FormRow label="Использовать дату">
                  <select value={form.use_date ? 'yes' : 'no'} onChange={e => setForm({ ...form, use_date: e.target.value === 'yes' })}
                    className="select">
                    <option value="no">Нет</option>
                    <option value="yes">Да</option>
                  </select>
                </FormRow>
                <FormRow label="Использовать процедуру утверждения">
                  <input type="checkbox" checked={form.has_approval} onChange={e => setForm({ ...form, has_approval: e.target.checked })}
                    className="checkbox" />
                </FormRow>
                <FormRow label="Использовать процедуру запросов">
                  <input type="checkbox" disabled className="checkbox" />
                </FormRow>
                <FormRow label="Связать с объектным справочником">
                  <input type="checkbox" disabled className="checkbox" />
                </FormRow>
                <FormRow label="Добавить разрез по ресурсам">
                  <input type="checkbox" disabled className="checkbox" />
                </FormRow>
                <FormRow label="Иконка закладки">
                  <span className="text-link text-sm cursor-pointer">установить иконку</span>
                </FormRow>
              </tbody>
            </table>
          </div>

          {/* Right -- Structure */}
          <div className="p-5">
            <h3 className="form-section-title mb-4">Структура справочника</h3>
            <table className="w-full">
              <tbody className="divide-y divide-gray-100">
                <FormRow label="Структура записей справочника">
                  <select value={form.structure} onChange={e => setForm({ ...form, structure: e.target.value })}
                    className="select w-full">
                    <option value="hierarchical">Иерархическая</option>
                    <option value="flat">Плоский список</option>
                    <option value="vertical">Вертикальный список</option>
                  </select>
                </FormRow>
                <FormRow label="Место отображения списка записей">
                  <select value={form.show_on_main_page ? 'main' : 'tab'}
                    onChange={e => setForm({ ...form, show_on_main_page: e.target.value === 'main' })}
                    className="select w-full">
                    <option value="tab">На закладке справочника</option>
                    <option value="main">На Главной проекта</option>
                  </select>
                </FormRow>
                <FormRow label="Форма ввода записи">
                  <select value={form.input_mode} onChange={e => setForm({ ...form, input_mode: e.target.value })}
                    className="select w-full">
                    <option value="modal">Всплывающее окно</option>
                    <option value="inline">Строка ввода</option>
                  </select>
                </FormRow>
              </tbody>
            </table>
          </div>
        </div>
        <div className="card-footer form-actions">
          <button onClick={handleSave} className="btn-primary btn-sm">Сохранить</button>
          <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">отмена</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-header-title">Свойства справочника</h2>
        <button onClick={startEdit} className="btn-ghost btn-sm"><Pencil size={13} /> Изменить</button>
      </div>
      <div className="grid grid-cols-2 gap-0 divide-x divide-gray-200">
        <div className="p-5">
          <h4 className="text-xs font-medium text-gray-400 uppercase mb-3">Общие свойства</h4>
          <table className="w-full">
            <tbody className="divide-y divide-gray-50">
              <ViewRow label="Название" value={table.name} />
              <ViewRow label="Описание" value={table.description || '—'} />
              <ViewRow label="Использовать дату" value={table.use_date ? 'Да' : 'Нет'} />
              <ViewRow label="Процедура утверждения" value={table.has_approval ? 'Да' : 'Нет'} />
              <ViewRow label="Отображать автора записи" value={table.show_author ? 'Да' : 'Нет'} />
              <ViewRow label="Иконка закладки" value="—" />
            </tbody>
          </table>
        </div>
        <div className="p-5">
          <h4 className="text-xs font-medium text-gray-400 uppercase mb-3">Структура</h4>
          <table className="w-full">
            <tbody className="divide-y divide-gray-50">
              <ViewRow label="Структура записей" value={structureLabels[table.structure] || table.structure} />
              <ViewRow label="Место отображения" value={table.show_on_main_page ? 'На Главной проекта' : 'На закладке справочника'} />
              <ViewRow label="Форма ввода записи" value={inputModeLabels[table.input_mode] || table.input_mode} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// --- Columns Portlet --------------------------------------------

function ColumnsPortlet({ table, allReqs, tableId, onReload }: { table: any; allReqs: any[]; tableId: string; onReload: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [selectedReq, setSelectedReq] = useState('')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const columns: any[] = table.columns || []
  const boundIds = new Set(columns.map((c: any) => c.requisite_id))
  const availableReqs = allReqs.filter(r => !boundIds.has(r.id))

  const handleAdd = async () => {
    if (!selectedReq) return
    await api.addRefTableColumn(tableId, { requisite_id: selectedReq, sort_order: columns.length + 1 })
    setShowAdd(false); setSelectedReq(''); onReload()
  }

  const handleDragStart = (idx: number, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragIdx(idx)
  }
  const handleDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setOverIdx(idx)
  }
  const handleDrop = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return }
    // Rebuild order: remove dragged, insert at target
    const ids = columns.map((c: any) => c.requisite_id)
    const [moved] = ids.splice(dragIdx, 1)
    ids.splice(targetIdx, 0, moved)
    // Update all sort_orders
    await Promise.all(ids.map((reqId: string, i: number) =>
      api.addRefTableColumn(tableId, { requisite_id: reqId, sort_order: i + 1 })
    ))
    setDragIdx(null); setOverIdx(null)
    onReload()
  }
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  const handleAggregationChange = async (colId: string, aggregation: string) => {
    await api.updateRefTableColumn(colId, { aggregation })
    onReload()
  }

  return (
    <div className="portlet">
      <div className="portlet-header">
        <div className="flex items-center gap-2">
          <h2 className="card-header-title">Колонки справочника</h2>
          {columns.length > 0 && <span className="badge badge-gray">{columns.length}</span>}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary btn-sm">
          <Plus size={13} /> Добавить колонку
        </button>
      </div>

      {showAdd && (
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex gap-3 items-end">
          <div className="flex-1">
            <label className="label">Выберите реквизит</label>
            <select value={selectedReq} onChange={e => setSelectedReq(e.target.value)}
              className="select w-full">
              <option value="">— Выбрать —</option>
              {availableReqs.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
            </select>
          </div>
          <button onClick={handleAdd} disabled={!selectedReq}
            className="btn-primary btn-sm">Добавить</button>
          <button onClick={() => setShowAdd(false)}
            className="btn-secondary btn-sm">Отмена</button>
        </div>
      )}

      {/* Column header */}
      {columns.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
          <div className="w-5" />
          <div className="w-16">Тип</div>
          <div className="flex-1">Название</div>
          <div className="w-44">Агрегация</div>
          <div className="w-8" />
        </div>
      )}

      <div className="portlet-body" onDragEnd={handleDragEnd}>
        {columns.map((col: any, idx: number) => {
          const r = col.requisite || {}
          const isNumeric = r.type === 'number' || r.type === 'formula'
          return (
            <div key={col.id}
              draggable
              onDragStart={e => handleDragStart(idx, e)}
              onDragOver={e => handleDragOver(idx, e)}
              onDrop={() => handleDrop(idx)}
              className={`portlet-row group transition-colors ${
                dragIdx === idx ? 'opacity-40' : ''
              } ${overIdx === idx && dragIdx !== idx ? 'border-t-2 border-t-primary-500 bg-primary-50/20' : ''}`}>
              <GripVertical size={14} className="text-gray-300 cursor-grab flex-shrink-0 hover:text-gray-500" />
              <span className={typeBadges[r.type] || 'badge badge-gray'}>{r.type}</span>
              <Link to="/admin/requisites" className="flex-1 text-sm font-medium text-link">{r.name}</Link>
              {!col.is_visible && <span className="badge badge-gray">Скрыт</span>}
              <select
                value={col.aggregation || ''}
                onChange={e => handleAggregationChange(col.id, e.target.value)}
                className="select select-sm w-44"
                onClick={e => e.stopPropagation()}
              >
                {(isNumeric ? NUMERIC_AGGREGATIONS : UNIVERSAL_AGGREGATIONS).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button onClick={() => { api.deleteRefTableColumn(col.id).then(onReload) }}
                className="icon-btn-danger reveal-on-hover p-1" title="Удалить колонку">
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
        {columns.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">Нет колонок. Добавьте реквизиты.</p>
        )}
      </div>
    </div>
  )
}

// --- Shared -----------------------------------------------------

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="py-2 pr-4 text-sm text-gray-600 align-top">{label}</td>
      <td className="py-2 text-sm">{children}</td>
    </tr>
  )
}

function ViewRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="py-2 pr-4 text-sm text-gray-500">{label}</td>
      <td className="py-2 text-sm text-gray-900">{value}</td>
    </tr>
  )
}
