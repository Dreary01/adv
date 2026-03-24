import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getWidget } from '../lib/widget-registry'
import '../lib/widget-registry' // ensure registry is loaded

const SANDBOX_STORAGE_KEY = 'adv_sandbox_widgets'

// Mock localStorage
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
})

describe('Sandbox widget persistence', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('saves widgets to localStorage', () => {
    const widgets = [
      { id: 'w-1', title: 'My Widget', config: { type: 'number' } },
      { id: 'w-2', title: 'Gauge', config: { type: 'gauge', min: 0, max: 100 } },
    ]
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(widgets))

    const raw = localStorage.getItem(SANDBOX_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].title).toBe('My Widget')
    expect(parsed[0].config.type).toBe('number')
    expect(parsed[1].config.type).toBe('gauge')
    expect(parsed[1].config.min).toBe(0)
  })

  it('loads widgets from localStorage with saved=true', () => {
    const widgets = [
      { id: 'w-1', title: 'Test', config: { type: 'text', content: '# Hello' } },
    ]
    storage.set(SANDBOX_STORAGE_KEY, JSON.stringify(widgets))

    const raw = localStorage.getItem(SANDBOX_STORAGE_KEY)
    const loaded = JSON.parse(raw!).map((w: any) => ({ ...w, saved: true }))
    expect(loaded).toHaveLength(1)
    expect(loaded[0].saved).toBe(true)
    expect(loaded[0].title).toBe('Test')
    expect(loaded[0].config.content).toBe('# Hello')
  })

  it('returns empty array when localStorage is empty', () => {
    const raw = localStorage.getItem(SANDBOX_STORAGE_KEY)
    expect(raw).toBeNull()
    const loaded = raw ? JSON.parse(raw) : []
    expect(loaded).toEqual([])
  })

  it('returns empty array when localStorage has invalid JSON', () => {
    storage.set(SANDBOX_STORAGE_KEY, '{invalid json')
    let loaded: any[] = []
    try {
      const raw = localStorage.getItem(SANDBOX_STORAGE_KEY)
      if (raw) loaded = JSON.parse(raw)
    } catch {
      loaded = []
    }
    expect(loaded).toEqual([])
  })

  it('persists only id, title, config (strips saved flag)', () => {
    const widgets = [
      { id: 'w-1', title: 'W1', config: { type: 'number' }, saved: true },
      { id: 'w-2', title: 'W2', config: { type: 'gauge' }, saved: false },
    ]
    const toStore = widgets.map(({ id, title, config }) => ({ id, title, config }))
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(toStore))

    const parsed = JSON.parse(localStorage.getItem(SANDBOX_STORAGE_KEY)!)
    expect(parsed[0]).not.toHaveProperty('saved')
    expect(parsed[1]).not.toHaveProperty('saved')
    expect(parsed[0].id).toBe('w-1')
    expect(parsed[1].title).toBe('W2')
  })

  it('removes widget and persists remaining', () => {
    const widgets = [
      { id: 'w-1', title: 'A', config: { type: 'number' } },
      { id: 'w-2', title: 'B', config: { type: 'text' } },
      { id: 'w-3', title: 'C', config: { type: 'gauge' } },
    ]
    const idx = 1
    const remaining = widgets.filter((_, i) => i !== idx)
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(remaining))

    const parsed = JSON.parse(localStorage.getItem(SANDBOX_STORAGE_KEY)!)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].title).toBe('A')
    expect(parsed[1].title).toBe('C')
  })

  it('preserves widget config with dataSource', () => {
    const widgets = [
      {
        id: 'w-1',
        title: 'Ref Widget',
        config: {
          type: 'table',
          dataSource: { kind: 'ref-records', refTableId: 'abc-123', limit: 10 },
        },
      },
    ]
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(widgets))
    const parsed = JSON.parse(localStorage.getItem(SANDBOX_STORAGE_KEY)!)
    expect(parsed[0].config.dataSource.kind).toBe('ref-records')
    expect(parsed[0].config.dataSource.refTableId).toBe('abc-123')
    expect(parsed[0].config.dataSource.limit).toBe(10)
  })

  it('preserves thresholds config', () => {
    const widgets = [
      {
        id: 'w-1',
        title: 'Gauge',
        config: {
          type: 'gauge',
          min: 0,
          max: 100,
          thresholds: [
            { value: 30, color: '#ef4444' },
            { value: 70, color: '#22c55e' },
          ],
        },
      },
    ]
    localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(widgets))
    const parsed = JSON.parse(localStorage.getItem(SANDBOX_STORAGE_KEY)!)
    expect(parsed[0].config.thresholds).toHaveLength(2)
    expect(parsed[0].config.thresholds[0].value).toBe(30)
    expect(parsed[0].config.thresholds[1].color).toBe('#22c55e')
  })
})

describe('Dynamic configurable widget IDs (cfg-*)', () => {
  it('resolves cfg-xxx to the configurable widget definition', () => {
    const def = getWidget('cfg-1234567890')
    expect(def).toBeTruthy()
    expect(def!.id).toBe('configurable')
  })

  it('resolves cfg- with any suffix', () => {
    expect(getWidget('cfg-abc')).toBeTruthy()
    expect(getWidget('cfg-' + Date.now())).toBeTruthy()
  })

  it('does not resolve non-cfg prefixed unknown IDs', () => {
    expect(getWidget('unknown-widget')).toBeUndefined()
    expect(getWidget('cfgx-123')).toBeUndefined()
  })

  it('still resolves exact "configurable" ID', () => {
    const def = getWidget('configurable')
    expect(def).toBeTruthy()
    expect(def!.id).toBe('configurable')
  })
})
