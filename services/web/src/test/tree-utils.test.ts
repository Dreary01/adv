import { describe, it, expect } from 'vitest'

// Extract pure functions that are used in ProjectsPage and ObjectCardPage
// These test the tree manipulation logic

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

function filterSubtree(nodes: any[], search: string): any[] {
  if (!search) return nodes
  const s = search.toLowerCase()
  return nodes
    .filter(n => {
      const selfMatch = n.name.toLowerCase().includes(s)
      const childMatch = n.children?.length && filterSubtree(n.children, search).length > 0
      return selfMatch || childMatch
    })
    .map(n => ({ ...n, children: n.children ? filterSubtree(n.children, search) : [] }))
}

// ─── Test Data ──────────────────────────────────────────

const sampleTree = [
  {
    id: '1', name: 'Portfolio A', status: 'in_progress', type_id: 't1', priority: 3,
    children: [
      {
        id: '2', name: 'Project Alpha', status: 'in_progress', type_id: 't2', priority: 2,
        children: [
          { id: '4', name: 'Task 1', status: 'completed', type_id: 't3', priority: 1, children: [] },
          { id: '5', name: 'Task 2', status: 'not_started', type_id: 't3', priority: 2, children: [] },
        ]
      },
      { id: '3', name: 'Project Beta', status: 'completed', type_id: 't2', priority: 1, children: [] },
    ]
  },
  {
    id: '6', name: 'Portfolio B', status: 'not_started', type_id: 't1', priority: 0,
    children: []
  },
]

// ─── Tests ──────────────────────────────────────────────

describe('flattenTree', () => {
  it('flattens all nodes when no openSet', () => {
    const flat = flattenTree(sampleTree)
    expect(flat).toHaveLength(6)
    expect(flat.map(n => n.id)).toEqual(['1', '2', '4', '5', '3', '6'])
  })

  it('assigns correct levels', () => {
    const flat = flattenTree(sampleTree)
    expect(flat[0]._level).toBe(0) // Portfolio A
    expect(flat[1]._level).toBe(1) // Project Alpha
    expect(flat[2]._level).toBe(2) // Task 1
    expect(flat[5]._level).toBe(0) // Portfolio B
  })

  it('respects openSet - only expands open nodes', () => {
    const openSet = new Set(['1']) // Only Portfolio A is open, not Project Alpha
    const flat = flattenTree(sampleTree, [], 0, openSet)
    expect(flat.map(n => n.id)).toEqual(['1', '2', '3', '6'])
  })

  it('returns empty array for empty input', () => {
    expect(flattenTree([])).toEqual([])
  })

  it('with empty openSet only shows root nodes', () => {
    const flat = flattenTree(sampleTree, [], 0, new Set())
    expect(flat).toHaveLength(2)
    expect(flat.map(n => n.id)).toEqual(['1', '6'])
  })
})

describe('filterTree', () => {
  it('returns all nodes when no filters', () => {
    const result = filterTree(sampleTree, '', '', '', '')
    expect(result).toBe(sampleTree) // Same reference
  })

  it('filters by name search', () => {
    const result = filterTree(sampleTree, 'Alpha', '', '', '')
    expect(result).toHaveLength(1) // Portfolio A (parent of Project Alpha)
    expect(result[0].children).toHaveLength(1) // Project Alpha
    expect(result[0].children[0].name).toBe('Project Alpha')
  })

  it('search is case-insensitive', () => {
    const result = filterTree(sampleTree, 'alpha', '', '', '')
    expect(result).toHaveLength(1)
    expect(result[0].children[0].name).toBe('Project Alpha')
  })

  it('filters by status', () => {
    const result = filterTree(sampleTree, '', 'completed', '', '')
    // Portfolio A has completed children, so it shows
    // Portfolio B is not_started, no completed children
    const allFlat = flattenTree(result)
    const statuses = allFlat.map(n => n.status)
    expect(statuses).toContain('completed')
  })

  it('filters by type', () => {
    const result = filterTree(sampleTree, '', '', 't3', '')
    const flat = flattenTree(result)
    // Should include parent chain for t3 items
    expect(flat.some(n => n.type_id === 't3')).toBe(true)
  })

  it('filters by priority', () => {
    const result = filterTree(sampleTree, '', '', '', '1')
    const flat = flattenTree(result)
    expect(flat.some(n => n.priority === 1)).toBe(true)
  })

  it('returns empty for no matches', () => {
    const result = filterTree(sampleTree, 'nonexistent', '', '', '')
    expect(result).toHaveLength(0)
  })
})

describe('collectAllIds', () => {
  it('collects all node ids recursively', () => {
    const ids = collectAllIds(sampleTree)
    expect(ids).toEqual(['1', '2', '4', '5', '3', '6'])
  })

  it('returns empty for empty tree', () => {
    expect(collectAllIds([])).toEqual([])
  })

  it('handles single node', () => {
    expect(collectAllIds([{ id: 'x', children: [] }])).toEqual(['x'])
  })
})

describe('filterSubtree (hierarchy tab search)', () => {
  it('returns all when no search', () => {
    expect(filterSubtree(sampleTree, '')).toBe(sampleTree)
  })

  it('filters by name, keeps parents', () => {
    const result = filterSubtree(sampleTree, 'Task 1')
    expect(result).toHaveLength(1) // Portfolio A
    expect(result[0].children).toHaveLength(1) // Project Alpha
    expect(result[0].children[0].children).toHaveLength(1) // Task 1
    expect(result[0].children[0].children[0].name).toBe('Task 1')
  })

  it('case-insensitive search', () => {
    const result = filterSubtree(sampleTree, 'task')
    const flat = flattenTree(result)
    expect(flat.some(n => n.name === 'Task 1')).toBe(true)
    expect(flat.some(n => n.name === 'Task 2')).toBe(true)
  })

  it('returns empty when no match', () => {
    expect(filterSubtree(sampleTree, 'zzz')).toHaveLength(0)
  })
})
