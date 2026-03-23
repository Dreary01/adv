import { useState, useCallback, useMemo } from 'react'
import PivotTableUI from 'react-pivottable/PivotTableUI'
import TableRenderers from 'react-pivottable/TableRenderers'
import 'react-pivottable/pivottable.css'

interface PivotViewProps {
  data: Record<string, any>[]
  columns: { id: string; name: string; type: string }[]
}

/**
 * Reusable pivot table wrapper.
 * Transforms raw ref-record data (keyed by requisite UUID) into
 * human-readable rows keyed by requisite name, then renders PivotTableUI.
 */
export default function PivotView({ data, columns }: PivotViewProps) {
  const [pivotState, setPivotState] = useState<any>({})

  // Build a UUID → name map for column headers
  const idToName = useMemo(() => {
    const map: Record<string, string> = {}
    columns.forEach(c => { map[c.id] = c.name })
    return map
  }, [columns])

  // Transform rows: replace UUID keys with human-readable names
  const rows = useMemo(() => {
    return data.map(record => {
      const row: Record<string, any> = {}
      for (const [key, value] of Object.entries(record)) {
        const name = idToName[key]
        if (name) {
          row[name] = value ?? ''
        }
      }
      return row
    })
  }, [data, idToName])

  const handleChange = useCallback((s: any) => {
    // Strip `data` from persisted state to avoid stale refs
    const { data: _d, ...rest } = s
    setPivotState(rest)
  }, [])

  if (rows.length === 0) {
    return (
      <div className="empty-state py-12">
        <p className="empty-state-text">Нет данных для анализа</p>
        <p className="empty-state-hint">Добавьте записи в справочник</p>
      </div>
    )
  }

  return (
    <div className="adv-pivot-wrap">
      <PivotTableUI
        data={rows}
        onChange={handleChange}
        renderers={TableRenderers}
        {...pivotState}
      />
    </div>
  )
}
