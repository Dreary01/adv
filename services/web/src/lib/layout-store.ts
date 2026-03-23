import { create } from 'zustand'
import { api } from './api'
import type { PageType, LayoutConfig } from './widget-types'

// ─── Merge logic ─────────────────────────────────────────

export function mergeWithDefaults(
  saved: LayoutConfig,
  defaults: LayoutConfig,
  _validWidgetIds: Set<string>
): LayoutConfig {
  const savedIds = new Set(saved.placements.map(p => p.widgetId))
  const result = [...saved.placements]

  const maxOrder = result.reduce((max, p) => Math.max(max, p.order), 0)
  let nextOrder = maxOrder + 1
  for (const def of defaults.placements) {
    if (!savedIds.has(def.widgetId)) {
      result.push({ ...def, order: nextOrder++, visible: false })
    }
  }

  return { placements: result.sort((a, b) => a.order - b.order) }
}

// ─── Registry accessors ─────────────────────────────────

let _getDefaultLayout: ((pageType: PageType) => LayoutConfig) | null = null
let _getValidWidgetIds: ((pageType: PageType) => Set<string>) | null = null

export function setRegistryAccessors(
  getDefault: (pageType: PageType) => LayoutConfig,
  getValidIds: (pageType: PageType) => Set<string>
) {
  _getDefaultLayout = getDefault
  _getValidWidgetIds = getValidIds
}

// Back-compat export for tests
export function storageKey(pageType: PageType, objectId?: string): string {
  return objectId ? `${pageType}:${objectId}` : pageType
}

// ─── Tier type ──────────────────────────────────────────

export type LayoutTier =
  | 'builtin'
  | 'admin-all'
  | 'admin-type'
  | 'admin-object'
  | 'user-global'
  | 'user-object'

// ─── Resolve tier from API response ─────────────────────

function resolveLayout(
  rows: any[],
  objectId: string | null,
  typeId: string | null,
  defaults: LayoutConfig,
  validIds: Set<string>
): { layout: LayoutConfig; tier: LayoutTier } {
  // Priority: user-object > user-global > admin-object > admin-type > admin-all > builtin
  const userObj = objectId ? rows.find(r => r.scope === 'user' && r.object_id === objectId) : null
  const userGlobal = rows.find(r => r.scope === 'user' && !r.object_id)
  const adminObj = objectId ? rows.find(r => r.scope === 'admin' && r.object_id === objectId) : null
  const adminType = typeId ? rows.find(r => r.scope === 'admin' && r.type_id === typeId && !r.object_id) : null
  const adminAll = rows.find(r => r.scope === 'admin' && !r.object_id && !r.type_id)

  if (userObj) return { layout: mergeWithDefaults(userObj.layout, defaults, validIds), tier: 'user-object' }
  if (userGlobal) return { layout: mergeWithDefaults(userGlobal.layout, defaults, validIds), tier: 'user-global' }
  if (adminObj) return { layout: mergeWithDefaults(adminObj.layout, defaults, validIds), tier: 'admin-object' }
  if (adminType) return { layout: mergeWithDefaults(adminType.layout, defaults, validIds), tier: 'admin-type' }
  if (adminAll) return { layout: mergeWithDefaults(adminAll.layout, defaults, validIds), tier: 'admin-all' }

  return { layout: { ...defaults, placements: [...defaults.placements] }, tier: 'builtin' }
}

// ─── Store ──────────────────────────────────────────────

interface LayoutState {
  layout: LayoutConfig | null
  pageType: PageType | null
  objectId: string | null
  typeId: string | null
  isEditing: boolean
  activeTier: LayoutTier

  loadLayout: (pageType: PageType, objectId?: string, typeId?: string) => void
  setEditing: (editing: boolean) => void
  moveWidget: (fromWidgetId: string, toWidgetId: string) => void
  resizeWidget: (widgetId: string, newColSpan: number) => void
  resizeWidgetHeight: (widgetId: string, height: number | null) => void
  renameWidget: (widgetId: string, title: string | null) => void
  toggleWidgetVisibility: (widgetId: string) => void
  addWidget: (widgetId: string, defaultColSpan?: number) => void
  saveLayout: () => void
  saveAsAdmin: (scope: 'all' | 'type' | 'object') => void
  updateWidgetConfig: (widgetId: string, config: import('./widget-config-types').WidgetConfig) => void
  resetToGlobal: () => void
  resetToBuiltin: () => void
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layout: null,
  pageType: null,
  objectId: null,
  typeId: null,
  isEditing: false,
  activeTier: 'builtin',

  loadLayout: async (pageType, objectId, typeId) => {
    if (!_getDefaultLayout || !_getValidWidgetIds) return
    const defaults = _getDefaultLayout(pageType)
    const validIds = _getValidWidgetIds(pageType)
    const baseState = { pageType, objectId: objectId || null, typeId: typeId || null }

    try {
      const rows = await api.getWidgetLayouts(pageType, objectId, typeId)
      const { layout, tier } = resolveLayout(rows || [], objectId || null, typeId || null, defaults, validIds)
      set({ layout, ...baseState, activeTier: tier })
    } catch {
      // API failed — use defaults
      set({ layout: { ...defaults, placements: [...defaults.placements] }, ...baseState, activeTier: 'builtin' })
    }
  },

  setEditing: (editing) => {
    set({ isEditing: editing })
    if (!editing) get().saveLayout()
  },

  moveWidget: (fromWidgetId, toWidgetId) => {
    const { layout } = get()
    if (!layout) return
    const placements = [...layout.placements]
    const fromIdx = placements.findIndex(p => p.widgetId === fromWidgetId)
    const toIdx = placements.findIndex(p => p.widgetId === toWidgetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = placements.splice(fromIdx, 1)
    placements.splice(toIdx, 0, moved)
    placements.forEach((p, i) => { p.order = i })
    set({ layout: { placements } })
  },

  resizeWidget: (widgetId, newColSpan) => {
    const { layout } = get()
    if (!layout) return
    set({ layout: { placements: layout.placements.map(p => p.widgetId === widgetId ? { ...p, colSpan: newColSpan } : p) } })
  },

  resizeWidgetHeight: (widgetId, height) => {
    const { layout } = get()
    if (!layout) return
    set({ layout: { placements: layout.placements.map(p => p.widgetId === widgetId ? { ...p, height } : p) } })
  },

  renameWidget: (widgetId, title) => {
    const { layout } = get()
    if (!layout) return
    set({ layout: { placements: layout.placements.map(p => p.widgetId === widgetId ? { ...p, title } : p) } })
  },

  toggleWidgetVisibility: (widgetId) => {
    const { layout } = get()
    if (!layout) return
    set({ layout: { placements: layout.placements.map(p => p.widgetId === widgetId ? { ...p, visible: !p.visible } : p) } })
  },

  addWidget: (widgetId, defaultColSpan) => {
    const { layout } = get()
    if (!layout) return
    const existing = layout.placements.find(p => p.widgetId === widgetId)
    if (existing) {
      set({ layout: { placements: layout.placements.map(p => p.widgetId === widgetId ? { ...p, visible: true } : p) } })
    } else {
      const maxOrder = layout.placements.reduce((max, p) => Math.max(max, p.order), 0)
      set({ layout: { placements: [...layout.placements, { widgetId, colSpan: defaultColSpan || 6, order: maxOrder + 1, visible: true }] } })
    }
  },

  updateWidgetConfig: (widgetId, config) => {
    const { layout } = get()
    if (!layout) return
    set({ layout: { placements: layout.placements.map(p => p.widgetId === widgetId ? { ...p, config } : p) } })
  },

  saveLayout: () => {
    const { layout, pageType, objectId } = get()
    if (!layout || !pageType) return
    api.saveWidgetLayout({
      scope: 'user',
      page_type: pageType,
      object_id: objectId || '',
      layout,
    }).then(() => {
      set({ activeTier: objectId ? 'user-object' : 'user-global' })
    }).catch(() => {})
  },

  saveAsAdmin: (scope) => {
    const { layout, pageType, objectId, typeId } = get()
    if (!layout || !pageType) return
    const data: any = { scope: 'admin', page_type: pageType, layout }
    if (scope === 'object' && objectId) data.object_id = objectId
    else if (scope === 'type' && typeId) data.type_id = typeId
    api.saveWidgetLayout(data).catch(() => {})
  },

  resetToGlobal: () => {
    const { pageType, objectId, typeId } = get()
    if (!pageType || !objectId) return
    api.deleteWidgetLayout('user', pageType, objectId).then(() => {
      get().loadLayout(pageType, objectId, typeId || undefined)
    }).catch(() => {})
  },

  resetToBuiltin: () => {
    const { pageType, objectId, typeId } = get()
    if (!pageType) return
    const promises = [api.deleteWidgetLayout('user', pageType)]
    if (objectId) promises.push(api.deleteWidgetLayout('user', pageType, objectId))
    Promise.all(promises).then(() => {
      get().loadLayout(pageType, objectId || undefined, typeId || undefined)
    }).catch(() => {})
  },
}))
