// Universal Gantt data format — renderer-agnostic
// To swap the Gantt renderer, only the adapter component changes.
// Data types and callbacks stay the same.

export interface GanttTask {
  id: string
  name: string
  start: string        // ISO date YYYY-MM-DD
  end: string          // ISO date YYYY-MM-DD
  progress: number     // 0-100
  status: string
  parentId?: string
  level: number
  color?: string
  typeIcon?: string
  typeName?: string
}

export interface GanttDependency {
  id: string
  fromId: string       // predecessor
  toId: string         // successor
  type: 'fs' | 'ff' | 'ss' | 'sf'
  lagDays: number
}

export interface GanttData {
  tasks: GanttTask[]
  dependencies: GanttDependency[]
}

// Props that any Gantt renderer must accept
export interface GanttRendererProps {
  data: GanttData
  onTaskDateChange?: (taskId: string, start: string, end: string) => void
  onDependencyCreate?: (fromId: string, toId: string, type: string) => void
  onDependencyDelete?: (depId: string) => void
}

// Convert API subtree + dependencies into GanttData
export function toGanttData(subtree: any[], dependencies: any[]): GanttData {
  const tasks: GanttTask[] = []
  const today = new Date().toISOString().split('T')[0]

  // Collect all IDs to validate parentId references
  const allIds = new Set<string>()
  const collectIds = (nodes: any[]) => {
    for (const n of nodes) {
      allIds.add(n.id)
      if (n.children?.length) collectIds(n.children)
    }
  }
  collectIds(subtree)

  const flatten = (nodes: any[], level = 0) => {
    for (const node of nodes) {
      let start = node.plan_start_date || node.actual_start_date || today
      let end = node.plan_end_date || node.actual_end_date || today
      // Ensure start <= end
      if (start > end) [start, end] = [end, start]

      tasks.push({
        id: node.id,
        name: node.name,
        start,
        end,
        progress: node.progress || 0,
        status: node.status || 'not_started',
        parentId: node.parent_id && allIds.has(node.parent_id) ? node.parent_id : undefined,
        level,
        color: node.type_color,
        typeIcon: node.type_icon,
        typeName: node.type_name,
      })
      if (node.children?.length) flatten(node.children, level + 1)
    }
  }
  flatten(subtree)

  const deps: GanttDependency[] = (dependencies || []).map((d: any) => ({
    id: d.id,
    fromId: d.predecessor_id,
    toId: d.successor_id,
    type: d.type || 'fs',
    lagDays: d.lag_days || 0,
  }))

  return { tasks, dependencies: deps }
}
