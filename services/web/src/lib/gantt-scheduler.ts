// Client-side auto-scheduling for Gantt dependencies
// Calendar-aware: skips weekends when calculating dates

// ─── Calendar ───────────────────────────────────────────

export class WorkCalendar {
  private weekHours: number[]
  private exceptions: Map<number, number> = new Map()

  constructor(config?: { weekHours?: Record<string, number> }) {
    // Default: Mon-Fri = 8h, Sat-Sun = 0h
    const wh = config?.weekHours || {}
    this.weekHours = [
      wh.sunday ?? 0,
      wh.monday ?? 8,
      wh.tuesday ?? 8,
      wh.wednesday ?? 8,
      wh.thursday ?? 8,
      wh.friday ?? 8,
      wh.saturday ?? 0,
    ]
  }

  isWorkingDay(d: Date): boolean {
    return this.getDayHours(d) > 0
  }

  getDayHours(d: Date): number {
    const normalized = this.normalizeDate(d)
    const exc = this.exceptions.get(normalized.getTime())
    if (exc !== undefined) return exc
    return this.weekHours[normalized.getDay()] ?? 0
  }

  setHoliday(d: Date): void {
    this.exceptions.set(this.normalizeDate(d).getTime(), 0)
  }

  getNextWorkingDay(d: Date): Date {
    let current = this.normalizeDate(d)
    for (let i = 0; i < 365; i++) {
      current = this.addCalendarDays(current, 1)
      if (this.getDayHours(current) > 0) return current
    }
    return current
  }

  getPreviousWorkingDay(d: Date): Date {
    let current = this.normalizeDate(d)
    for (let i = 0; i < 365; i++) {
      current = this.addCalendarDays(current, -1)
      if (this.getDayHours(current) > 0) return current
    }
    return current
  }

  addWorkingDays(start: Date, days: number): Date {
    if (days === 0) return this.normalizeDate(start)
    let current = this.normalizeDate(start)
    const dir = days > 0 ? 1 : -1
    let remaining = Math.abs(days)

    // If starting on non-working day, move to next working day
    if (!this.isWorkingDay(current)) {
      current = dir > 0 ? this.getNextWorkingDay(current) : this.getPreviousWorkingDay(current)
    }

    for (let i = 0; remaining > 0 && i < 365 * 3; i++) {
      current = this.addCalendarDays(current, dir)
      if (this.isWorkingDay(current)) remaining--
    }
    return current
  }

  getWorkingDaysBetween(start: Date, end: Date): number {
    const s = this.normalizeDate(start)
    const e = this.normalizeDate(end)
    if (s >= e) return 0
    let count = 0
    let current = new Date(s)
    while (current < e) {
      current = this.addCalendarDays(current, 1)
      if (this.isWorkingDay(current)) count++
    }
    return count
  }

  private normalizeDate(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  private addCalendarDays(d: Date, days: number): Date {
    const r = new Date(d)
    r.setDate(r.getDate() + days)
    return r
  }
}

// Default calendar instance
const defaultCalendar = new WorkCalendar()

// ─── Scheduler ──────────────────────────────────────────

interface SchedulerTask {
  id: number
  start: Date
  end: Date
  duration: number
  type: string
}

interface SchedulerLink {
  id: number
  source: number
  target: number
  type: string // e2s, s2s, e2e, s2e
  lag?: number
}

/**
 * Calculate which tasks need to move based on a changed task.
 * Calendar-aware: uses working days for lag calculations.
 * Returns list of { id, start, duration, end } updates.
 */
export function cascadeSchedule(
  tasks: SchedulerTask[],
  links: SchedulerLink[],
  changedTaskId: number,
  calendar: WorkCalendar = defaultCalendar
): Array<{ id: number; start: Date; duration: number; end: Date }> {
  const taskMap = new Map<number, SchedulerTask>()
  tasks.forEach(t => taskMap.set(t.id, { ...t }))

  // Build adjacency: predecessor -> successors
  const successors = new Map<number, SchedulerLink[]>()
  links.forEach(l => {
    if (!successors.has(l.source)) successors.set(l.source, [])
    successors.get(l.source)!.push(l)
  })

  const updates: Array<{ id: number; start: Date; duration: number; end: Date }> = []
  const visited = new Set<number>()

  function process(taskId: number) {
    if (visited.has(taskId)) return
    visited.add(taskId)

    const pred = taskMap.get(taskId)
    if (!pred) return

    const deps = successors.get(taskId) || []
    for (const link of deps) {
      const succ = taskMap.get(link.target)
      if (!succ || succ.type === 'summary') continue

      const lag = link.lag || 0
      let earliestStart: Date

      switch (link.type) {
        case 'e2s': // finish-to-start
          earliestStart = calendar.addWorkingDays(pred.end, lag)
          break
        case 's2s': // start-to-start
          earliestStart = calendar.addWorkingDays(pred.start, lag)
          break
        case 'e2e': // finish-to-finish
          earliestStart = calendar.addWorkingDays(pred.end, lag - succ.duration)
          break
        case 's2e': // start-to-finish
          earliestStart = calendar.addWorkingDays(pred.start, lag - succ.duration)
          break
        default:
          continue
      }

      if (earliestStart > succ.start) {
        succ.start = earliestStart
        succ.end = calendar.addWorkingDays(earliestStart, succ.duration)
        updates.push({
          id: succ.id,
          start: succ.start,
          duration: succ.duration,
          end: succ.end,
        })
        process(succ.id)
      }
    }
  }

  process(changedTaskId)
  return updates
}

// ─── Critical Path ──────────────────────────────────────

/**
 * Find the critical path — the longest chain of linked tasks.
 * Uses the approach from the SVAR scheduler: find tasks on the
 * longest path through the dependency graph.
 * Returns set of task IDs on the critical path.
 */
export function findCriticalPath(
  tasks: SchedulerTask[],
  links: SchedulerLink[],
): Set<number> {
  if (tasks.length === 0) return new Set()

  const taskMap = new Map<number, SchedulerTask>()
  tasks.forEach(t => { if (t.type !== 'summary') taskMap.set(t.id, t) })

  // Build adjacency (only e2s links)
  const succs = new Map<number, number[]>()
  const preds = new Map<number, number[]>()
  const validLinks = links.filter(l => l.type === 'e2s' && taskMap.has(l.source) && taskMap.has(l.target))

  validLinks.forEach(l => {
    if (!succs.has(l.source)) succs.set(l.source, [])
    succs.get(l.source)!.push(l.target)
    if (!preds.has(l.target)) preds.set(l.target, [])
    preds.get(l.target)!.push(l.source)
  })

  if (validLinks.length === 0) {
    // No links — if all tasks are independent, all are "critical"
    // (any delay in any task delays the project)
    // Find the longest task(s)
    let maxEnd = 0
    const critical = new Set<number>()
    taskMap.forEach((t, id) => {
      const end = t.end.getTime()
      if (end > maxEnd) maxEnd = end
    })
    taskMap.forEach((t, id) => {
      if (t.end.getTime() === maxEnd) critical.add(id)
    })
    return critical
  }

  // Find longest path using DFS + memoization
  const longestFrom = new Map<number, number>() // taskId -> longest path length from this task
  const longestPathNext = new Map<number, number>() // taskId -> next task on longest path

  function dfs(id: number): number {
    if (longestFrom.has(id)) return longestFrom.get(id)!
    const t = taskMap.get(id)!
    const children = succs.get(id) || []
    if (children.length === 0) {
      longestFrom.set(id, t.duration)
      return t.duration
    }
    let maxLen = 0
    let bestNext = -1
    for (const child of children) {
      const childLen = dfs(child)
      if (childLen > maxLen) {
        maxLen = childLen
        bestNext = child
      }
    }
    const total = t.duration + maxLen
    longestFrom.set(id, total)
    if (bestNext >= 0) longestPathNext.set(id, bestNext)
    return total
  }

  // Run DFS from all roots (tasks without predecessors)
  const roots: number[] = []
  taskMap.forEach((_, id) => {
    if (!preds.has(id) || preds.get(id)!.length === 0) roots.push(id)
  })
  // Also include tasks that are only connected (in case all have preds, find entry points)
  if (roots.length === 0) taskMap.forEach((_, id) => roots.push(id))

  roots.forEach(id => dfs(id))

  // Find the root with longest total path
  let criticalRoot = -1
  let criticalLen = 0
  roots.forEach(id => {
    const len = longestFrom.get(id) || 0
    if (len > criticalLen) {
      criticalLen = len
      criticalRoot = id
    }
  })

  // Trace the path
  const critical = new Set<number>()
  let current = criticalRoot
  while (current >= 0) {
    critical.add(current)
    current = longestPathNext.get(current) ?? -1
  }

  return critical
}

// ─── Baselines ──────────────────────────────────────────

export interface BaselineData {
  id: number
  base_start: Date
  base_end: Date
  base_duration: number
}

/**
 * Create baseline snapshot from current task dates.
 */
export function createBaseline(tasks: SchedulerTask[]): BaselineData[] {
  return tasks
    .filter(t => t.type !== 'summary')
    .map(t => ({
      id: t.id,
      base_start: new Date(t.start),
      base_end: new Date(t.end),
      base_duration: t.duration,
    }))
}

/**
 * Calculate variance between current dates and baseline.
 * Positive = behind schedule, negative = ahead.
 */
export function calculateVariance(
  task: SchedulerTask,
  baseline: BaselineData
): { startVariance: number; endVariance: number; durationVariance: number } {
  const startDiff = Math.round((task.start.getTime() - baseline.base_start.getTime()) / 86400000)
  const endDiff = Math.round((task.end.getTime() - baseline.base_end.getTime()) / 86400000)
  return {
    startVariance: startDiff,
    endVariance: endDiff,
    durationVariance: task.duration - baseline.base_duration,
  }
}
