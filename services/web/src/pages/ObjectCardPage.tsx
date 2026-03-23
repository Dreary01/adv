import { useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import {
  ArrowLeft, Calendar, FileText, Flag, MoreVertical, Play, Pause, Square,
  ChevronRight, ChevronDown, Plus, Search, User, Clock, Filter, X, Trash2, Pencil, Check,
  Folder, Target, CheckSquare, Briefcase, Layers, Users,
  Flag as FlagIcon, Settings as SettingsIcon, Activity, GripVertical, Database
} from 'lucide-react'
import ConfirmDeleteDialog from '../components/ui/ConfirmDeleteDialog'
import { formatDateRu, businessDaysBetween, calculateForecast } from '../lib/date-utils'

const iconMap: Record<string, any> = {
  briefcase: Briefcase, folder: Folder, target: Target, layers: Layers,
  'check-square': CheckSquare, flag: FlagIcon, users: Users, settings: SettingsIcon,
}
const kindIcons: Record<string, any> = { directory: Folder, project: Target, task: CheckSquare }

const statusCssClass: Record<string, string> = {
  not_started: 'status-not-started',
  in_progress: 'status-in-progress',
  completed: 'status-completed',
  on_hold: 'status-on-hold',
  cancelled: 'status-cancelled',
}

const statusLabel: Record<string, string> = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  completed: 'Завершён',
  on_hold: 'Приостановлен',
  cancelled: 'Отменён',
}

const priorityConfig: Record<number, { label: string; color: string }> = {
  4: { label: 'Критический', color: 'text-red-500' },
  3: { label: 'Высокий', color: 'text-orange-500' },
  2: { label: 'Средний', color: 'text-yellow-500' },
  1: { label: 'Низкий', color: 'text-blue-400' },
}

const tabs = [
  { id: 'main', label: 'Главная' },
  { id: 'gantt', label: 'Гант' },
  { id: 'ref-tables', label: 'Справочники' },
  { id: 'events', label: 'Лента событий' },
]

export default function ObjectCardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [obj, setObj] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  const activeTab = searchParams.get('tab') || 'main'
  const setActiveTab = (tab: string) => {
    setSearchParams(prev => { prev.set('tab', tab); return prev }, { replace: true })
  }

  useEffect(() => {
    if (!id) return
    api.getObject(id).then(setObj).catch(() => navigate('/projects'))
  }, [id])

  if (!obj) return <div className="p-8 text-gray-400">Загрузка...</div>

  const stClass = statusCssClass[obj.status] || 'status-not-started'
  const stLabel = statusLabel[obj.status] || statusLabel.not_started
  const Icon = iconMap[obj.type_icon] || kindIcons[obj.type_kind] || CheckSquare
  const color = obj.type_color || '#6366F1'

  return (
    <div className="flex h-full">
      {/* Left sidebar — tabs */}
      <aside className="w-48 border-r border-gray-200 bg-gray-50/50 flex-shrink-0">
        <div className="p-3">
          <Link to="/projects" className="flex items-center gap-1.5 text-xs text-link mb-4">
            <ArrowLeft size={12} /> Дерево проектов
          </Link>
        </div>
        <nav className="space-y-0.5 px-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                activeTab === tab.id
                  ? 'bg-primary-600/10 text-primary-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {tab.label}
            </button>
          ))}
          {/* Placeholder tabs */}
          {['Отчётность', 'Ресурсы', 'Документы'].map(label => (
            <button key={label} disabled
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-300 cursor-not-allowed opacity-60">
              {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Breadcrumbs + Header */}
        <div className="border-b border-gray-200 bg-white">
          <div className="px-6 pt-4 pb-1">
            {/* Breadcrumbs */}
            <div className="text-xs text-gray-400 mb-2">
              <Link to="/projects" className="text-link">Все проекты</Link>
              <span className="mx-1">/</span>
              <span className="text-gray-600">{obj.name}</span>
            </div>

            {/* Title row */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: color + '20', color }}>
                <Icon size={16} />
              </div>
              <h1 className="text-lg font-bold text-gray-900 flex-1">{obj.name}</h1>

              {/* Action icons */}
              <div className="flex items-center gap-1">
                <button className="btn-icon-sm" title="Календарь"><Calendar size={16} /></button>
                <button className="btn-icon-sm" title="Документы"><FileText size={16} /></button>
                <button className={`btn-icon-sm ${obj.priority > 0 ? 'text-orange-500' : ''}`}
                  title="Приоритет"><Flag size={16} /></button>
                <button className="btn-icon-sm text-red-400 hover:text-red-600 hover:bg-red-50"
                  title="Удалить объект"
                  onClick={() => setDeleteTarget(obj)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-6 mb-3">
              {obj.owner_id && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User size={14} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Руководитель</p>
                    <p className="text-sm text-gray-700">—</p>
                  </div>
                </div>
              )}
              {obj.assignee_id && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                    <User size={14} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Исполнитель</p>
                    <p className="text-sm text-gray-700">—</p>
                  </div>
                </div>
              )}
              {!obj.owner_id && !obj.assignee_id && (
                <p className="text-xs text-gray-400">Ответственные не назначены</p>
              )}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'main' && <MainTab obj={obj} onDeleteNode={setDeleteTarget} />}
          {activeTab === 'gantt' && <GanttTab obj={obj} />}
          {activeTab === 'ref-tables' && <RefTablesTab obj={obj} />}
          {activeTab === 'events' && <EventsTab />}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDeleteDialog
          objectId={deleteTarget.id}
          objectName={deleteTarget.name}
          onConfirm={() => {
            setDeleteTarget(null)
            // If we deleted the current object, go back to projects
            if (deleteTarget.id === obj.id) {
              navigate('/projects')
            } else {
              // Reload current object to refresh hierarchy
              api.getObject(obj.id).then(setObj).catch(() => {})
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ─── Main Tab ───────────────────────────────────────────

function MainTab({ obj, onDeleteNode }: { obj: any; onDeleteNode: (node: any) => void }) {
  const stClass = statusCssClass[obj.status] || 'status-not-started'
  const stLabel = statusLabel[obj.status] || statusLabel.not_started
  const plans = obj.plans || []
  const baseline = plans.find((p: any) => p.plan_type === 'baseline')
  const operational = plans.find((p: any) => p.plan_type === 'operational')
  const forecast = calculateForecast(obj)

  // Date editing state
  const [editDates, setEditDates] = useState(false)
  const [dateForm, setDateForm] = useState({
    start_date: operational?.start_date || '',
    end_date: operational?.end_date || '',
    duration_days: operational?.duration_days || '',
    effort_hours: operational?.effort_hours || '',
  })
  const [saving, setSaving] = useState(false)

  const startEditDates = () => {
    setDateForm({
      start_date: operational?.start_date || '',
      end_date: operational?.end_date || '',
      duration_days: operational?.duration_days || '',
      effort_hours: operational?.effort_hours || '',
    })
    setEditDates(true)
  }

  const saveDates = async () => {
    setSaving(true)
    try {
      await api.upsertOperationalPlan(obj.id, {
        start_date: dateForm.start_date || null,
        end_date: dateForm.end_date || null,
        duration_days: dateForm.duration_days ? Number(dateForm.duration_days) : null,
        effort_hours: dateForm.effort_hours ? Number(dateForm.effort_hours) : null,
      })
      setEditDates(false)
      // Trigger reload (parent re-fetches obj)
      window.location.reload()
    } catch { }
    setSaving(false)
  }

  const handleCreateBaseline = async () => {
    await api.createBaseline(obj.id)
    window.location.reload()
  }

  const duration = dateForm.start_date && dateForm.end_date
    ? businessDaysBetween(dateForm.start_date, dateForm.end_date)
    : operational?.duration_days || null

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Status + Widgets row */}
      <div className="grid grid-cols-4 gap-4">
        {/* Status */}
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 uppercase font-medium">Статус</span>
              <div className="flex gap-1">
                <button className="btn-icon-sm text-blue-500" title="Старт"><Play size={12} /></button>
                <button className="btn-icon-sm text-amber-500" title="Пауза"><Pause size={12} /></button>
                <button className="btn-icon-sm text-red-500" title="Стоп"><Square size={12} /></button>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{obj.progress}%</p>
            <span className={stClass}>{stLabel}</span>
            <div className="progress-bar mt-2">
              <div className="progress-bar-fill progress-bar-fill-green" style={{ width: `${obj.progress}%` }} />
            </div>
          </div>
        </div>

        {/* Widget: Report status */}
        <div className="card">
          <div className="card-body">
            <span className="text-xs text-gray-500 uppercase font-medium">Отчёт о статусе</span>
            <div className="flex items-center justify-center mt-4">
              <div className="w-12 h-12 rounded-full bg-yellow-300" />
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-center">Будет реализовано</p>
          </div>
        </div>

        {/* Widget: Budget */}
        <div className="card">
          <div className="card-body">
            <span className="text-xs text-gray-500 uppercase font-medium">Бюджет проекта</span>
            <p className="text-lg font-bold text-orange-500 mt-2">—</p>
            <p className="text-xs text-gray-400">Будет реализовано</p>
            <div className="progress-bar mt-2 h-1.5" />
          </div>
        </div>

        {/* Widget: Effort */}
        <div className="card">
          <div className="card-body">
            <span className="text-xs text-gray-500 uppercase font-medium">Трудозатраты</span>
            <p className="text-lg font-bold text-orange-500 mt-2">—</p>
            <p className="text-xs text-gray-400">Будет реализовано</p>
            <div className="progress-bar mt-2 h-1.5" />
          </div>
        </div>
      </div>

      {/* Dates — 3 columns */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-header-title">Сроки</h3>
          {!editDates && (
            <button onClick={startEditDates} className="btn-ghost btn-sm">
              <Pencil size={13} /> Изменить
            </button>
          )}
        </div>
        <div className="card-body">
          <div className="grid grid-cols-3 gap-6">
            {/* Col 1: Operational (editable) */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Оперативный план</h4>
              {editDates ? (
                <div className="space-y-3">
                  <div>
                    <label className="label">Начало</label>
                    <input type="date" value={dateForm.start_date}
                      onChange={e => setDateForm({ ...dateForm, start_date: e.target.value })}
                      className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">Завершение</label>
                    <input type="date" value={dateForm.end_date}
                      onChange={e => setDateForm({ ...dateForm, end_date: e.target.value })}
                      className="input input-sm" />
                  </div>
                  <div>
                    <label className="label">Длительность (раб. дн.)</label>
                    <input type="number" min="1" value={dateForm.duration_days}
                      onChange={e => setDateForm({ ...dateForm, duration_days: e.target.value })}
                      className="input input-sm" placeholder={duration ? String(duration) : '—'} />
                  </div>
                  <div>
                    <label className="label">Трудозатраты (ч.)</label>
                    <input type="number" min="0" step="0.5" value={dateForm.effort_hours}
                      onChange={e => setDateForm({ ...dateForm, effort_hours: e.target.value })}
                      className="input input-sm" placeholder="—" />
                  </div>
                  <div className="form-actions">
                    <button onClick={saveDates} disabled={saving} className="btn-primary btn-xs">
                      {saving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                    <button onClick={() => setEditDates(false)} className="btn-ghost btn-xs">Отмена</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Начало</span>
                    <span className="text-sm font-semibold text-orange-500">{formatDateRu(operational?.start_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Завершение</span>
                    <span className="text-sm font-semibold text-orange-500">{formatDateRu(operational?.end_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Длительность</span>
                    <span className="text-sm text-gray-700">{operational?.duration_days ? `${operational.duration_days} раб. дн.` : '—'}</span>
                  </div>
                  {operational?.effort_hours && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Трудозатраты</span>
                      <span className="text-sm text-gray-700">{operational.effort_hours} ч.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Col 2: Baseline (read-only + snapshot button) */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Утверждённый план</h4>
              {baseline ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Начало</span>
                    <span className="text-sm text-gray-700">{formatDateRu(baseline.start_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-500">Завершение</span>
                    <span className="text-sm text-gray-700">{formatDateRu(baseline.end_date)}</span>
                  </div>
                  {baseline.duration_days && (
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Длительность</span>
                      <span className="text-sm text-gray-700">{baseline.duration_days} раб. дн.</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Не утверждён</p>
              )}
              {operational && (
                <button onClick={handleCreateBaseline} className="btn-secondary btn-xs mt-3">
                  {baseline ? 'Обновить' : 'Утвердить'}
                </button>
              )}
            </div>

            {/* Col 3: Actual + Forecast (auto) */}
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Фактические</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Начало</span>
                  <span className="text-sm text-gray-700">{formatDateRu(obj.actual_start_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Завершение</span>
                  <span className="text-sm text-gray-700">{formatDateRu(obj.actual_end_date)}</span>
                </div>
              </div>
              {obj.status !== 'completed' && (forecast.start || forecast.end) && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Прогноз</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Начало</span>
                      <span className="text-xs text-blue-600">{formatDateRu(forecast.start)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">Завершение</span>
                      <span className="text-xs text-blue-600">{formatDateRu(forecast.end)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Requisites (field_values) */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-header-title">Реквизиты проекта</h3>
        </div>
        <div className="card-body">
          {obj.field_values && Object.keys(obj.field_values).length > 0 ? (
            <table className="w-full">
              <tbody className="divide-y divide-gray-50">
                {Object.entries(obj.field_values).map(([key, value]) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-sm text-gray-500 w-1/3">{key}</td>
                    <td className="py-2 text-sm text-gray-900">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-400">Нет заполненных реквизитов</p>
          )}
        </div>
      </div>

      {/* Hierarchy */}
      <HierarchyTab obj={obj} onDeleteNode={onDeleteNode} />

      {/* Description */}
      {obj.description && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-header-title">Описание</h3>
          </div>
          <div className="card-body">
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{obj.description}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Hierarchy Tab ──────────────────────────────────────

function collectAllIds(nodes: any[]): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    ids.push(n.id)
    if (n.children?.length) ids.push(...collectAllIds(n.children))
  }
  return ids
}

function filterSubtree(nodes: any[], search: string): any[] {
  if (!search) return nodes
  const s = search.toLowerCase()
  return nodes
    .filter(n => {
      const selfMatch = n.name.toLowerCase().includes(s)
      const childMatch = n.children?.length && filterSubtree(n.children, search).length > 0
      return selfMatch || childMatch
    })
    .map(n => ({ ...n, children: n.children ? filterSubtree(n.children, search) : [] }))
}

function flattenSubtree(nodes: any[], openSet: Set<string>, result: any[] = [], level = 0): any[] {
  for (const n of nodes) {
    result.push({ ...n, _level: level })
    if (n.children?.length && openSet.has(n.id)) {
      flattenSubtree(n.children, openSet, result, level + 1)
    }
  }
  return result
}

function countNodes(nodes: any[]): number {
  let c = 0
  for (const n of nodes) { c++; if (n.children) c += countNodes(n.children) }
  return c
}

const TREE_STORAGE_KEY = 'adv_tree_open'

function readOpenNodes(): Set<string> {
  try {
    const saved = sessionStorage.getItem(TREE_STORAGE_KEY)
    if (saved) return new Set(JSON.parse(saved))
  } catch {}
  return new Set()
}

function saveOpenNodes(nodes: Set<string>) {
  try { sessionStorage.setItem(TREE_STORAGE_KEY, JSON.stringify([...nodes])) } catch {}
}

function HierarchyTab({ obj, onDeleteNode }: { obj: any; onDeleteNode: (node: any) => void }) {
  const navigate = useNavigate()
  const [subtree, setSubtree] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [openNodes, _setOpenNodes] = useState<Set<string>>(readOpenNodes)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', type_id: '' })
  const [loading, setLoading] = useState(true)

  const setOpenNodes = useCallback((update: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    _setOpenNodes(prev => {
      const next = typeof update === 'function' ? update(prev) : update
      saveOpenNodes(next)
      return next
    })
  }, [])

  const loadSubtree = useCallback(() => {
    setLoading(true)
    api.getObjectSubtree(obj.id).then(data => {
      setSubtree(data || [])
      // auto-open first level only on first visit (no saved state at all)
      const hasSavedState = sessionStorage.getItem(TREE_STORAGE_KEY) !== null
      const childIds = (data || []).map((n: any) => n.id)
      if (!hasSavedState && childIds.length > 0) {
        setOpenNodes(prev => {
          const next = new Set(prev)
          childIds.forEach((id: string) => next.add(id))
          return next
        })
      }
    }).catch(() => setSubtree([]))
      .finally(() => setLoading(false))
  }, [obj.id, setOpenNodes])

  useEffect(() => {
    loadSubtree()
    api.getObjectTypes().then(setTypes).catch(() => {})
  }, [loadSubtree])

  const toggleNode = useCallback((id: string) => {
    setOpenNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [setOpenNodes])

  const expandAll = useCallback(() => {
    setOpenNodes(new Set([...readOpenNodes(), ...collectAllIds(subtree)]))
  }, [subtree, setOpenNodes])

  const collapseAll = useCallback(() => {
    // Only remove nodes from this subtree, keep others
    const subtreeIds = new Set(collectAllIds(subtree))
    setOpenNodes(prev => {
      const next = new Set(prev)
      subtreeIds.forEach(id => next.delete(id))
      return next
    })
  }, [subtree, setOpenNodes])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.name || !createForm.type_id) return
    await api.createObject({ ...createForm, parent_id: obj.id, status: 'not_started' })
    setCreateForm({ name: '', type_id: '' })
    setShowCreate(false)
    loadSubtree()
  }

  // Get child types allowed for this object type
  const allowedTypes = types.filter(t => {
    // If obj has child_type_ids, use those; otherwise show all
    if (obj.type_kind === 'directory') return true
    if (obj.type_kind === 'project') return t.kind === 'project' || t.kind === 'task'
    return t.kind === 'task'
  })

  const filtered = filterSubtree(subtree, search)
  const flat = flattenSubtree(filtered, openNodes)
  const total = countNodes(subtree)

  return (
    <div>
      <div className="card">
        {/* Header */}
        <div className="card-header">
          <div className="flex items-center gap-3">
            <h3 className="card-header-title">Иерархическая структура</h3>
            {total > 0 && <span className="badge badge-gray">{total}</span>}
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary btn-sm">
            <Plus size={13} /> Добавить
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="px-4 py-3 bg-gray-50/70 border-b border-gray-100 flex items-end gap-3 animate-slide-down"
            style={{ animation: 'slideDown 0.25s ease-out' }}>
            <div className="flex-1">
              <label className="label">Название *</label>
              <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                className="input input-sm" placeholder="Название объекта" required autoFocus />
            </div>
            <div className="w-48">
              <label className="label">Тип *</label>
              <select value={createForm.type_id} onChange={e => setCreateForm({ ...createForm, type_id: e.target.value })}
                className="select select-sm" required>
                <option value="">— Тип —</option>
                {allowedTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary btn-sm">Создать</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost btn-sm">Отмена</button>
          </form>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Найти..." className="input input-sm w-full pl-8" />
          </div>
          <span className="text-xs text-gray-300">|</span>
          <button onClick={expandAll} className="text-xs text-link">развернуть все</button>
          <button onClick={collapseAll} className="text-xs text-link">свернуть все</button>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/70 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
          <div className="w-4 flex-shrink-0" />
          <div className="w-5 flex-shrink-0" />
          <span className="flex-1">Название</span>
          <span className="w-24 text-center">Прогресс</span>
          <span className="w-20 text-center">Статус</span>
          <span className="w-24 text-center">Исполнитель</span>
        </div>

        {/* Tree rows */}
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400">Загрузка...</div>
        ) : flat.length === 0 ? (
          <div className="empty-state py-10">
            <Folder size={28} className="empty-state-icon" />
            <p className="empty-state-text">Нет дочерних объектов</p>
            <p className="empty-state-hint">Нажмите «Добавить» чтобы создать</p>
          </div>
        ) : (
          <div>
            {flat.map((node: any) => {
              const hasChildren = node.children && node.children.length > 0
              const isOpen = openNodes.has(node.id)
              const stClass = statusCssClass[node.status] || 'status-not-started'
              const stText = statusLabel[node.status] || 'Не начат'
              const NIcon = iconMap[node.type_icon] || kindIcons[node.type_kind] || CheckSquare
              const color = node.type_color || '#3d5af5'

              return (
                <div key={node.id}
                  className="tree-row group"
                  style={{ paddingLeft: `${node._level * 20 + 12}px` }}
                >
                  {/* Expand/collapse */}
                  <div className="w-4 flex-shrink-0 cursor-pointer"
                    onClick={() => hasChildren && toggleNode(node.id)}>
                    {hasChildren ? (
                      isOpen
                        ? <ChevronDown size={13} className="text-gray-400" />
                        : <ChevronRight size={13} className="text-gray-400" />
                    ) : <div className="w-3" />}
                  </div>

                  {/* Type icon */}
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: color + '18', color }}>
                    <NIcon size={11} />
                  </div>

                  {/* Name */}
                  <span className="text-sm font-medium text-primary-600 hover:underline flex-1 truncate cursor-pointer"
                    onClick={() => navigate(`/projects/${node.id}?tab=main`)}>
                    {node.name}
                  </span>

                  {/* Progress */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
                    <div className="flex-1 progress-bar">
                      <div className="progress-bar-fill progress-bar-fill-green" style={{ width: `${node.progress}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-400 w-7 text-right">{node.progress}%</span>
                  </div>

                  {/* Status */}
                  <span className={`${stClass} flex-shrink-0`}>{stText}</span>

                  {/* Assignee */}
                  <div className="flex items-center gap-1 flex-shrink-0 w-24">
                    {node.assignee_id ? (
                      <>
                        <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <User size={9} className="text-gray-500" />
                        </div>
                        <span className="text-[10px] text-gray-500 truncate">Исполнитель</span>
                      </>
                    ) : (
                      <span className="text-[10px] text-gray-300">—</span>
                    )}
                  </div>

                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteNode(node) }}
                    className="icon-btn-danger reveal-on-hover p-1 flex-shrink-0"
                    title="Удалить">
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Gantt Tab ──────────────────────────────────────────

import { Gantt as SVARGantt, Willow as SVARWillow } from '@svar-ui/react-gantt'
import { cascadeSchedule, findCriticalPath } from '../lib/gantt-scheduler'
import { toGanttData } from '../lib/gantt-types'

const GANTT_SCALES = [
  { unit: 'month' as any, step: 1, format: '%F %Y' },
  { unit: 'day' as any, step: 1, format: '%j' },
]

const highlightWeekends = (date: Date) => {
  const day = date.getDay()
  return day === 0 || day === 6 ? 'wx-weekend' : ''
}

function GanttWithRealData({ data, onTaskDateChange, onDependencyCreate, onDependencyDelete, showCriticalPath, onToggleCriticalPath }: {
  data: any; onTaskDateChange?: (id: string, start: string, end: string) => void; onDependencyCreate?: (from: string, to: string, type: string) => void; onDependencyDelete?: (depId: string) => void
  showCriticalPath?: boolean; onToggleCriticalPath?: () => void
}) {
  if (!data || !data.tasks || data.tasks.length === 0) {
    return <div className="empty-state py-12"><p className="empty-state-text">Нет задач с датами</p></div>
  }

  const MAX_GANTT_TASKS = 50000
  const depTypeToSvar: Record<string, string> = { fs: 'e2s', ss: 's2s', ff: 'e2e', sf: 's2e' }

  // Limit tasks for performance
  const limitedTasks = data.tasks.slice(0, MAX_GANTT_TASKS)

  const uuidToId: Record<string, number> = {}
  const idToUuid: Record<number, string> = {}
  limitedTasks.forEach((t: any, i: number) => { uuidToId[t.id] = i + 1; idToUuid[i + 1] = t.id })

  const parentIds = new Set(limitedTasks.map((t: any) => t.parentId).filter(Boolean))

  const tasks = limitedTasks.map((t: any, i: number) => {
    const [y, m, d] = t.start.split('-').map(Number)
    const [y2, m2, d2] = t.end.split('-').map(Number)
    const start = new Date(y, m - 1, d)
    const end = new Date(y2, m2 - 1, d2)
    const dur = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
    const parentNum = t.parentId ? uuidToId[t.parentId] : 0
    const isSummary = parentIds.has(t.id)
    // SVAR: summary tasks must NOT have start/duration (computed from children)
    if (isSummary) {
      return {
        id: i + 1,
        text: t.name,
        progress: t.progress || 0,
        parent: parentNum || 0,
        type: 'summary' as const,
        open: true,
      }
    }
    return {
      id: i + 1,
      text: t.name,
      start,
      duration: dur,
      progress: t.progress || 0,
      parent: parentNum || 0,
      type: 'task' as const,
    }
  })

  // Compute critical path IDs
  let criticalTaskIds = new Set<number>()
  if (showCriticalPath) {
    const schedulerTasks = tasks.filter((t: any) => t.type !== 'summary').map((t: any) => ({
      id: t.id, start: t.start, end: t.end || new Date(t.start.getTime() + (t.duration || 1) * 86400000),
      duration: t.duration || 1, type: t.type,
    }))
    const tempLinks = (data.dependencies || [])
      .map((d: any, i: number) => ({
        id: i + 1, source: uuidToId[d.fromId] || 0, target: uuidToId[d.toId] || 0,
        type: depTypeToSvar[d.type] || 'e2s',
      }))
      .filter((l: any) => l.source > 0 && l.target > 0)
    criticalTaskIds = findCriticalPath(schedulerTasks, tempLinks)
  }

  const links = (data.dependencies || [])
    .map((d: any, i: number) => ({
      id: i + 1,
      source: uuidToId[d.fromId] || 0,
      target: uuidToId[d.toId] || 0,
      type: (depTypeToSvar[d.type] || 'e2s') as any,
    }))
    .filter((l: any) => l.source > 0 && l.target > 0)

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" checked={showCriticalPath || false}
            onChange={() => onToggleCriticalPath?.()}
            className="checkbox" />
          Критический путь
        </label>
        {data.tasks.length > MAX_GANTT_TASKS && (
          <span className="text-xs text-amber-600">Показаны первые {MAX_GANTT_TASKS} из {data.tasks.length} задач</span>
        )}
      </div>
      <SVARWillow>
        <div style={{ width: '100%', height: Math.min(tasks.length * 38 + 120, 700) }}>
          <SVARGantt tasks={tasks} links={links} scales={GANTT_SCALES}
            schedule={{ auto: true }}
            highlightTime={highlightWeekends}
            taskTemplate={showCriticalPath ? (({ data: taskData }: any) => {
              const isCritical = criticalTaskIds.has(taskData.id)
              return (
                <div style={{
                  background: isCritical ? '#ef4444' : undefined,
                  borderRadius: 3, height: '100%', width: '100%',
                  display: 'flex', alignItems: 'center', paddingLeft: 8,
                  color: isCritical ? '#fff' : undefined,
                  fontSize: 12, fontWeight: isCritical ? 600 : 400, overflow: 'hidden',
                }}>
                  {taskData.text}
                </div>
              )
            }) : undefined}
            init={(svarApi: any) => {
              const fmt = (d: Date) => {
                const y = d.getFullYear()
                const m = String(d.getMonth() + 1).padStart(2, '0')
                const day = String(d.getDate()).padStart(2, '0')
                return `${y}-${m}-${day}`
              }
              const svarToDepType: Record<string, string> = { e2s: 'fs', s2s: 'ss', e2e: 'ff', s2e: 'sf' }

              svarApi.on('update-task', (ev: any) => {
                if (ev?.inProgress) return true
                if (ev?.eventSource === 'schedule-tasks') return true
                const { id, task } = ev || {}
                const uuid = idToUuid[id]
                if (uuid && task?.start && onTaskDateChange) {
                  let end = task.end
                  if (!end && task.duration) {
                    end = new Date(task.start.getTime())
                    end.setDate(end.getDate() + task.duration)
                  }
                  if (end) {
                    onTaskDateChange(uuid, fmt(task.start), fmt(end))

                    // Client-side cascade: shift dependent tasks
                    const svarTasks = tasks.map((t: any) => ({
                      id: t.id, start: t.start, end: t.end || new Date(t.start.getTime() + (t.duration || 1) * 86400000),
                      duration: t.duration || 1, type: t.type,
                    }))
                    const changed = svarTasks.find((t: any) => t.id === id)
                    if (changed) {
                      changed.start = task.start
                      changed.end = end
                      changed.duration = task.duration || Math.round((end.getTime() - task.start.getTime()) / 86400000)
                    }
                    const cascaded = cascadeSchedule(svarTasks, links, id)
                    cascaded.forEach(upd => {
                      svarApi.exec('update-task', {
                        id: upd.id,
                        task: { start: upd.start, duration: upd.duration, end: upd.end },
                        eventSource: 'schedule-tasks',
                      })
                      // Also save to backend
                      const cascUuid = idToUuid[upd.id]
                      if (cascUuid) onTaskDateChange(cascUuid, fmt(upd.start), fmt(upd.end))
                    })
                  }
                }
                return true
              })
              svarApi.on('add-link', (ev: any) => {
                const link = ev?.link
                if (link?.source && link?.target && onDependencyCreate) {
                  const fromUuid = idToUuid[link.source]
                  const toUuid = idToUuid[link.target]
                  if (fromUuid && toUuid) {
                    onDependencyCreate(fromUuid, toUuid, svarToDepType[link.type] || 'fs')
                  }
                }
                return true
              })
              svarApi.on('delete-link', (ev: any) => {
                if (ev?.id && onDependencyDelete) {
                  const depData = data.dependencies[ev.id - 1]
                  if (depData?.id) onDependencyDelete(depData.id)
                }
                return true
              })
            }}
          />
        </div>
      </SVARWillow>
    </div>
  )
}

function GanttTab({ obj }: { obj: any }) {
  const [ganttData, setGanttData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [ganttKey, setGanttKey] = useState(0)
  const [showCriticalPath, setShowCriticalPath] = useState(false)

  const loadGanttData = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.getObjectSubtree(obj.id),
      api.getDependencies(obj.id),
    ]).then(([subtree, deps]) => {
      setGanttData(toGanttData(subtree || [], deps || []))
      setGanttKey(k => k + 1)
    }).catch(() => {
      setGanttData({ tasks: [], dependencies: [] })
    }).finally(() => setLoading(false))
  }, [obj.id])

  useEffect(() => { loadGanttData() }, [loadGanttData])

  const handleTaskDateChange = async (taskId: string, start: string, end: string) => {
    await api.upsertOperationalPlan(taskId, { start_date: start, end_date: end })
  }

  const handleDependencyCreate = async (fromId: string, toId: string, type: string) => {
    await api.createDependency(obj.id, { predecessor_id: fromId, successor_id: toId, type })
    loadGanttData()
  }

  const handleDependencyDelete = async (depId: string) => {
    await api.deleteDependency(depId)
    loadGanttData()
  }

  if (loading && !ganttData) return <div className="text-sm text-gray-400 p-4">Загрузка диаграммы...</div>

  return (
    <div>
      <GanttWithRealData
        key={`${ganttKey}-${showCriticalPath}`}
        data={ganttData}
        onTaskDateChange={handleTaskDateChange}
        onDependencyCreate={handleDependencyCreate}
        onDependencyDelete={handleDependencyDelete}
        showCriticalPath={showCriticalPath}
        onToggleCriticalPath={() => setShowCriticalPath(p => !p)}
      />
    </div>
  )
}

// ─── Ref Tables Tab ─────────────────────────────────────

function RefTablesTab({ obj }: { obj: any }) {
  const [refTables, setRefTables] = useState<any[]>([])
  const [activeTable, setActiveTable] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!obj.type_id) return
    api.getTypeRefTables(obj.type_id).then(tables => {
      setRefTables(tables || [])
      if (tables?.length) setActiveTable(tables[0].id)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [obj.type_id])

  if (loading) return <div className="text-sm text-gray-400">Загрузка...</div>

  if (refTables.length === 0) {
    return (
      <div className="card">
        <div className="empty-state py-10">
          <p className="empty-state-text">Нет привязанных справочников</p>
          <p className="empty-state-hint">Привяжите справочники к типу объекта в администрировании</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table selector */}
      {refTables.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {refTables.map(t => (
            <button key={t.id} onClick={() => setActiveTable(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                activeTable === t.id ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {/* Active table */}
      {activeTable && (
        <RefTableDataView key={activeTable} tableId={activeTable} objectId={obj.id} />
      )}
    </div>
  )
}

function RefTableDataView({ tableId, objectId }: { tableId: string; objectId: string }) {
  const [table, setTable] = useState<any>(null)
  const [records, setRecords] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [addData, setAddData] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.getRefTable(tableId),
      api.getRefRecords(tableId, objectId),
    ]).then(([t, r]) => {
      setTable(t)
      setRecords(r || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [tableId, objectId])

  useEffect(() => { load() }, [load])

  const columns = (table?.columns || []).filter((c: any) => c.is_visible !== false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.createRefRecord(tableId, { object_id: objectId, data: addData })
    setShowAdd(false)
    setAddData({})
    load()
  }

  const handleUpdate = async () => {
    if (!editingId) return
    await api.updateRefRecord(editingId, { data: editData })
    setEditingId(null)
    load()
  }

  const handleDelete = async (id: string) => {
    await api.deleteRefRecord(id)
    load()
  }

  const startEdit = (rec: any) => {
    setEditingId(rec.id)
    setEditData(rec.data || {})
  }

  if (loading) return <div className="text-sm text-gray-400 p-4">Загрузка...</div>

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <h3 className="card-header-title">{table?.name || 'Справочник'}</h3>
          <span className="badge badge-gray">{records.length}</span>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setEditingId(null) }} className="btn-primary btn-sm">
          <Plus size={13} /> Добавить
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 bg-gray-50/50 border-b border-gray-100"
          style={{ animation: 'slideDown 0.2s ease-out' }}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {columns.map((col: any) => {
              const req = col.requisite || {}
              return (
                <div key={col.id}>
                  <label className="label">{req.name || 'Поле'}</label>
                  {renderFieldInput(req, addData[req.id] || '', v => setAddData({ ...addData, [req.id]: v }))}
                </div>
              )
            })}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary btn-xs">Сохранить</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary btn-xs">Отмена</button>
          </div>
        </form>
      )}

      {/* Table */}
      {columns.length === 0 ? (
        <div className="empty-state py-8">
          <p className="empty-state-text">Нет колонок</p>
          <p className="empty-state-hint">Добавьте реквизиты к справочнику в администрировании</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-16"></th>
                {columns.map((col: any) => (
                  <th key={col.id}>
                    <Link to="/admin/requisites" className="hover:text-primary-600 transition-colors">
                      {col.requisite?.name || '—'}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="text-center text-gray-400 py-8">Нет записей</td></tr>
              ) : records.map(rec => (
                editingId === rec.id ? (
                  <tr key={rec.id} className="bg-primary-50/20">
                    <td>
                      <div className="flex gap-1">
                        <button onClick={handleUpdate} className="btn-success btn-xs p-1"><Check size={12} /></button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary btn-xs p-1"><X size={12} /></button>
                      </div>
                    </td>
                    {columns.map((col: any) => {
                      const req = col.requisite || {}
                      return (
                        <td key={col.id}>
                          {renderFieldInput(req, editData[req.id] || '', v => setEditData({ ...editData, [req.id]: v }))}
                        </td>
                      )
                    })}
                  </tr>
                ) : (
                  <tr key={rec.id} className="group">
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(rec)} className="icon-btn reveal-on-hover p-1"><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(rec.id)} className="icon-btn-danger reveal-on-hover p-1"><Trash2 size={12} /></button>
                      </div>
                    </td>
                    {columns.map((col: any) => {
                      const req = col.requisite || {}
                      const val = rec.data?.[req.id]
                      return <td key={col.id}>{renderFieldValue(req, val)}</td>
                    })}
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Classifier Field (input + display) ─────────────────

interface ClassifierOption {
  id: string
  name: string
  level: number
  hasChildren: boolean
  locked: boolean
}

function ClassifierFieldInput({ req, value, onChange }: { req: any; value: string; onChange: (v: string) => void }) {
  const config = req.config || {}
  const baseType = config.base_object_type || 'none'
  const isHierarchical = config.hierarchical || baseType === 'project'
  const allowNodeSelect = config.allow_node_select !== false

  // For project-based: use tree picker
  if (baseType === 'project') {
    return <ProjectTreePicker value={value} onChange={onChange} multiple={config.multiple} rootId={config.root_project_id} />
  }

  // For standard classifier: flat or hierarchical dropdown
  return <StandardClassifierPicker
    reqId={req.id} value={value} onChange={onChange}
    multiple={config.multiple} hierarchical={isHierarchical} allowNodeSelect={allowNodeSelect} />
}

// ─── Project Tree Picker ────────────────────────────────

function ProjectTreePicker({ value, onChange, multiple, rootId }: { value: string; onChange: (v: string) => void; multiple?: boolean; rootId?: string }) {
  const [tree, setTree] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (rootId) {
      // Load subtree from root project
      api.getObjectSubtree(rootId).then(t => setTree(t || [])).catch(() => {})
    } else {
      api.getObjectTree().then(t => setTree(t || [])).catch(() => {})
    }
  }, [rootId])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selected = value ? String(value).split(',').filter(Boolean) : []

  const select = (id: string) => {
    if (multiple) {
      const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
      onChange(next.join(','))
    } else {
      onChange(id === value ? '' : id)
    }
  }

  const renderNode = (node: any, level = 0): React.ReactNode => {
    const hasKids = !!(node.children?.length)
    const isExpanded = expanded.has(node.id)
    const isSelected = selected.includes(node.id)
    const Icon = iconMap[node.type_icon] || kindIcons[node.type_kind] || Folder
    const color = node.type_color || '#3d5af5'

    return (
      <div key={node.id}>
        <div className={`flex items-center gap-1.5 py-1 rounded transition-colors ${
          isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
        }`} style={{ paddingLeft: `${level * 16 + 4}px` }}>
          {/* Expand toggle */}
          <button type="button" onClick={() => hasKids && toggleExpand(node.id)}
            className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-gray-400">
            {hasKids ? (isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
          </button>

          {/* Icon */}
          <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color + '18', color }}>
            <Icon size={9} />
          </div>

          {/* Name — clickable to select */}
          <button type="button" onClick={() => select(node.id)}
            className={`flex-1 text-left text-xs truncate transition-colors ${
              isSelected ? 'font-semibold text-primary-700' : 'text-gray-700 hover:text-primary-600'
            }`}>
            {node.name}
          </button>

          {/* Selected indicator */}
          {isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0 mr-1" />
          )}
        </div>

        {/* Children */}
        {hasKids && isExpanded && node.children.map((child: any) => renderNode(child, level + 1))}
      </div>
    )
  }

  return (
    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg py-1">
      {tree.length === 0 ? (
        <span className="text-xs text-gray-400 px-3 py-2 block">Нет проектов</span>
      ) : (
        tree.map(node => renderNode(node))
      )}
    </div>
  )
}

// ─── Standard Classifier Picker ─────────────────────────

function StandardClassifierPicker({ reqId, value, onChange, multiple, hierarchical, allowNodeSelect }: {
  reqId: string; value: string; onChange: (v: string) => void
  multiple?: boolean; hierarchical: boolean; allowNodeSelect: boolean
}) {
  const [options, setOptions] = useState<ClassifierOption[]>([])

  useEffect(() => {
    api.getClassifierValues(reqId).then(vals => {
      const flat: ClassifierOption[] = []
      const walk = (items: any[], level = 0) => {
        for (const item of items) {
          const hasKids = !!(item.children?.length)
          if (!item.is_locked) {
            flat.push({ id: item.id, name: item.name, level, hasChildren: hasKids, locked: false })
          }
          if (hasKids) walk(item.children, level + 1)
        }
      }
      walk(vals || [])
      setOptions(flat)
    }).catch(() => {})
  }, [reqId])

  const canSelect = (opt: ClassifierOption) => {
    if (!hierarchical) return true
    if (opt.hasChildren && !allowNodeSelect) return false
    return true
  }

  if (multiple) {
    const selected = value ? String(value).split(',').filter(Boolean) : []
    const toggle = (id: string) => {
      const next = selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
      onChange(next.join(','))
    }
    return (
      <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-1.5">
        {options.map(o => {
          const selectable = canSelect(o)
          return (
            <label key={o.id}
              className={`flex items-center gap-1.5 py-0.5 rounded text-xs ${
                selectable ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
              style={{ paddingLeft: `${o.level * 12 + 6}px` }}>
              <input type="checkbox" checked={selected.includes(o.id)}
                onChange={() => selectable && toggle(o.id)} disabled={!selectable}
                className="checkbox" style={{ width: 12, height: 12 }} />
              <span>{o.level > 0 && hierarchical ? '› ' : ''}{o.name}</span>
              {o.hasChildren && !allowNodeSelect && <span className="text-[9px] text-gray-400 ml-auto">группа</span>}
            </label>
          )
        })}
        {options.length === 0 && <span className="text-xs text-gray-400 px-1">Нет значений</span>}
      </div>
    )
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="select-sm">
      <option value="">—</option>
      {options.map(o => (
        <option key={o.id} value={o.id} disabled={!canSelect(o)}>
          {hierarchical ? '\u00A0\u00A0'.repeat(o.level) : ''}{o.level > 0 && hierarchical ? '› ' : ''}{o.name}
          {o.hasChildren && !allowNodeSelect ? ' (группа)' : ''}
        </option>
      ))}
    </select>
  )
}

function ClassifierFieldDisplay({ req, value }: { req: any; value: any }) {
  const config = req.config || {}
  const baseType = config.base_object_type || 'none'
  const navigate = useNavigate()
  const [labels, setLabels] = useState<Record<string, string>>({})

  const ids: string[] = value ? String(value).split(',').filter(Boolean) : []

  useEffect(() => {
    if (ids.length === 0) return
    if (baseType === 'project') {
      // Resolve project names
      Promise.all(ids.map(id => api.getObject(id).then((o: any) => ({ id, name: o.name })).catch(() => ({ id, name: id }))))
        .then(results => {
          const map: Record<string, string> = {}
          results.forEach(r => { map[r.id] = r.name })
          setLabels(map)
        })
    } else if (baseType === 'none') {
      api.getClassifierValues(req.id).then(vals => {
        const map: Record<string, string> = {}
        const walk = (items: any[]) => {
          for (const item of items) {
            map[item.id] = item.name
            if (item.children?.length) walk(item.children)
          }
        }
        walk(vals || [])
        setLabels(map)
      }).catch(() => {})
    }
  }, [value, req.id, baseType])

  if (ids.length === 0) return <span className="text-gray-300">—</span>

  return (
    <div className="flex flex-wrap gap-1">
      {ids.map(id => {
        const name = labels[id] || id
        if (baseType === 'project') {
          return (
            <span key={id} className="text-link text-xs cursor-pointer" onClick={() => navigate(`/projects/${id}`)}>
              {name}
            </span>
          )
        }
        return <span key={id} className="badge badge-blue">{name}</span>
      })}
    </div>
  )
}

// ─── Field renderers ────────────────────────────────────

function renderFieldInput(req: any, value: string, onChange: (v: string) => void) {
  const type = req.type || 'string'
  if (type === 'formula') {
    return <span className="text-sm text-gray-500 bg-gray-50 px-2 py-1 rounded">{value || '—'}</span>
  }
  if (type === 'classifier' || type === 'process') {
    return <ClassifierFieldInput req={req} value={value} onChange={onChange} />
  }
  if (type === 'number') {
    return <input type="number" value={value} onChange={e => onChange(e.target.value)} className="input input-sm" />
  }
  if (type === 'date') {
    return <input type="date" value={value} onChange={e => onChange(e.target.value)} className="input input-sm" />
  }
  if (type === 'boolean') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className="select-sm">
        <option value="">—</option>
        <option value="true">Да</option>
        <option value="false">Нет</option>
      </select>
    )
  }
  return <input value={value} onChange={e => onChange(e.target.value)} className="input input-sm" />
}

function renderFieldValue(req: any, value: any) {
  if (value === undefined || value === null || value === '') return <span className="text-gray-300">—</span>
  const type = req.type || 'string'
  const config = req.config || {}

  if (type === 'classifier' || type === 'process') {
    return <ClassifierFieldDisplay req={req} value={value} />
  }
  if (type === 'boolean') return <span>{value === 'true' || value === true ? 'Да' : 'Нет'}</span>
  if (type === 'string' && config.format === 'url') return <a href={String(value)} target="_blank" className="text-link truncate">{String(value)}</a>
  if (type === 'string' && config.format === 'email') return <a href={`mailto:${value}`} className="text-link">{String(value)}</a>
  if (type === 'number' && config.format === 'money') {
    const num = Number(value)
    return <span>{isNaN(num) ? value : num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
  }
  if (type === 'number' && config.format === 'percent') return <span>{value}%</span>
  if (type === 'date') return <span>{value}</span>
  if (type === 'formula') {
    const num = Number(value)
    if (isNaN(num)) return <span className="text-gray-300">—</span>
    return <span className="font-mono text-primary-700 font-medium">{num.toLocaleString('ru-RU')}</span>
  }
  return <span className="truncate max-w-[200px] inline-block">{String(value)}</span>
}

// ─── Events Tab ─────────────────────────────────────────

function EventsTab() {
  return (
    <div className="max-w-4xl">
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-gray-400" />
            <h3 className="card-header-title">Лента событий</h3>
          </div>
        </div>
        <div className="card-body">
          <div className="empty-state py-8">
            <Clock size={28} className="empty-state-icon" />
            <p className="empty-state-text">Нет событий</p>
            <p className="empty-state-hint">Лента событий будет реализована позже</p>
          </div>
        </div>
      </div>
    </div>
  )
}
