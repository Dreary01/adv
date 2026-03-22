import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../lib/api'
import {
  ArrowLeft, Plus, X, GripVertical, Save, Pencil,
  Folder, Target, CheckSquare, Database,
  Briefcase, Flag, Users, Layers, Settings as SettingsIcon
} from 'lucide-react'

const kindLabels: Record<string, string> = { directory: 'Директория', project: 'Проект', task: 'Задача' }
const kindIcons: Record<string, any> = { directory: Folder, project: Target, task: CheckSquare }
const iconMap: Record<string, any> = {
  briefcase: Briefcase, folder: Folder, target: Target, layers: Layers,
  'check-square': CheckSquare, flag: Flag, users: Users, settings: SettingsIcon,
}
const iconOptions = [
  { value: 'briefcase', label: 'Портфель' }, { value: 'folder', label: 'Папка' },
  { value: 'target', label: 'Цель' }, { value: 'layers', label: 'Слои' },
  { value: 'check-square', label: 'Задача' }, { value: 'flag', label: 'Флаг' },
  { value: 'users', label: 'Люди' }, { value: 'settings', label: 'Настройки' },
]
const typeColors: Record<string, string> = {
  string: 'badge-blue', number: 'badge-green',
  date: 'badge-purple', boolean: 'badge-amber',
  classifier: 'badge-pink', html: 'badge-orange',
  file: 'badge-gray', formula: 'badge-cyan',
  counter: 'badge-indigo', process: 'badge-red',
}
const allowedChildren: Record<string, string[]> = {
  directory: ['directory', 'project', 'task'],
  project: ['project', 'task'],
  task: ['task'],
}

export default function ObjectTypeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [type, setType] = useState<any>(null)
  const [allTypes, setAllTypes] = useState<any[]>([])
  const [allReqs, setAllReqs] = useState<any[]>([])
  const [allRefTables, setAllRefTables] = useState<any[]>([])
  const [boundRefTables, setBoundRefTables] = useState<any[]>([])

  const load = () => {
    if (!id) return
    api.getObjectType(id).then(setType)
    api.getObjectTypes().then(setAllTypes)
    api.getRequisites().then(setAllReqs)
    api.getRefTables().then(setAllRefTables).catch(() => setAllRefTables([]))
    api.getTypeRefTables(id).then(setBoundRefTables).catch(() => setBoundRefTables([]))
  }
  useEffect(() => { load() }, [id])

  if (!type) return <div className="p-8 text-gray-400">Загрузка...</div>

  return (
    <div className="page max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/admin/object-types" className="icon-btn">
          <ArrowLeft size={18} className="text-gray-500" />
        </Link>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
          style={{ backgroundColor: type.color || '#6366F1' }}>
          {(() => { const I = iconMap[type.icon] || kindIcons[type.kind]; return <I size={18} /> })()}
        </div>
        <div>
          <h1 className="page-title">{type.name}</h1>
          <p className="page-subtitle">{kindLabels[type.kind]} · {type.can_be_root ? 'Корневой' : 'Вложенный'}</p>
        </div>
      </div>

      <PropertiesPortlet type={type} onSave={load} />
      <RequisitesPortlet type={type} allReqs={allReqs} typeId={id!} onReload={load} />
      <HierarchyPortlet type={type} allTypes={allTypes} typeId={id!} onReload={load} />
      <RefTablesPortlet boundRefTables={boundRefTables} allRefTables={allRefTables} typeId={id!} onReload={load} />
    </div>
  )
}

// --- Properties Portlet --

function PropertiesPortlet({ type, onSave }: { type: any; onSave: () => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>({})

  const startEdit = () => {
    setForm({
      name: type.name || '',
      description: type.description || '',
      kind: type.kind || 'task',
      can_be_root: type.can_be_root || false,
      auto_fill_effort: type.auto_fill_effort || false,
      add_to_calendar: type.add_to_calendar || false,
      default_duration_days: type.default_duration_days ?? '',
      check_uniqueness: type.check_uniqueness || false,
      icon: type.icon || 'check-square',
      color: type.color || '#6366F1',
    })
    setEditing(true)
  }

  const handleSave = async () => {
    await api.updateObjectType(type.id, {
      ...form,
      default_duration_days: form.default_duration_days !== '' ? Number(form.default_duration_days) : null,
    })
    setEditing(false)
    onSave()
  }

  const isDir = type.kind === 'directory'
  const isTask = type.kind === 'task'
  const isProject = type.kind === 'project'

  return (
    <Portlet title={`Свойства объекта ${type.name}`} action={
      editing
        ? <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary btn-sm">Сохранить</button>
            <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">отмена</button>
          </div>
        : <button onClick={startEdit} className="btn-ghost btn-sm"><Pencil size={13} /> Изменить</button>
    }>
      {editing ? (
        <table className="w-full">
          <tbody className="divide-y divide-gray-100">
            <FormRow label="Название">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="input-sm" />
            </FormRow>
            <FormRow label="Описание">
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="textarea" rows={3} />
            </FormRow>
            {isDir && (
              <FormRow label="Может быть корневым">
                <input type="checkbox" checked={form.can_be_root} onChange={e => setForm({ ...form, can_be_root: e.target.checked })}
                  className="checkbox" />
              </FormRow>
            )}
            <FormRow label="Тип объекта">
              <input value={kindLabels[form.kind]} disabled className="input-sm bg-gray-50 text-gray-500" />
            </FormRow>
            {(isProject || isTask) && (
              <FormRow label="Автозаполнение трудозатрат">
                <input type="checkbox" checked={form.auto_fill_effort} onChange={e => setForm({ ...form, auto_fill_effort: e.target.checked })}
                  className="checkbox" />
              </FormRow>
            )}
            {isTask && (
              <FormRow label="Добавлять в календарь исполнителю и участникам">
                <select value={form.add_to_calendar ? 'yes' : 'no'}
                  onChange={e => setForm({ ...form, add_to_calendar: e.target.value === 'yes' })}
                  className="select-sm">
                  <option value="yes">Да</option>
                  <option value="no">Нет</option>
                </select>
              </FormRow>
            )}
            {isTask && (
              <FormRow label="Продолжительность по умолчанию">
                <div className="flex items-center gap-2">
                  <input type="number" min="0" value={form.default_duration_days}
                    onChange={e => setForm({ ...form, default_duration_days: e.target.value })}
                    className="input-sm w-24" placeholder="—" />
                  <span className="text-sm text-gray-500">дня(ей)</span>
                </div>
              </FormRow>
            )}
            <FormRow label="Календарь по умолчанию">
              <input type="checkbox" className="checkbox" disabled />
              <span className="text-xs text-gray-400 ml-2">Будет реализовано позже</span>
            </FormRow>
            <FormRow label="Название роли 'Руководитель' на главной странице объекта">
              <input value="Руководитель" disabled className="input-sm bg-gray-50 text-gray-500" />
            </FormRow>
            <FormRow label="Название роли 'Исполнитель' на главной странице объекта">
              <input value="Исполнитель" disabled className="input-sm bg-gray-50 text-gray-500" />
            </FormRow>
            <FormRow label="Проверять на идентичные объекты">
              <select value={form.check_uniqueness ? 'yes' : 'no'}
                onChange={e => setForm({ ...form, check_uniqueness: e.target.value === 'yes' })}
                className="select-sm">
                <option value="no">Нет</option>
                <option value="yes">Да</option>
              </select>
            </FormRow>
            <FormRow label="Связать с процессом">
              <select className="select-sm" disabled>
                <option>Нет</option>
              </select>
              <span className="text-xs text-gray-400 ml-2">Будет реализовано позже</span>
            </FormRow>
            <FormRow label="Иконка">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: form.color }}>
                  {(() => { const I = iconMap[form.icon] || CheckSquare; return <I size={14} className="text-white" /> })()}
                </div>
                <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}
                  className="select-sm">
                  {iconOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-200" />
              </div>
            </FormRow>
            <FormRow label="Номер в структуре">
              <input type="checkbox" className="checkbox" disabled />
              <span className="text-xs text-gray-400 ml-2">Будет реализовано позже</span>
            </FormRow>
          </tbody>
        </table>
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-gray-100">
            <ViewRow label="Название" value={type.name} />
            <ViewRow label="Описание" value={type.description || '—'} />
            {isDir && <ViewRow label="Может быть корневым" value={type.can_be_root ? '✓' : '—'} />}
            <ViewRow label="Тип объекта" value={kindLabels[type.kind]} />
            {isDir && <ViewRow label="Показывать руководителя и исполнителя" value="—" />}
            {(isProject || isTask) && <ViewRow label="Автозаполнение трудозатрат" value={type.auto_fill_effort ? '✓' : '—'} />}
            {isTask && <ViewRow label="Добавлять в календарь" value={type.add_to_calendar ? 'Да' : 'Нет'} />}
            {isTask && <ViewRow label="Продолжительность по умолчанию" value={type.default_duration_days ? `${type.default_duration_days} дня(ей)` : '—'} />}
            <ViewRow label="Календарь по умолчанию" value="—" />
            <ViewRow label="Название роли 'Руководитель'" value="Руководитель" />
            <ViewRow label="Название роли 'Исполнитель'" value="Исполнитель" />
            <ViewRow label="Проверять на идентичные объекты" value={type.check_uniqueness ? 'Да' : 'Нет'} />
            <ViewRow label="Связать с процессом" value="Нет" />
            <ViewRow label="Иконка">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: type.color || '#6366F1' }}>
                  {(() => { const I = iconMap[type.icon] || kindIcons[type.kind]; return <I size={12} className="text-white" /> })()}
                </div>
                <span className="text-sm text-gray-700">{iconOptions.find(o => o.value === type.icon)?.label || type.icon || '—'}</span>
              </div>
            </ViewRow>
            <ViewRow label="Номер в структуре" value="—" />
          </tbody>
        </table>
      )}
    </Portlet>
  )
}

// --- Requisites Portlet ---

function RequisitesPortlet({ type, allReqs, typeId, onReload }: { type: any; allReqs: any[]; typeId: string; onReload: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const [selectedReq, setSelectedReq] = useState('')
  const [bindOpts, setBindOpts] = useState({
    is_required: false, is_visible: true, is_lockable: false,
    inherit_to_children: false, is_conditional: false,
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editOpts, setEditOpts] = useState<any>({})

  const boundIds = new Set((type.requisites || []).map((r: any) => r.requisite_id))
  const availableReqs = allReqs.filter(r => !boundIds.has(r.id))

  const handleBind = async () => {
    if (!selectedReq) return
    await api.bindRequisite(typeId, { requisite_id: selectedReq, ...bindOpts, sort_order: (type.requisites?.length || 0) + 1 })
    setShowAdd(false); setSelectedReq(''); setBindOpts({ is_required: false, is_visible: true, is_lockable: false, inherit_to_children: false, is_conditional: false })
    onReload()
  }

  const handleUpdateBinding = async (otr: any) => {
    await api.bindRequisite(typeId, { requisite_id: otr.requisite_id, ...editOpts, sort_order: otr.sort_order })
    setEditingId(null); onReload()
  }

  return (
    <Portlet title="Реквизиты" count={type.requisites?.length || 0} action={
      <button onClick={() => setShowAdd(!showAdd)} className="btn-primary btn-sm">
        <Plus size={13} /> Добавить
      </button>
    }>
      {showAdd && (
        <div className="p-4 bg-gray-50 border-b border-gray-100 space-y-3 animate-slide-down">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">Выберите реквизит</label>
              <select value={selectedReq} onChange={e => setSelectedReq(e.target.value)} className="select">
                <option value="">— Выбрать —</option>
                {availableReqs.map(r => <option key={r.id} value={r.id}>{r.name} ({r.type})</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Toggle label="Обязательный" checked={bindOpts.is_required} onChange={v => setBindOpts({ ...bindOpts, is_required: v })} />
            <Toggle label="Показывать" checked={bindOpts.is_visible} onChange={v => setBindOpts({ ...bindOpts, is_visible: v })} />
            <Toggle label="Блокируемый" checked={bindOpts.is_lockable} onChange={v => setBindOpts({ ...bindOpts, is_lockable: v })} />
            <Toggle label="Наследовать" checked={bindOpts.inherit_to_children} onChange={v => setBindOpts({ ...bindOpts, inherit_to_children: v })} />
            <Toggle label="Условный" checked={bindOpts.is_conditional} onChange={v => setBindOpts({ ...bindOpts, is_conditional: v })} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleBind} disabled={!selectedReq} className="btn-primary btn-sm disabled:opacity-50">Привязать</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">Отмена</button>
          </div>
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {(type.requisites || []).map((otr: any) => {
          const r = otr.requisite || {}
          const isEditing = editingId === otr.id
          return (
            <div key={otr.id}>
              <div className="portlet-row group cursor-pointer"
                onClick={() => { if (!isEditing) { setEditOpts({ is_required: otr.is_required, is_visible: otr.is_visible, is_lockable: otr.is_lockable, inherit_to_children: otr.inherit_to_children, is_conditional: otr.is_conditional }); setEditingId(otr.id) } }}>
                <GripVertical size={14} className="text-gray-300 cursor-grab flex-shrink-0" />
                <span className={`badge flex-shrink-0 ${typeColors[r.type] || 'badge-gray'}`}>{r.type}</span>
                <span className="flex-1 text-sm font-medium text-gray-900">{r.name}</span>
                <div className="flex items-center gap-1.5">
                  {otr.is_required && <span className="badge badge-red">Обяз.</span>}
                  {!otr.is_visible && <span className="badge badge-gray">Скрыт</span>}
                  {otr.is_lockable && <span className="badge badge-amber">Блок.</span>}
                  {otr.inherit_to_children && <span className="badge badge-blue">Насл.</span>}
                  {otr.is_conditional && <span className="badge badge-purple">Усл.</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); api.unbindRequisite(typeId, otr.requisite_id).then(onReload) }}
                  className="icon-btn-danger reveal-on-hover flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
              {isEditing && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-4 animate-slide-down">
                  <div className="flex flex-wrap gap-x-5 gap-y-1 flex-1">
                    <Toggle label="Обязательный" checked={editOpts.is_required} onChange={v => setEditOpts({ ...editOpts, is_required: v })} />
                    <Toggle label="Показывать" checked={editOpts.is_visible} onChange={v => setEditOpts({ ...editOpts, is_visible: v })} />
                    <Toggle label="Блокируемый" checked={editOpts.is_lockable} onChange={v => setEditOpts({ ...editOpts, is_lockable: v })} />
                    <Toggle label="Наследовать" checked={editOpts.inherit_to_children} onChange={v => setEditOpts({ ...editOpts, inherit_to_children: v })} />
                    <Toggle label="Условный" checked={editOpts.is_conditional} onChange={v => setEditOpts({ ...editOpts, is_conditional: v })} />
                  </div>
                  <button onClick={() => handleUpdateBinding(otr)} className="btn-success btn-xs">Сохранить</button>
                  <button onClick={() => setEditingId(null)} className="btn-secondary btn-xs">Отмена</button>
                </div>
              )}
            </div>
          )
        })}
        {(!type.requisites || type.requisites.length === 0) && <p className="text-center text-gray-400 py-6 text-sm">Нет привязанных реквизитов</p>}
      </div>
    </Portlet>
  )
}

// --- Hierarchy Portlet ---

function HierarchyPortlet({ type, allTypes, typeId, onReload }: { type: any; allTypes: any[]; typeId: string; onReload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [selectedChildren, setSelectedChildren] = useState<string[]>([])

  const otherTypes = allTypes.filter(t => t.id !== typeId)
  const parentTypes = allTypes.filter(t => (type.parent_type_ids || []).includes(t.id))
  const childTypes = allTypes.filter(t => (type.child_type_ids || []).includes(t.id))
  const allowedKinds = allowedChildren[type.kind] || []
  const eligibleChildren = otherTypes.filter(t => allowedKinds.includes(t.kind))

  const startEdit = () => { setSelectedChildren(type.child_type_ids || []); setEditing(true) }
  const handleSave = async () => { await api.setHierarchy(typeId, selectedChildren); setEditing(false); onReload() }
  const toggleChild = (id: string) => setSelectedChildren(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <Portlet title="Иерархия объектов" action={
      editing
        ? <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary btn-sm">Сохранить</button>
            <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">отмена</button>
          </div>
        : <button onClick={startEdit} className="btn-ghost btn-sm"><Pencil size={13} /> Изменить</button>
    }>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h4 className="label">Родительские типы</h4>
          <p className="text-xs text-gray-400 mb-2">В какие типы может быть вложен</p>
          {parentTypes.length === 0 ? <p className="text-sm text-gray-400 italic">—</p> : <div className="space-y-1">{parentTypes.map(t => <TypeChip key={t.id} type={t} />)}</div>}
        </div>
        <div>
          <h4 className="label">Дочерние типы</h4>
          <p className="text-xs text-gray-400 mb-2">Что можно вложить</p>
          {editing ? (
            <div className="space-y-1">
              {eligibleChildren.map(t => (
                <label key={t.id} className="label-inline flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input type="checkbox" checked={selectedChildren.includes(t.id)} onChange={() => toggleChild(t.id)} className="checkbox" />
                  <TypeChip type={t} />
                </label>
              ))}
              {eligibleChildren.length === 0 && <p className="text-sm text-gray-400">Нет доступных типов</p>}
            </div>
          ) : (
            childTypes.length === 0 ? <p className="text-sm text-gray-400 italic">—</p> : <div className="space-y-1">{childTypes.map(t => <TypeChip key={t.id} type={t} />)}</div>
          )}
        </div>
      </div>
    </Portlet>
  )
}

// --- Ref Tables Portlet ---

function RefTablesPortlet({ boundRefTables, allRefTables, typeId, onReload }: {
  boundRefTables: any[]; allRefTables: any[]; typeId: string; onReload: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [selectedTable, setSelectedTable] = useState('')

  const boundIds = new Set(boundRefTables.map(t => t.id))
  const available = allRefTables.filter(t => !boundIds.has(t.id))

  const handleBind = async () => { if (!selectedTable) return; await api.bindTypeRefTable(typeId, selectedTable); setShowAdd(false); setSelectedTable(''); onReload() }
  const handleUnbind = async (tableId: string) => { await api.unbindTypeRefTable(typeId, tableId); onReload() }

  return (
    <Portlet title="Дочерние справочники" count={boundRefTables.length} action={
      <button onClick={() => setShowAdd(!showAdd)} className="btn-primary btn-sm">
        <Plus size={13} /> Добавить
      </button>
    }>
      {showAdd && (
        <div className="p-4 bg-gray-50 border-b border-gray-100 flex gap-3 items-end animate-slide-down">
          <div className="flex-1">
            <label className="label">Выберите справочник</label>
            <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)} className="select">
              <option value="">— Выбрать —</option>
              {available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button onClick={handleBind} disabled={!selectedTable} className="btn-primary btn-sm disabled:opacity-50">Привязать</button>
          <button onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">Отмена</button>
        </div>
      )}
      <div className="divide-y divide-gray-100">
        {boundRefTables.map(t => (
          <div key={t.id} className="portlet-row group">
            <Database size={16} className="text-gray-400 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900">{t.name}</span>
              {t.description && <p className="text-xs text-gray-400">{t.description}</p>}
            </div>
            <span className="text-xs text-gray-400">{t.structure}</span>
            <button onClick={() => handleUnbind(t.id)} className="icon-btn-danger reveal-on-hover flex-shrink-0"><X size={14} /></button>
          </div>
        ))}
        {boundRefTables.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Нет привязанных справочников</p>}
      </div>
    </Portlet>
  )
}

// --- Shared Components ---

function Portlet({ title, count, action, children }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="portlet">
      <div className="portlet-header">
        <div className="flex items-center gap-2">
          <h2 className="card-header-title">{title}</h2>
          {count !== undefined && count > 0 && <span className="badge badge-gray">{count}</span>}
        </div>
        {action}
      </div>
      <div className="portlet-body">{children}</div>
    </div>
  )
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="py-2.5 pr-6 text-sm text-gray-600 align-top whitespace-nowrap w-1/3">{label}</td>
      <td className="py-2.5 text-sm">{children}</td>
    </tr>
  )
}

function ViewRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="py-2.5 pr-6 text-sm text-gray-500 w-1/3">{label}</td>
      <td className="py-2.5 text-sm text-gray-900">{children || value}</td>
    </tr>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="label-inline flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="checkbox" />
      {label}
    </label>
  )
}

function TypeChip({ type }: { type: any }) {
  const Icon = kindIcons[type.kind] || CheckSquare
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-200">
      <div className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: type.color || '#6366F1' }}>
        <Icon size={10} className="text-white" />
      </div>
      <span className="text-xs font-medium text-gray-700">{type.name}</span>
      <span className="text-[10px] text-gray-400">{kindLabels[type.kind]}</span>
    </div>
  )
}
