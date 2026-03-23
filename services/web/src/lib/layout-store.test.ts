import { describe, it, expect, beforeEach } from 'vitest'
import { mergeWithDefaults } from './layout-store'
import type { LayoutConfig } from './widget-types'

const mockDefaults: LayoutConfig = {
  placements: [
    { widgetId: 'requests', colSpan: 12, height: null, order: 0, visible: true },
    { widgetId: 'todos', colSpan: 6, height: null, order: 1, visible: true },
    { widgetId: 'news', colSpan: 6, height: null, order: 2, visible: true },
  ],
}

const mockValidIds = new Set(['requests', 'todos', 'news'])

describe('mergeWithDefaults', () => {
  it('keeps saved order and adds missing widgets', () => {
    const saved: LayoutConfig = {
      placements: [
        { widgetId: 'todos', colSpan: 12, order: 0, visible: true },
      ],
    }
    const result = mergeWithDefaults(saved, mockDefaults, mockValidIds)
    expect(result.placements).toHaveLength(3)
    expect(result.placements[0].widgetId).toBe('todos')
    expect(result.placements[0].colSpan).toBe(12)
    expect(result.placements[1].visible).toBe(false)
    expect(result.placements[2].visible).toBe(false)
  })

  it('keeps cross-page widget IDs', () => {
    const saved: LayoutConfig = {
      placements: [
        { widgetId: 'cross-page-widget', colSpan: 6, order: 0, visible: true },
        { widgetId: 'requests', colSpan: 12, height: null, order: 1, visible: true },
      ],
    }
    const result = mergeWithDefaults(saved, mockDefaults, mockValidIds)
    expect(result.placements.find(p => p.widgetId === 'cross-page-widget')).toBeDefined()
    expect(result.placements[0].widgetId).toBe('cross-page-widget')
    expect(result.placements[1].widgetId).toBe('requests')
  })

  it('preserves all saved placements when full', () => {
    const saved: LayoutConfig = {
      placements: [
        { widgetId: 'news', colSpan: 12, order: 0, visible: true },
        { widgetId: 'requests', colSpan: 6, order: 1, visible: true },
        { widgetId: 'todos', colSpan: 6, order: 2, visible: true },
      ],
    }
    const result = mergeWithDefaults(saved, mockDefaults, mockValidIds)
    expect(result.placements).toHaveLength(3)
    expect(result.placements[0].widgetId).toBe('news')
    expect(result.placements[0].colSpan).toBe(12)
  })

  it('handles empty saved layout', () => {
    const saved: LayoutConfig = { placements: [] }
    const result = mergeWithDefaults(saved, mockDefaults, mockValidIds)
    expect(result.placements).toHaveLength(3)
    expect(result.placements.every(p => !p.visible)).toBe(true)
  })
})
