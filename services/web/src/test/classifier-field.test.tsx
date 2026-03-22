import { describe, it, expect, vi, beforeEach } from 'vitest'

interface ClassifierOption {
  id: string; name: string; level: number; hasChildren: boolean; locked: boolean
}

function flattenClassifierValues(vals: any[]): ClassifierOption[] {
  const flat: ClassifierOption[] = []
  const walk = (items: any[], level = 0) => {
    for (const item of items) {
      const hasKids = !!(item.children?.length)
      if (!item.is_locked) {
        flat.push({ id: item.id, name: item.name, level, hasChildren: hasKids, locked: item.is_locked })
      }
      if (hasKids) walk(item.children, level + 1)
    }
  }
  walk(vals)
  return flat
}

function canSelect(opt: ClassifierOption, hierarchical: boolean, allowNodeSelect: boolean): boolean {
  if (!hierarchical) return true
  if (opt.hasChildren && !allowNodeSelect) return false
  return true
}

const hierarchicalValues = [
  {
    id: 'v1', name: 'Письмо', is_locked: false,
    children: [
      { id: 'v2', name: 'Входящее', is_locked: false, children: [] },
      { id: 'v3', name: 'Исходящее', is_locked: false, children: [] },
    ]
  },
  {
    id: 'v4', name: 'Договор', is_locked: false,
    children: [
      { id: 'v5', name: 'Поставки', is_locked: false, children: [] },
      { id: 'v6', name: 'Услуг', is_locked: true, children: [] },
    ]
  },
  { id: 'v7', name: 'Первичный документ', is_locked: false, children: [] },
]

describe('Classifier field logic', () => {
  describe('flattenClassifierValues', () => {
    it('flattens hierarchical values with levels', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      expect(flat.map(o => o.name)).toEqual([
        'Письмо', 'Входящее', 'Исходящее',
        'Договор', 'Поставки',
        'Первичный документ',
      ])
    })

    it('assigns correct levels', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      expect(flat[0].level).toBe(0) // Письмо
      expect(flat[1].level).toBe(1) // Входящее
      expect(flat[4].level).toBe(1) // Поставки
      expect(flat[5].level).toBe(0) // Первичный документ
    })

    it('marks hasChildren correctly', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      expect(flat[0].hasChildren).toBe(true)  // Письмо has children
      expect(flat[1].hasChildren).toBe(false)  // Входящее is leaf
      expect(flat[5].hasChildren).toBe(false)  // Первичный документ is leaf
    })

    it('excludes locked values', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      const names = flat.map(o => o.name)
      expect(names).not.toContain('Услуг') // is_locked = true
    })
  })

  describe('canSelect', () => {
    it('allows everything when not hierarchical', () => {
      const opt = { id: '1', name: 'A', level: 0, hasChildren: true, locked: false }
      expect(canSelect(opt, false, false)).toBe(true)
      expect(canSelect(opt, false, true)).toBe(true)
    })

    it('allows leaf nodes in hierarchical mode', () => {
      const leaf = { id: '1', name: 'Leaf', level: 1, hasChildren: false, locked: false }
      expect(canSelect(leaf, true, false)).toBe(true)
      expect(canSelect(leaf, true, true)).toBe(true)
    })

    it('blocks node selection when allow_node_select=false', () => {
      const node = { id: '1', name: 'Node', level: 0, hasChildren: true, locked: false }
      expect(canSelect(node, true, false)).toBe(false)
    })

    it('allows node selection when allow_node_select=true', () => {
      const node = { id: '1', name: 'Node', level: 0, hasChildren: true, locked: false }
      expect(canSelect(node, true, true)).toBe(true)
    })
  })

  describe('flat classifier (non-hierarchical)', () => {
    it('all values are selectable', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      flat.forEach(opt => {
        expect(canSelect(opt, false, false)).toBe(true)
      })
    })
  })

  describe('hierarchical with allow_node_select=false', () => {
    it('only leaves are selectable', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      const selectable = flat.filter(opt => canSelect(opt, true, false))
      expect(selectable.map(o => o.name)).toEqual([
        'Входящее', 'Исходящее', 'Поставки', 'Первичный документ'
      ])
    })
  })

  describe('hierarchical with allow_node_select=true', () => {
    it('all non-locked values are selectable', () => {
      const flat = flattenClassifierValues(hierarchicalValues)
      const selectable = flat.filter(opt => canSelect(opt, true, true))
      expect(selectable.length).toBe(flat.length)
    })
  })
})
