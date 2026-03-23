import { useEffect, useState, useMemo, useCallback } from 'react'
import { api } from '../lib/api'
import { BarChart3, Database, FolderTree, X, ChevronDown } from 'lucide-react'
import PivotView from '../components/analytics/PivotView'

export default function AnalyticsPage() {
  const [refTables, setRefTables] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)

  // Loaded data
  const [records, setRecords] = useState<Record<string, any>[]>([])
  const [columns, setColumns] = useState<{ id: string; name: string; type: string }[]>([])

  useEffect(() => {
    Promise.all([
      api.getRefTables(),
      api.getObjects({ status: 'in_progress' }).catch(() => []),
    ]).then(([tables, objs]) => {
      setRefTables(tables || [])
      setProjects(objs || [])
    }).finally(() => setLoading(false))
  }, [])

  const loadData = useCallback(async () => {
    if (selectedTables.length === 0) {
      setRecords([])
      setColumns([])
      return
    }
    setDataLoading(true)
    try {
      // Load table metadata + records for each selected table
      const allColumns: { id: string; name: string; type: string }[] = []
      const allRecords: Record<string, any>[] = []
      const seenColIds = new Set<string>()

      await Promise.all(selectedTables.map(async (tableId) => {
        const [table, recs] = await Promise.all([
          api.getRefTable(tableId),
          api.getRefRecords(tableId, selectedProject || undefined),
        ])

        // Collect columns
        const tableName = table?.name || ''
        for (const col of (table?.columns || [])) {
          const req = col.requisite
          if (!req || seenColIds.has(req.id)) continue
          seenColIds.add(req.id)
          allColumns.push({ id: req.id, name: req.name, type: req.type })
        }

        // Collect records, inject _table metadata
        for (const rec of (recs || [])) {
          const row: Record<string, any> = { ...(rec.data || {}) }
          row['__table'] = tableName
          allRecords.push(row)
        }
      }))

      // Add the virtual __table column
      allColumns.unshift({ id: '__table', name: 'Справочник', type: 'string' })

      setColumns(allColumns)
      setRecords(allRecords)
    } catch {
      setRecords([])
      setColumns([])
    } finally {
      setDataLoading(false)
    }
  }, [selectedTables, selectedProject])

  useEffect(() => { loadData() }, [loadData])

  const toggleTable = (id: string) => {
    setSelectedTables(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const selectedTableNames = useMemo(() => {
    return selectedTables.map(id => refTables.find(t => t.id === id)?.name || id)
  }, [selectedTables, refTables])

  if (loading) return <div className="page"><div className="text-sm text-gray-400">Загрузка...</div></div>

  return (
    <div className="page-wide space-y-5" style={{ animation: 'slideDown 0.3s ease-out' }}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
          <BarChart3 size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="page-title">Аналитика</h1>
          <p className="page-subtitle">Сводные таблицы по данным справочников</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="card">
        <div className="px-5 py-4 flex items-start gap-6">
          {/* Ref table multi-select */}
          <div className="flex-1 min-w-0">
            <label className="label">Справочники</label>
            <RefTableMultiSelect
              tables={refTables}
              selected={selectedTables}
              onToggle={toggleTable}
            />
            {selectedTableNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedTableNames.map((name, i) => (
                  <span key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-xs font-medium">
                    <Database size={10} />
                    {name}
                    <button onClick={() => toggleTable(selectedTables[i])}
                      className="ml-0.5 hover:text-primary-900 transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Project filter */}
          <div className="w-72 flex-shrink-0">
            <label className="label">Проект (опционально)</label>
            <div className="relative">
              <FolderTree size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="select pl-9"
              >
                <option value="">Все проекты</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        {records.length > 0 && (
          <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center gap-6">
            <Stat label="Записей" value={records.length} />
            <Stat label="Полей" value={columns.length - 1} />
            <Stat label="Справочников" value={selectedTables.length} />
          </div>
        )}
      </div>

      {/* Pivot workspace */}
      {selectedTables.length === 0 ? (
        <div className="card">
          <div className="empty-state py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <BarChart3 size={24} className="text-gray-400" />
            </div>
            <p className="empty-state-text">Выберите справочники для анализа</p>
            <p className="empty-state-hint">Перетаскивайте поля для построения сводной таблицы</p>
          </div>
        </div>
      ) : dataLoading ? (
        <div className="card">
          <div className="p-12 text-center text-sm text-gray-400">Загрузка данных...</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-header-title">Сводная таблица</h2>
            <span className="badge badge-primary">{records.length} записей</span>
          </div>
          <div className="p-0">
            <PivotView data={records} columns={columns} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-bold text-gray-900 tabular-nums">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}

function RefTableMultiSelect({ tables, selected, onToggle }: {
  tables: any[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="select w-full text-left flex items-center justify-between"
      >
        <span className={selected.length ? 'text-gray-900' : 'text-gray-400'}>
          {selected.length
            ? `Выбрано: ${selected.length}`
            : '— Выбрать справочники —'}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="dropdown z-50 mt-1 w-full max-h-64 overflow-y-auto" style={{ position: 'absolute', left: 0, right: 0 }}>
            {tables.map(t => (
              <label key={t.id}
                className="dropdown-item cursor-pointer"
                onClick={() => onToggle(t.id)}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => {}}
                  className="checkbox"
                />
                <Database size={13} className="text-gray-400" />
                <span className="flex-1">{t.name}</span>
              </label>
            ))}
            {tables.length === 0 && (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">Нет справочников</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
