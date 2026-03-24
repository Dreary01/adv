import { useEffect, useState, useMemo } from 'react'
import type { WidgetProps } from '../../../lib/widget-types'
import { api } from '../../../lib/api'
import SvarGrid from '../../ui/SvarGrid'

export default function TableWidget({ obj, config, customTitle }: WidgetProps) {
  if (!config) return null
  const [rows, setRows] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [config.dataSource, obj])

  async function loadData() {
    const ds = config!.dataSource
    if (!ds) return

    if (ds.kind === 'ref-records' && ds.refTableId) {
      const [table, records] = await Promise.all([
        api.getRefTable(ds.refTableId),
        api.getRefRecords(ds.refTableId, obj?.id),
      ])
      const cols = config!.columns || table.columns?.map((c: any) => c.requisite_name) || []
      setColumns(cols)
      const limited = ds.limit ? records.slice(0, ds.limit) : records
      setRows(limited.map((r: any) => {
        const row: Record<string, any> = {}
        for (const col of cols) {
          row[col] = r.data?.[col] ?? '—'
        }
        return row
      }))
    } else if (ds.kind === 'objects') {
      // Future: query objects with filters
      setColumns(['name', 'status', 'progress'])
      setRows([])
    } else if (ds.kind === 'todos') {
      const todos = await api.getTodos()
      const limited = ds.limit ? todos.slice(0, ds.limit) : todos
      setColumns(['title', 'is_done', 'due_date'])
      setRows(limited)
    }
  }

  return (
    <div className="card h-full">
      {customTitle && (
        <div className="card-header">
          <h3 className="card-header-title">{customTitle}</h3>
        </div>
      )}
      <div className="card-body p-0">
        {loading ? (
          <div className="p-4 space-y-2">
            <div className="h-4 bg-gray-100 rounded w-full animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">Нет данных</div>
        ) : (
          <SvarGrid
            data={rows.map((r, i) => ({ id: i, ...r }))}
            columns={columns.map(col => ({ id: col, header: col, flexgrow: 1 }))}
          />
        )}
      </div>
    </div>
  )
}
