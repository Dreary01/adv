import { useEffect, useRef, useCallback } from 'react'
import type { GanttRendererProps } from '../../lib/gantt-types'

// GSTC dynamic import — loaded only when this component mounts
let GSTC: any = null
let gstcLoaded = false

async function loadGSTC() {
  if (gstcLoaded) return GSTC
  const mod = await import('gantt-schedule-timeline-calendar')
  GSTC = mod.default || mod
  gstcLoaded = true
  return GSTC
}

const statusColors: Record<string, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#10b981',
  on_hold: '#f59e0b',
  cancelled: '#ef4444',
}

export default function GSTCRenderer({ data, onTaskDateChange, onDependencyCreate, onDependencyDelete }: GanttRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gstcRef = useRef<any>(null)

  const initGantt = useCallback(async () => {
    if (!containerRef.current || data.tasks.length === 0) return

    const gstc = await loadGSTC()
    if (!gstc) return

    // Convert tasks to GSTC rows + items
    const rows: Record<string, any> = {}
    const items: Record<string, any> = {}

    // Build set of all task IDs for valid parent resolution
    const taskIds = new Set(data.tasks.map(t => t.id))

    for (const task of data.tasks) {
      const rowId = `gstcid-row-${task.id}`
      // Only set parentId if parent exists in our task set
      const hasParent = task.parentId && taskIds.has(task.parentId)
      rows[rowId] = {
        id: rowId,
        label: task.name,
        parentId: hasParent ? `gstcid-row-${task.parentId}` : undefined,
        expanded: true,
      }

      const start = new Date(task.start + 'T00:00:00').getTime()
      const end = new Date(task.end + 'T23:59:59').getTime()

      items[`gstcid-item-${task.id}`] = {
        id: `gstcid-item-${task.id}`,
        rowId,
        label: task.name,
        time: { start, end },
        progress: task.progress,
        style: {
          background: statusColors[task.status] || '#3b82f6',
          borderRadius: '4px',
        },
      }
    }

    const config: any = {
      licenseKey: '====BEGIN LICENSE KEY====\nFree-key-for-development\n====END LICENSE KEY====',
      list: {
        columns: {
          data: {
            'gstcid-col-label': {
              id: 'gstcid-col-label',
              data: 'label',
              header: { content: 'Название' },
              width: 250,
              expander: true,
            },
          },
        },
        rows,
      },
      chart: {
        items,
        time: {
          zoom: 20,
        },
      },
      scroll: {
        horizontal: { precise: true },
        vertical: { precise: true },
      },
    }

    // Cleanup previous instance
    if (gstcRef.current) {
      gstcRef.current.destroy()
      gstcRef.current = null
    }

    try {
      const state = gstc.api.stateFromConfig(config)
      gstcRef.current = gstc({ element: containerRef.current, state })
    } catch (e) {
      console.error('GSTC init error:', e)
    }
  }, [data])

  useEffect(() => {
    initGantt()
    return () => {
      if (gstcRef.current) {
        gstcRef.current.destroy()
        gstcRef.current = null
      }
    }
  }, [initGantt])

  if (data.tasks.length === 0) {
    return (
      <div className="empty-state py-12">
        <p className="empty-state-text">Нет задач с датами для отображения</p>
        <p className="empty-state-hint">Установите даты в оперативном плане задач</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200">
      <div ref={containerRef} style={{ height: Math.min(data.tasks.length * 40 + 80, 600) }} />
    </div>
  )
}
