import { describe, it, expect } from 'vitest'
import { WorkCalendar, cascadeSchedule, findCriticalPath, createBaseline, calculateVariance } from './gantt-scheduler'

// ─── WorkCalendar ───────────────────────────────────────

describe('WorkCalendar', () => {
  const cal = new WorkCalendar()

  it('Monday is working day', () => {
    expect(cal.isWorkingDay(new Date(2026, 2, 23))).toBe(true) // Monday
  })

  it('Saturday is not working day', () => {
    expect(cal.isWorkingDay(new Date(2026, 2, 28))).toBe(false) // Saturday
  })

  it('Sunday is not working day', () => {
    expect(cal.isWorkingDay(new Date(2026, 2, 29))).toBe(false) // Sunday
  })

  it('addWorkingDays skips weekends', () => {
    // Friday + 1 working day = Monday
    const result = cal.addWorkingDays(new Date(2026, 2, 27), 1) // Fri Mar 27
    expect(result.getDay()).toBe(1) // Monday
  })

  it('addWorkingDays(5) = one week', () => {
    // Monday + 5 = next Monday
    const result = cal.addWorkingDays(new Date(2026, 2, 23), 5)
    expect(result.getDate()).toBe(30) // next Monday
  })

  it('getWorkingDaysBetween counts correctly', () => {
    // Mon to Fri = 4 working days between
    const result = cal.getWorkingDaysBetween(new Date(2026, 2, 23), new Date(2026, 2, 27))
    expect(result).toBe(4)
  })

  it('getWorkingDaysBetween across weekend', () => {
    // Mon to next Mon = 5 working days
    const result = cal.getWorkingDaysBetween(new Date(2026, 2, 23), new Date(2026, 2, 30))
    expect(result).toBe(5)
  })

  it('getNextWorkingDay from Saturday', () => {
    const result = cal.getNextWorkingDay(new Date(2026, 2, 28)) // Saturday
    expect(result.getDay()).toBe(1) // Monday
  })

  it('getPreviousWorkingDay from Sunday', () => {
    const result = cal.getPreviousWorkingDay(new Date(2026, 2, 29)) // Sunday
    expect(result.getDay()).toBe(5) // Friday
  })

  it('setHoliday makes day non-working', () => {
    const c = new WorkCalendar()
    const holiday = new Date(2026, 2, 25) // Wednesday
    c.setHoliday(holiday)
    expect(c.isWorkingDay(holiday)).toBe(false)
  })
})

// ─── cascadeSchedule ────────────────────────────────────

describe('cascadeSchedule', () => {
  it('shifts successor when predecessor moves forward (e2s)', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 25), end: new Date(2026, 2, 26), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 26), end: new Date(2026, 2, 27), duration: 1, type: 'task' },
    ]
    const links = [{ id: 1, source: 1, target: 2, type: 'e2s' }]
    // Move task 1 forward by 2 days
    tasks[0].start = new Date(2026, 2, 27)
    tasks[0].end = new Date(2026, 2, 28)
    const updates = cascadeSchedule(tasks, links, 1)
    expect(updates.length).toBe(1)
    expect(updates[0].id).toBe(2)
    expect(updates[0].start > new Date(2026, 2, 27)).toBe(true)
  })

  it('does not shift if successor already after predecessor', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 24), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 3, 1), end: new Date(2026, 3, 2), duration: 1, type: 'task' },
    ]
    const links = [{ id: 1, source: 1, target: 2, type: 'e2s' }]
    const updates = cascadeSchedule(tasks, links, 1)
    expect(updates.length).toBe(0)
  })

  it('cascades through chain A→B→C', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 25), end: new Date(2026, 2, 26), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 26), end: new Date(2026, 2, 27), duration: 1, type: 'task' },
      { id: 3, start: new Date(2026, 2, 27), end: new Date(2026, 2, 28), duration: 1, type: 'task' },
    ]
    const links = [
      { id: 1, source: 1, target: 2, type: 'e2s' },
      { id: 2, source: 2, target: 3, type: 'e2s' },
    ]
    tasks[0].start = new Date(2026, 2, 28)
    tasks[0].end = new Date(2026, 2, 29)
    const updates = cascadeSchedule(tasks, links, 1)
    expect(updates.length).toBe(2)
    expect(updates.map(u => u.id).sort()).toEqual([2, 3])
  })

  it('skips summary tasks', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 25), end: new Date(2026, 2, 26), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 26), end: new Date(2026, 2, 27), duration: 1, type: 'summary' },
    ]
    const links = [{ id: 1, source: 1, target: 2, type: 'e2s' }]
    tasks[0].start = new Date(2026, 2, 28)
    tasks[0].end = new Date(2026, 2, 29)
    const updates = cascadeSchedule(tasks, links, 1)
    expect(updates.length).toBe(0)
  })
})

// ─── findCriticalPath ───────────────────────────────────

describe('findCriticalPath', () => {
  it('returns both tasks in a simple 2-task chain', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 24), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 24), end: new Date(2026, 2, 25), duration: 1, type: 'task' },
    ]
    const links = [{ id: 1, source: 1, target: 2, type: 'e2s' }]
    const critical = findCriticalPath(tasks, links)
    expect(critical.has(1)).toBe(true)
    expect(critical.has(2)).toBe(true)
  })

  it('finds longest path in branching graph', () => {
    // A→B→C (3 tasks, long path) and A→D (short path)
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 24), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 24), end: new Date(2026, 2, 26), duration: 2, type: 'task' },
      { id: 3, start: new Date(2026, 2, 26), end: new Date(2026, 2, 29), duration: 3, type: 'task' },
      { id: 4, start: new Date(2026, 2, 24), end: new Date(2026, 2, 25), duration: 1, type: 'task' },
    ]
    const links = [
      { id: 1, source: 1, target: 2, type: 'e2s' },
      { id: 2, source: 2, target: 3, type: 'e2s' },
      { id: 3, source: 1, target: 4, type: 'e2s' },
    ]
    const critical = findCriticalPath(tasks, links)
    expect(critical.has(1)).toBe(true) // A on critical path
    expect(critical.has(2)).toBe(true) // B on critical path
    expect(critical.has(3)).toBe(true) // C on critical path (longest)
    expect(critical.has(4)).toBe(false) // D not on critical path
  })

  it('returns empty for no tasks', () => {
    expect(findCriticalPath([], []).size).toBe(0)
  })

  it('handles tasks without links — returns longest task', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 24), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 23), end: new Date(2026, 2, 28), duration: 5, type: 'task' },
    ]
    const critical = findCriticalPath(tasks, [])
    expect(critical.has(2)).toBe(true)
  })

  it('skips summary tasks', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 24), duration: 1, type: 'summary' },
      { id: 2, start: new Date(2026, 2, 23), end: new Date(2026, 2, 25), duration: 2, type: 'task' },
    ]
    const critical = findCriticalPath(tasks, [])
    expect(critical.has(1)).toBe(false)
    expect(critical.has(2)).toBe(true)
  })

  it('only considers e2s links', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 24), duration: 1, type: 'task' },
      { id: 2, start: new Date(2026, 2, 24), end: new Date(2026, 2, 25), duration: 1, type: 'task' },
    ]
    const links = [{ id: 1, source: 1, target: 2, type: 's2s' }] // not e2s
    const critical = findCriticalPath(tasks, links)
    // No e2s links → no chain → returns longest
    expect(critical.size).toBeGreaterThan(0)
  })
})

// ─── Baselines ──────────────────────────────────────────

describe('createBaseline', () => {
  it('creates snapshot of task dates', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 25), duration: 2, type: 'task' },
      { id: 2, start: new Date(2026, 2, 25), end: new Date(2026, 2, 28), duration: 3, type: 'task' },
    ]
    const baselines = createBaseline(tasks)
    expect(baselines.length).toBe(2)
    expect(baselines[0].base_start.getTime()).toBe(tasks[0].start.getTime())
    expect(baselines[1].base_duration).toBe(3)
  })

  it('skips summary tasks', () => {
    const tasks = [
      { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 25), duration: 2, type: 'summary' },
      { id: 2, start: new Date(2026, 2, 25), end: new Date(2026, 2, 28), duration: 3, type: 'task' },
    ]
    const baselines = createBaseline(tasks)
    expect(baselines.length).toBe(1)
    expect(baselines[0].id).toBe(2)
  })
})

describe('calculateVariance', () => {
  it('positive variance = behind schedule', () => {
    const task = { id: 1, start: new Date(2026, 2, 25), end: new Date(2026, 2, 27), duration: 2, type: 'task' }
    const baseline = { id: 1, base_start: new Date(2026, 2, 23), base_end: new Date(2026, 2, 25), base_duration: 2 }
    const v = calculateVariance(task, baseline)
    expect(v.startVariance).toBe(2) // started 2 days late
    expect(v.endVariance).toBe(2)   // ending 2 days late
    expect(v.durationVariance).toBe(0) // same duration
  })

  it('negative variance = ahead of schedule', () => {
    const task = { id: 1, start: new Date(2026, 2, 21), end: new Date(2026, 2, 23), duration: 2, type: 'task' }
    const baseline = { id: 1, base_start: new Date(2026, 2, 23), base_end: new Date(2026, 2, 25), base_duration: 2 }
    const v = calculateVariance(task, baseline)
    expect(v.startVariance).toBe(-2)
    expect(v.endVariance).toBe(-2)
  })

  it('duration variance', () => {
    const task = { id: 1, start: new Date(2026, 2, 23), end: new Date(2026, 2, 28), duration: 5, type: 'task' }
    const baseline = { id: 1, base_start: new Date(2026, 2, 23), base_end: new Date(2026, 2, 25), base_duration: 2 }
    const v = calculateVariance(task, baseline)
    expect(v.startVariance).toBe(0)
    expect(v.durationVariance).toBe(3) // took 3 days longer
  })
})
