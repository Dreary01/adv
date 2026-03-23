import { useState, useMemo } from 'react'
import { X, Search, ChevronRight, ChevronDown, Plus, Check, Wand2 } from 'lucide-react'
import { getAllWidgets, getWidget } from '../../lib/widget-registry'
import type { WidgetDefinition, WidgetPlacement } from '../../lib/widget-types'

interface WidgetLibraryPanelProps {
  placements: WidgetPlacement[]
  onAdd: (widgetId: string, defaultColSpan?: number) => void
  onToggle: (widgetId: string) => void
  onClose: () => void
}

export default function WidgetLibraryPanel({ placements, onAdd, onToggle, onClose }: WidgetLibraryPanelProps) {
  const [search, setSearch] = useState('')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['Проект', 'Дашборд', 'Визуализация', 'Общие']))

  const allWidgets = useMemo(() => getAllWidgets(), [])

  // Group by category
  const categories = useMemo(() => {
    const map = new Map<string, WidgetDefinition[]>()
    for (const w of allWidgets) {
      const cat = w.category || 'Другие'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(w)
    }
    return map
  }, [allWidgets])

  // Filter by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories
    const s = search.toLowerCase()
    const result = new Map<string, WidgetDefinition[]>()
    for (const [cat, widgets] of categories) {
      const filtered = widgets.filter(w => w.title.toLowerCase().includes(s) || w.id.toLowerCase().includes(s))
      if (filtered.length > 0) result.set(cat, filtered)
    }
    return result
  }, [categories, search])

  // Placement lookup
  const placementMap = useMemo(() => {
    const map = new Map<string, WidgetPlacement>()
    for (const p of placements) map.set(p.widgetId, p)
    return map
  }, [placements])

  const visibleCount = placements.filter(p => p.visible).length
  const hiddenCount = placements.filter(p => !p.visible).length

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  const handleWidgetClick = (def: WidgetDefinition) => {
    const placement = placementMap.get(def.id)
    if (placement) {
      onToggle(def.id)
    } else {
      onAdd(def.id, def.defaultColSpan)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="widget-library-overlay" onClick={onClose} />

      {/* Panel */}
      <div className="widget-library-panel">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Библиотека виджетов</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск виджетов..."
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-primary-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Widget list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {Array.from(filteredCategories.entries()).map(([cat, widgets]) => (
            <div key={cat} className="mb-1">
              <button
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
              >
                {openCategories.has(cat) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {cat}
                <span className="text-gray-300 font-normal normal-case">({widgets.length})</span>
              </button>

              {openCategories.has(cat) && (
                <div className="space-y-0.5 mb-2">
                  {widgets.map(def => {
                    const placement = placementMap.get(def.id)
                    const isVisible = placement?.visible
                    const isInLayout = !!placement

                    return (
                      <button
                        key={def.id}
                        onClick={() => handleWidgetClick(def)}
                        className={`flex items-center gap-2.5 w-full px-2 py-2 rounded-lg text-left transition-colors ${
                          isVisible
                            ? 'bg-primary-50 text-primary-700'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${def.iconBg}`}>
                          <def.icon size={14} className={def.iconColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{def.title}</p>
                          <p className="text-[10px] text-gray-400">{def.defaultColSpan}/12 по умолч.</p>
                        </div>
                        {isVisible ? (
                          <Check size={14} className="text-primary-600 flex-shrink-0" />
                        ) : isInLayout ? (
                          <span className="text-[10px] text-gray-400 flex-shrink-0">скрыт</span>
                        ) : (
                          <Plus size={14} className="text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Create custom widget */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={() => { onAdd('configurable', 4); onClose() }}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            <Wand2 size={14} />
            Создать виджет
          </button>
        </div>

        {/* Footer stats */}
        <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-400 flex justify-between">
          <span>На странице: {visibleCount}</span>
          <span>Скрыто: {hiddenCount}</span>
        </div>
      </div>
    </>
  )
}
