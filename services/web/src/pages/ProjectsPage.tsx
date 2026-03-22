import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import {
  Plus, ChevronRight, ChevronDown, Search, Filter, X, Trash2,
  Folder, Target, CheckSquare, Briefcase, Flag, Users, Layers,
  Settings as SettingsIcon, List, LayoutGrid, GripVertical,
  Eye, EyeOff, ChevronLeft, ChevronsLeft, ChevronsRight,
  MoreHorizontal, ExternalLink, Calendar, FileText, Activity, User
} from 'lucide-react'
import ConfirmDeleteDialog from '../components/ui/ConfirmDeleteDialog'

// ─── Config ─────────────────────────────────────────────

const iconMap: Record<string, any> = {
  briefcase: Briefcase, folder: Folder, target: Target, layers: Layers,
  'check-square': CheckSquare, flag: Flag, users: Users, settings: SettingsIcon,
}
const kindIcons: Record<string, any> = { directory: Folder, project: Target, task: CheckSquare }

const statusConfig: Record<string, { label: string; cls: string }> = {
  not_started: { label: 'Не начат', cls: 'status-not-started' },
  in_progress: { label: 'В работе', cls: 'status-in-progress' },
  completed: { label: 'Завершен', cls: 'status-completed' },
  on_hold: { label: 'Приостановлен', cls: 'status-on-hold' },
  cancelled: { label: 'Отменен', cls: 'status-cancelled' },
}

const priorityConfig: Record<number, { label: string; color: string }> = {
  4: { label: 'Критический', color: 'text-red-600' },
  3: { label: 'Высокий', color: 'text-orange-500' },
  2: { label: 'Средний', color: 'text-yellow-500' },
  1: { label: 'Низкий', color: 'text-blue-400' },
}

const ITEMS_PER_PAGE = 100

// All possible columns for detailed view
const ALL_COLUMNS = [
  { id: 'status', label: 'Статус', defaultVisible: true },
  { id: 'progress', label: 'Прогресс', defaultVisible: true },
  { id: 'assignee', label: 'Исполнитель', defaultVisible: true },
  { id: 'priority', label: 'Приоритет', defaultVisible: false },
  { id: 'type', label: 'Тип', defaultVisible: false },
  { id: 'created', label: 'Дата создания', defaultVisible: false },
  { id: 'updated', label: 'Дата изменения', defaultVisible: false },
]

// ─── Helpers ────────────────────────────────────────────

function flattenTree(nodes: any[], result: any[] = [], level = 0, openSet: Set<string> | null = null): any[] {
  for (const node of nodes) {
    result.push({ ...node, _level: level })
    if (node.children?.length && (!openSet || openSet.has(node.id))) {
      flattenTree(node.children, result, level + 1, openSet)
    }
  }
  return result
}

function matchesFilter(node: any, search: string, statusFilter: string, typeFilter: string, priorityFilter: string): boolean {
  const matchSelf =
    (!search || node.name.toLowerCase().includes(search.toLowerCase())) &&
    (!statusFilter || node.status === statusFilter) &&
    (!typeFilter || node.type_id === typeFilter) &&
    (!priorityFilter || String(node.priority) === priorityFilter)
  if (matchSelf) return true
  if (node.children) return node.children.some((c: any) => matchesFilter(c, search, statusFilter, typeFilter, priorityFilter))
  return false
}

function filterTree(nodes: any[], search: string, statusFilter: string, typeFilter: string, priorityFilter: string): any[] {
  if (!search && !statusFilter && !typeFilter && !priorityFilter) return nodes
  return nodes
    .filter(n => matchesFilter(n, search, statusFilter, typeFilter, priorityFilter))
    .map(n => ({
      ...n,
      children: n.children ? filterTree(n.children, search, statusFilter, typeFilter, priorityFilter) : []
    }))
}

function collectAllIds(nodes: any[]): string[] {
  const ids: string[] = []
  for (const n of nodes) {
    ids.push(n.id)
    if (n.children) ids.push(...collectAllIds(n.children))
  }
  return ids
}

function countVisibleNodes(nodes: any[]): number {
  let count = 0
  for (const n of nodes) {
    count++
    if (n.children) count += countVisibleNodes(n.children)
  }
  return count
}

// ─── Quick Menu Popup ───────────────────────────────────

function QuickMenu({ node, onClose, onOpen, onDelete, anchorRef }: {
  node: any; onClose: () => void; onOpen: (id: string) => void; onDelete: (node: any) => void; anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      const menuW = 180
      let left = rect.right - menuW
      let top = rect.bottom + 4
      // keep within viewport
      if (left < 8) left = 8
      if (top + 220 > window.innerHeight) top = rect.top - 220
      setPos({ top, left })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const items = [
    { icon: ExternalLink, label: 'Открыть карточку', action: () => { onOpen(node.id); onClose() }, danger: false },
    { icon: FileText, label: 'Документы', action: onClose, danger: false },
    { icon: Calendar, label: 'Календарь', action: onClose, danger: false },
    { icon: Activity, label: 'Лента событий', action: onClose, danger: false },
    { icon: Users, label: 'Участники', action: onClose, danger: false },
  ]

  return createPortal(
    <div ref={ref} className="dropdown fixed" style={{ top: pos.top, left: pos.left }}>
      {items.map((item, i) => (
        <button key={i} onClick={item.action} className="dropdown-item">
          <item.icon size={14} className="text-gray-400" />
          {item.label}
        </button>
      ))}
      <div className="border-t border-gray-100 my-1" />
      <button onClick={() => { onDelete(node); onClose() }}
        className="dropdown-item text-red-600 hover:bg-red-50">
        <Trash2 size={14} /> Удалить
      </button>
    </div>,
    document.body
  )
}

// ─── Tree Row ───────────────────────────────────────────

function TreeRow({ node, level, isOpen, onToggle, onOpen, onDelete, viewMode, visibleColumns, dragState, onDragStart, onDragOver, onDrop }: {
  node: any; level: number; isOpen: boolean; onToggle: (id: string) => void
  onOpen: (id: string) => void; onDelete: (node: any) => void; viewMode: 'brief' | 'detailed'; visibleColumns: string[]
  dragState: { dragging: string | null; over: string | null; shift: boolean }
  onDragStart: (id: string, e: React.DragEvent) => void
  onDragOver: (id: string, e: React.DragEvent) => void
  onDrop: (id: string, e: React.DragEvent) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const hasChildren = node.children && node.children.length > 0
  const st = statusConfig[node.status] || statusConfig.not_started
  const Icon = iconMap[node.type_icon] || kindIcons[node.type_kind] || CheckSquare
  const color = node.type_color || '#3d5af5'

  const isDragOver = dragState.over === node.id
  const isDragging = dragState.dragging === node.id

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(node.id, e)}
      onDragOver={(e) => onDragOver(node.id, e)}
      onDrop={(e) => onDrop(node.id, e)}
      className={`tree-row group relative
        ${isDragOver && dragState.shift ? 'tree-row-dragover-parent' : isDragOver ? 'tree-row-dragover' : ''}
        ${isDragging ? 'tree-row-dragging' : ''}
      `}
      style={{ paddingLeft: `${level * 24 + 12}px` }}
    >
      {/* Drag handle */}
      <div className="w-4 flex-shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500">
        <GripVertical size={14} />
      </div>

      {/* Expand/collapse */}
      <div className="w-4 flex-shrink-0 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}>
        {hasChildren ? (
          isOpen
            ? <ChevronDown size={14} className="text-gray-400" />
            : <ChevronRight size={14} className="text-gray-400" />
        ) : null}
      </div>

      {/* Type icon */}
      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: color + '20', color }}>
        <Icon size={13} />
      </div>

      {/* Name */}
      <span className="text-sm font-medium text-primary-600 hover:underline flex-1 truncate cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onOpen(node.id) }}>
        {node.name}
      </span>

      {/* Columns based on view mode */}
      {viewMode === 'brief' ? (
        <>
          {/* Progress */}
          <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
            <div className="flex-1 progress-bar">
              <div className="progress-bar-fill progress-bar-fill-green" style={{ width: `${node.progress}%` }} />
            </div>
            <span className="text-2xs text-gray-400 w-7 text-right">{node.progress}%</span>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-1 flex-shrink-0 w-28">
            {node.assignee_id ? (
              <>
                <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <User size={10} className="text-gray-500" />
                </div>
                <span className="text-[11px] text-gray-500 truncate">Исполнитель</span>
              </>
            ) : (
              <span className="text-[11px] text-gray-300">—</span>
            )}
          </div>
        </>
      ) : (
        <>
          {visibleColumns.includes('status') && (
            <span className={`${st.cls} flex-shrink-0`}>{st.label}</span>
          )}

          {visibleColumns.includes('progress') && (
            <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${node.progress}%` }} />
              </div>
              <span className="text-[11px] text-gray-400 w-7 text-right">{node.progress}%</span>
            </div>
          )}

          {visibleColumns.includes('assignee') && (
            <div className="flex items-center gap-1 flex-shrink-0 w-28">
              {node.assignee_id ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <User size={10} className="text-gray-500" />
                  </div>
                  <span className="text-[11px] text-gray-500 truncate">Исполнитель</span>
                </>
              ) : (
                <span className="text-[11px] text-gray-300">—</span>
              )}
            </div>
          )}

          {visibleColumns.includes('priority') && (
            <span className={`text-[11px] font-medium flex-shrink-0 w-20 text-center ${
              priorityConfig[node.priority]?.color || 'text-gray-300'
            }`}>
              {priorityConfig[node.priority]?.label || '—'}
            </span>
          )}

          {visibleColumns.includes('type') && (
            <span className="text-[11px] text-gray-400 flex-shrink-0 w-24 text-right truncate">
              {node.type_name}
            </span>
          )}

          {visibleColumns.includes('created') && (
            <span className="text-[11px] text-gray-400 flex-shrink-0 w-20 text-center">
              {new Date(node.created_at).toLocaleDateString('ru')}
            </span>
          )}

          {visibleColumns.includes('updated') && (
            <span className="text-[11px] text-gray-400 flex-shrink-0 w-20 text-center">
              {new Date(node.updated_at).toLocaleDateString('ru')}
            </span>
          )}
        </>
      )}

      {/* Quick menu button (on hover) */}
      <div className="flex-shrink-0">
        <button
          ref={menuBtnRef}
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all text-gray-400">
          <MoreHorizontal size={14} />
        </button>
        {showMenu && <QuickMenu node={node} onClose={() => setShowMenu(false)} onOpen={onOpen} onDelete={onDelete} anchorRef={menuBtnRef} />}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tree, setTree] = useState<any[]>([])
  const [types, setTypes] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', type_id: '', status: 'not_started' })

  // Helpers to sync state with URL
  const getParam = (key: string, fallback = '') => searchParams.get(key) || fallback
  const setParam = (updates: Record<string, string>) => {
    setSearchParams(prev => {
      for (const [k, v] of Object.entries(updates)) {
        if (v) prev.set(k, v); else prev.delete(k)
      }
      return prev
    }, { replace: true })
  }

  // View mode from URL
  const viewMode = (getParam('view') || 'brief') as 'brief' | 'detailed'
  const setViewMode = (v: 'brief' | 'detailed') => setParam({ view: v === 'brief' ? '' : v })

  // Visible columns for detailed view
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id)
  )
  const [showColumnPicker, setShowColumnPicker] = useState(false)

  // Filters from URL
  const search = getParam('search')
  const statusFilter = getParam('status')
  const typeFilter = getParam('type')
  const priorityFilter = getParam('priority')
  const quickFilter = getParam('quick') as '' | 'on_control' | 'on_execution'
  const showFilters = !!(search || statusFilter || typeFilter || priorityFilter || quickFilter || getParam('filters'))

  const setSearch = (v: string) => setParam({ search: v })
  const setStatusFilter = (v: string) => setParam({ status: v })
  const setTypeFilter = (v: string) => setParam({ type: v })
  const setPriorityFilter = (v: string) => setParam({ priority: v })
  const setQuickFilter = (v: '' | 'on_control' | 'on_execution') => setParam({ quick: v })
  const setShowFilters = (v: boolean) => setParam({ filters: v ? '1' : '' })

  // Tree open/close state — persisted in sessionStorage
  const STORAGE_KEY = 'adv_tree_open'
  const [openNodes, _setOpenNodes] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) return new Set(JSON.parse(saved))
    } catch {}
    return new Set<string>()
  })
  const setOpenNodes = useCallback((update: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    _setOpenNodes(prev => {
      const next = typeof update === 'function' ? update(prev) : update
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  // Pagination from URL
  const currentPage = Math.max(1, parseInt(getParam('page', '1')))
  const setCurrentPage = (p: number | ((prev: number) => number)) => {
    const next = typeof p === 'function' ? p(currentPage) : p
    setParam({ page: next > 1 ? String(next) : '' })
  }

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<any>(null)

  // Drag & drop
  const [dragState, setDragState] = useState<{ dragging: string | null; over: string | null; shift: boolean }>({
    dragging: null, over: null, shift: false
  })

  const load = () => {
    api.getObjectTree().then(data => {
      setTree(data || [])
      // Auto-open first 2 levels only if nothing is saved
      if (!sessionStorage.getItem(STORAGE_KEY)) {
        const ids = new Set<string>()
        const autoOpen = (nodes: any[], level: number) => {
          for (const n of nodes) {
            if (level < 2) {
              ids.add(n.id)
              if (n.children) autoOpen(n.children, level + 1)
            }
          }
        }
        autoOpen(data || [], 0)
        setOpenNodes(ids)
      }
    }).catch(() => {})
    api.getObjectTypes().then(setTypes).catch(() => {})
  }

  useEffect(() => { load() }, [])

  // Shift key tracking for drag-and-drop
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setDragState(s => ({ ...s, shift: true }))
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setDragState(s => ({ ...s, shift: false }))
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.createObject(form)
    setShowCreate(false)
    setForm({ name: '', type_id: '', status: 'not_started' })
    load()
  }

  const toggleNode = useCallback((id: string) => {
    setOpenNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setOpenNodes(new Set(collectAllIds(tree)))
  }, [tree])

  const collapseAll = useCallback(() => {
    setOpenNodes(new Set())
  }, [])

  // Apply filters
  const filteredTree = filterTree(tree, search, statusFilter, typeFilter, priorityFilter)

  // Flatten for rendering
  const flatNodes = flattenTree(filteredTree, [], 0, openNodes)
  const totalNodes = flatNodes.length

  // Pagination
  const totalPages = Math.ceil(totalNodes / ITEMS_PER_PAGE)
  const needsPagination = totalNodes > ITEMS_PER_PAGE
  const pagedNodes = needsPagination
    ? flatNodes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
    : flatNodes

  // Drag handlers
  const handleDragStart = (id: string, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragState(s => ({ ...s, dragging: id }))
  }

  const handleDragOver = (id: string, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== dragState.dragging) {
      setDragState(s => ({ ...s, over: id }))
    }
  }

  const handleDrop = async (targetId: string, e: React.DragEvent) => {
    e.preventDefault()
    const sourceId = dragState.dragging
    if (!sourceId || sourceId === targetId) {
      setDragState({ dragging: null, over: null, shift: false })
      return
    }

    try {
      if (dragState.shift) {
        // Shift+drag: change parent
        await api.moveObject(sourceId, { parent_id: targetId })
      } else {
        // Normal drag: reorder (place source before target at same level)
        const targetNode = flatNodes.find(n => n.id === targetId)
        const sourceNode = flatNodes.find(n => n.id === sourceId)
        if (targetNode && sourceNode) {
          // Get siblings of target
          const parentId = targetNode.parent_id || null
          const siblings = flatNodes.filter(n => (n.parent_id || null) === parentId && n._level === targetNode._level)
          const ids = siblings.map((s: any) => s.id).filter((id: string) => id !== sourceId)
          const targetIndex = ids.indexOf(targetId)
          ids.splice(targetIndex, 0, sourceId)

          // If source comes from different parent, move it first
          if ((sourceNode.parent_id || null) !== parentId) {
            await api.moveObject(sourceId, { parent_id: parentId })
          }
          await api.reorderObjects(ids)
        }
      }
      load()
    } catch (err) {
      console.error('Move failed:', err)
    }

    setDragState({ dragging: null, over: null, shift: false })
  }

  const handleDragEnd = () => {
    setDragState({ dragging: null, over: null, shift: false })
  }

  const toggleColumn = (colId: string) => {
    setVisibleColumns(prev =>
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    )
  }

  const rootTypes = types.filter(t => t.can_be_root)
  const hasActiveFilters = search || statusFilter || typeFilter || priorityFilter || quickFilter

  return (
    <div className="page-wide">
      {/* Header */}
      <div className="page-header mb-4">
        <div>
          <h1 className="page-title">Дерево проектов</h1>
          <p className="page-subtitle">Иерархическая структура объектов</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode('brief')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition ${
                viewMode === 'brief' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
              }`}>
              <List size={14} /> Краткий
            </button>
            <button onClick={() => setViewMode('detailed')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition ${
                viewMode === 'detailed' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
              }`}>
              <LayoutGrid size={14} /> Подробный
            </button>
          </div>

          {/* Show/hide columns (detailed only) */}
          {viewMode === 'detailed' && (
            <div className="relative">
              <button onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
                {showColumnPicker ? <EyeOff size={14} /> : <Eye size={14} />}
                Скрытые поля
              </button>
              {showColumnPicker && (
                <div className="dropdown right-0 top-full mt-1 py-2 min-w-[200px]">
                  <p className="px-3 py-1 text-xs font-medium text-gray-500 uppercase">Колонки</p>
                  {ALL_COLUMNS.map(col => (
                    <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={visibleColumns.includes(col.id)}
                        onChange={() => toggleColumn(col.id)}
                        className="checkbox" />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition ${
              showFilters || hasActiveFilters ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            <Filter size={14} />
            {hasActiveFilters ? 'Фильтры активны' : 'Открыть фильтр'}
          </button>

          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary">
            <Plus size={16} /> Добавить направление
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="filter-bar">
          {/* Quick filters */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase mr-2">Быстрые фильтры:</span>
            <button onClick={() => setQuickFilter(quickFilter === 'on_control' ? '' : 'on_control')}
              className={`filter-chip ${quickFilter === 'on_control' ? 'filter-chip-active' : 'filter-chip-inactive'}`}>
              На контроле
            </button>
            <button onClick={() => setQuickFilter(quickFilter === 'on_execution' ? '' : 'on_execution')}
              className={`filter-chip ${quickFilter === 'on_execution' ? 'filter-chip-active' : 'filter-chip-inactive'}`}>
              На исполнении
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1) }}
                placeholder="Поиск по названию..."
                className="input input-sm pl-9" />
            </div>

            {/* Status filter */}
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1) }}
              className="select-sm w-auto">
              <option value="">Все статусы</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            {/* Type filter */}
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1) }}
              className="select-sm w-auto">
              <option value="">Все типы</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            {/* Priority filter */}
            <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setCurrentPage(1) }}
              className="select-sm w-auto">
              <option value="">Все приоритеты</option>
              {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            {/* Clear */}
            {hasActiveFilters && (
              <button onClick={() => {
                setParam({ search: '', status: '', type: '', priority: '', quick: '', page: '', filters: '' })
              }} className="btn-danger-ghost btn-sm">
                <X size={14} /> Сбросить
              </button>
            )}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="form-section">
          <h3 className="form-section-title">Добавить корневой объект</h3>
          <div className="form-grid">
            <div>
              <label className="label">Название *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="input" required />
            </div>
            <div>
              <label className="label">Тип объекта *</label>
              <select value={form.type_id} onChange={e => setForm({ ...form, type_id: e.target.value })}
                className="select" required>
                <option value="">— Выбрать —</option>
                {rootTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary btn-sm">Создать</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost btn-sm">отмена</button>
          </div>
        </form>
      )}

      {/* Tree */}
      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50/50">
          <span className="text-xs text-gray-400">
            {totalNodes} {totalNodes === 1 ? 'объект' : totalNodes < 5 ? 'объекта' : 'объектов'}
          </span>
          <span className="text-xs text-gray-300">|</span>
          <button onClick={expandAll} className="text-xs text-link">развернуть все уровни</button>
          <button onClick={collapseAll} className="text-xs text-link">свернуть все уровни</button>
          {dragState.dragging && (
            <>
              <span className="text-xs text-gray-300">|</span>
              <span className="text-xs text-amber-600">
                Shift + перетаскивание = смена родителя
              </span>
            </>
          )}
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/70 border-b border-gray-200 text-2xs font-semibold text-gray-400 uppercase tracking-wider">
          <div className="w-4 flex-shrink-0" /> {/* drag handle space */}
          <div className="w-4 flex-shrink-0" /> {/* chevron */}
          <div className="w-6 flex-shrink-0" /> {/* icon */}
          <span className="flex-1">Название</span>
          {viewMode === 'brief' ? (
            <>
              <span className="w-24 text-center">Прогресс</span>
              <span className="w-28 text-center">Исполнитель</span>
            </>
          ) : (
            <>
              {visibleColumns.includes('status') && <span className="w-24 text-center">Статус</span>}
              {visibleColumns.includes('progress') && <span className="w-24 text-center">Прогресс</span>}
              {visibleColumns.includes('assignee') && <span className="w-28 text-center">Исполнитель</span>}
              {visibleColumns.includes('priority') && <span className="w-20 text-center">Приоритет</span>}
              {visibleColumns.includes('type') && <span className="w-24 text-right">Тип</span>}
              {visibleColumns.includes('created') && <span className="w-20 text-center">Создан</span>}
              {visibleColumns.includes('updated') && <span className="w-20 text-center">Изменен</span>}
            </>
          )}
          <div className="w-6 flex-shrink-0" /> {/* menu */}
        </div>

        {/* Rows */}
        {pagedNodes.length === 0 ? (
          <div className="empty-state">
            <Folder size={32} className="empty-state-icon" />
            <p className="empty-state-text">Дерево проектов пусто</p>
            <p className="empty-state-hint">Добавьте корневое направление, чтобы начать</p>
          </div>
        ) : (
          <div onDragEnd={handleDragEnd}>
            {pagedNodes.map((node: any) => (
              <TreeRow
                key={node.id}
                node={node}
                level={node._level}
                isOpen={openNodes.has(node.id)}
                onToggle={toggleNode}
                onOpen={(id) => navigate(`/projects/${id}`)}
                onDelete={setDeleteTarget}
                viewMode={viewMode}
                visibleColumns={visibleColumns}
                dragState={dragState}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {needsPagination && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
            <span className="text-xs text-gray-500">
              {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, totalNodes)} из {totalNodes}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(1)}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600">
                <ChevronsLeft size={14} />
              </button>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600">
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page: number
                if (totalPages <= 5) page = i + 1
                else if (currentPage <= 3) page = i + 1
                else if (currentPage >= totalPages - 2) page = totalPages - 4 + i
                else page = currentPage - 2 + i
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      page === currentPage ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                    }`}>
                    {page}
                  </button>
                )
              })}

              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600">
                <ChevronRight size={14} />
              </button>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600">
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDeleteDialog
          objectId={deleteTarget.id}
          objectName={deleteTarget.name}
          onConfirm={() => { setDeleteTarget(null); load() }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
