import { useMemo, useCallback } from 'react'
import type { GanttRendererProps } from '../../lib/gantt-types'
import { Gantt } from '@svar-ui/react-gantt'

const depTypeToSvar: Record<string, string> = { fs: 'e2s', ss: 's2s', ff: 'e2e', sf: 's2e' }
const svarToDepType: Record<string, string> = { e2s: 'fs', s2s: 'ss', e2e: 'ff', s2e: 'sf' }

const SCALES = [
  { unit: 'month' as any, step: 1, format: '%F %Y' },
  { unit: 'day' as any, step: 1, format: '%j' },
]

export default function SVARGanttRenderer({ data, onTaskDateChange, onDependencyCreate }: GanttRendererProps) {

  const { tasks, links, idToUuid } = useMemo(() => {
    const idToUuid: Record<number, string> = {}
    const uuidToId: Record<string, number> = {}
    data.tasks.forEach((t, i) => {
      const numId = i + 1
      idToUuid[numId] = t.id
      uuidToId[t.id] = numId
    })

    const parentIds = new Set(data.tasks.map(t => t.parentId).filter(Boolean))

    const parseDate = (iso: string) => {
      const [y, m, d] = iso.split('-').map(Number)
      return new Date(y, m - 1, d)
    }

    const tasks = data.tasks.map((t, i) => {
      const start = parseDate(t.start)
      const end = parseDate(t.end)
      const dur = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
      const parentNum = t.parentId ? uuidToId[t.parentId] : undefined
      const isSummary = parentIds.has(t.id)
      return {
        id: i + 1,
        text: t.name,
        start,
        duration: dur,
        progress: t.progress || 0,
        parent: parentNum && parentNum > 0 ? parentNum : 0,
        type: isSummary ? 'summary' as const : 'task' as const,
        open: true,
      }
    })

    const links = data.dependencies
      .map((d, i) => ({
        id: i + 1,
        source: uuidToId[d.fromId] || 0,
        target: uuidToId[d.toId] || 0,
        type: (depTypeToSvar[d.type] || 'e2s') as any,
      }))
      .filter((l: any) => l.source > 0 && l.target > 0)

    return { tasks, links, idToUuid }
  }, [data])

  const handleAction = useCallback((ev: any) => {
    const { action, data: payload } = ev || {}
    if (action === 'update-task' && onTaskDateChange && payload?.id) {
      const uuid = idToUuid[payload.id]
      if (uuid && payload.start && payload.end) {
        const fmt = (d: Date) => d.toISOString().split('T')[0]
        onTaskDateChange(uuid, fmt(payload.start), fmt(payload.end))
      }
    }
    if (action === 'add-link' && onDependencyCreate && payload?.source && payload?.target) {
      const fromUuid = idToUuid[payload.source]
      const toUuid = idToUuid[payload.target]
      if (fromUuid && toUuid) {
        onDependencyCreate(fromUuid, toUuid, svarToDepType[payload.type] || 'fs')
      }
    }
  }, [onTaskDateChange, onDependencyCreate, idToUuid])

  return (
    <div style={{ width: '100%', height: Math.min(tasks.length * 38 + 120, 700) }}>
      <Gantt tasks={tasks} links={links} scales={SCALES} onaction={handleAction} />
    </div>
  )
}
