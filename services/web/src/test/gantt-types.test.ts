import { describe, it, expect } from 'vitest'
import { toGanttData } from '../lib/gantt-types'
import type { GanttTask, GanttDependency } from '../lib/gantt-types'

const sampleSubtree = [
  {
    id: 't1', name: 'Task 1', status: 'in_progress', progress: 50,
    plan_start_date: '2026-04-01', plan_end_date: '2026-04-10',
    type_color: '#3b82f6', type_icon: 'target', type_name: 'Task',
    parent_id: 'root-1',
    children: [
      {
        id: 't2', name: 'Subtask 1.1', status: 'completed', progress: 100,
        plan_start_date: '2026-04-01', plan_end_date: '2026-04-05',
        type_color: '#10b981', parent_id: 't1', children: [],
      },
      {
        id: 't3', name: 'Subtask 1.2', status: 'not_started', progress: 0,
        plan_start_date: '2026-04-06', plan_end_date: '2026-04-10',
        parent_id: 't1', children: [],
      },
    ],
  },
  {
    id: 't4', name: 'Task 2', status: 'not_started', progress: 0,
    plan_start_date: null, plan_end_date: null,
    parent_id: 'root-1', children: [],
  },
]

const sampleDeps = [
  { id: 'd1', predecessor_id: 't2', successor_id: 't3', type: 'fs', lag_days: 0 },
  { id: 'd2', predecessor_id: 't1', successor_id: 't4', type: 'fs', lag_days: 2 },
]

describe('toGanttData', () => {
  it('converts subtree to flat task list', () => {
    const data = toGanttData(sampleSubtree, [])
    expect(data.tasks).toHaveLength(4)
    expect(data.tasks.map(t => t.id)).toEqual(['t1', 't2', 't3', 't4'])
  })

  it('assigns correct levels', () => {
    const data = toGanttData(sampleSubtree, [])
    expect(data.tasks[0].level).toBe(0) // Task 1
    expect(data.tasks[1].level).toBe(1) // Subtask 1.1
    expect(data.tasks[2].level).toBe(1) // Subtask 1.2
    expect(data.tasks[3].level).toBe(0) // Task 2
  })

  it('maps dates from plan_start/end_date', () => {
    const data = toGanttData(sampleSubtree, [])
    expect(data.tasks[0].start).toBe('2026-04-01')
    expect(data.tasks[0].end).toBe('2026-04-10')
  })

  it('falls back to today when no dates', () => {
    const data = toGanttData(sampleSubtree, [])
    const today = new Date().toISOString().split('T')[0]
    expect(data.tasks[3].start).toBe(today) // Task 2 has no dates
    expect(data.tasks[3].end).toBe(today)
  })

  it('maps progress and status', () => {
    const data = toGanttData(sampleSubtree, [])
    expect(data.tasks[0].progress).toBe(50)
    expect(data.tasks[0].status).toBe('in_progress')
    expect(data.tasks[1].progress).toBe(100)
    expect(data.tasks[1].status).toBe('completed')
  })

  it('preserves type metadata', () => {
    const data = toGanttData(sampleSubtree, [])
    expect(data.tasks[0].color).toBe('#3b82f6')
    expect(data.tasks[0].typeIcon).toBe('target')
    expect(data.tasks[0].typeName).toBe('Task')
  })

  it('converts dependencies', () => {
    const data = toGanttData(sampleSubtree, sampleDeps)
    expect(data.dependencies).toHaveLength(2)
    expect(data.dependencies[0]).toEqual({
      id: 'd1', fromId: 't2', toId: 't3', type: 'fs', lagDays: 0,
    })
  })

  it('handles empty inputs', () => {
    const data = toGanttData([], [])
    expect(data.tasks).toEqual([])
    expect(data.dependencies).toEqual([])
  })

  it('handles null dependencies', () => {
    const data = toGanttData(sampleSubtree, null as any)
    expect(data.dependencies).toEqual([])
  })
})
