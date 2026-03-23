import { useState, useMemo } from 'react'
import { Search, ChevronRight, ChevronDown, Hash, Gauge, Type, Table, List, BarChart3, Wand2, Plus, Cog, Trash2 } from 'lucide-react'
import { getAllWidgets } from '../lib/widget-registry'
import { CONFIG_WIDGET_TYPES } from '../lib/widget-config-types'
import type { WidgetConfig, ConfigWidgetType } from '../lib/widget-config-types'
import type { WidgetDefinition } from '../lib/widget-types'
import ConfigurableWidget from '../components/widgets/configurable/ConfigurableWidget'
import WidgetConfigPanel from '../components/widgets/configurable/WidgetConfigPanel'

// Ensure registry is loaded
import '../lib/widget-registry'

export default function WidgetLibraryPage() {
  const [search, setSearch] = useState('')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(['Проект', 'Дашборд', 'Визуализация', 'Общие', 'Пользовательские']))
  const [activeTab, setActiveTab] = useState<'catalog' | 'sandbox'>('catalog')

  const allWidgets = useMemo(() => getAllWidgets(), [])

  const categories = useMemo(() => {
    const map = new Map<string, WidgetDefinition[]>()
    for (const w of allWidgets) {
      const cat = w.category || 'Другие'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(w)
    }
    return map
  }, [allWidgets])

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories
    const s = search.toLowerCase()
    const result = new Map<string, WidgetDefinition[]>()
    for (const [cat, widgets] of categories) {
      const filtered = widgets.filter(w =>
        w.title.toLowerCase().includes(s) || w.id.toLowerCase().includes(s) || cat.toLowerCase().includes(s)
      )
      if (filtered.length > 0) result.set(cat, filtered)
    }
    return result
  }, [categories, search])

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  const pageTypeLabel: Record<string, string> = {
    dashboard: 'Рабочий стол',
    'object-main': 'Главная проекта',
    'object-gantt': 'Гант',
    'object-ref-tables': 'Справочники',
    'object-events': 'Лента событий',
    'admin-widgets': 'Песочница',
  }

  return (
    <div className="page space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Библиотека виджетов</h1>
          <p className="page-subtitle">Каталог виджетов и песочница для создания</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 -mb-px">
        <button onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            activeTab === 'catalog' ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Каталог
        </button>
        <button onClick={() => setActiveTab('sandbox')}
          className={`px-4 py-2 text-sm border-b-2 transition-colors ${
            activeTab === 'sandbox' ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          Песочница
        </button>
      </div>

      {activeTab === 'catalog' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск виджетов..." className="input pl-10"
            />
          </div>

          {/* Categories */}
          {Array.from(filteredCategories.entries()).map(([cat, widgets]) => (
            <div key={cat} className="card">
              <button onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-2 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors">
                {openCategories.has(cat) ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                <h2 className="text-sm font-semibold text-gray-800">{cat}</h2>
                <span className="text-xs text-gray-400">({widgets.length})</span>
              </button>
              {openCategories.has(cat) && (
                <div className="border-t border-gray-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-100">
                    {widgets.map(def => (
                      <div key={def.id} className="bg-white p-4 flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${def.iconBg}`}>
                          <def.icon size={18} className={def.iconColor} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{def.title}</p>
                          <p className="text-xs text-gray-400 mt-0.5">ID: {def.id}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {def.pageTypes.map(pt => (
                              <span key={pt} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {pageTypeLabel[pt] || pt}
                              </span>
                            ))}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-50 text-primary-600">
                              {def.defaultColSpan}/12
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Configurable widget subtypes */}
          <div className="card">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Wand2 size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Типы настраиваемых виджетов</h3>
                <p className="text-xs text-gray-400">Доступные типы визуализации при создании виджета</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-100">
              {CONFIG_WIDGET_TYPES.map(t => {
                const iconMap: Record<string, any> = { Hash, Gauge, Type, Table, List, BarChart3 }
                const Icon = iconMap[t.icon] || Hash
                return (
                  <div key={t.type} className="bg-white p-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <Icon size={18} className="text-amber-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
                      <span className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">{t.type}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="text-xs text-gray-400">
            Всего виджетов: {allWidgets.length} · Категорий: {categories.size}
          </div>
        </div>
      )}

      {activeTab === 'sandbox' && (
        <SandboxTab />
      )}
    </div>
  )
}

// ─── Sandbox ─────────────────────────────────────────────

const sandboxIconMap: Record<string, any> = { Hash, Gauge, Type, Table, List, BarChart3 }

function SandboxTab() {
  const [widgets, setWidgets] = useState<{ id: string; config: WidgetConfig }[]>([])

  const addWidget = (type: ConfigWidgetType) => {
    setWidgets(prev => [...prev, { id: `w-${Date.now()}`, config: { type } }])
  }

  const updateWidget = (idx: number, patch: Partial<WidgetConfig>) => {
    setWidgets(prev => prev.map((w, i) => i === idx ? { ...w, config: { ...w.config, ...patch } } : w))
  }

  const updateDS = (idx: number, patch: Record<string, any>) => {
    setWidgets(prev => prev.map((w, i) => {
      if (i !== idx) return w
      return { ...w, config: { ...w.config, dataSource: { ...w.config.dataSource, kind: w.config.dataSource?.kind || 'object-field', ...patch } } }
    }))
  }

  const removeWidget = (idx: number) => {
    setWidgets(prev => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-5">
      {/* Quick create */}
      <div className="flex flex-wrap gap-2">
        {CONFIG_WIDGET_TYPES.map(t => {
          const Icon = sandboxIconMap[t.icon] || Hash
          return (
            <button key={t.type} onClick={() => addWidget(t.type)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-colors">
              <Icon size={15} />
              {t.label}
              <Plus size={13} className="text-gray-400" />
            </button>
          )
        })}
      </div>

      {widgets.length === 0 ? (
        <div className="card">
          <div className="empty-state py-12">
            <Wand2 size={28} className="empty-state-icon" />
            <p className="empty-state-text">Нажмите на тип виджета выше, чтобы создать</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {widgets.map((w, idx) => (
            <SandboxWidgetCard key={w.id} config={w.config} idx={idx}
              onUpdate={updateWidget} onUpdateDS={updateDS} onRemove={removeWidget} />
          ))}
        </div>
      )}
    </div>
  )
}

function SandboxWidgetCard({ config, idx, onUpdate, onUpdateDS, onRemove }: {
  config: WidgetConfig; idx: number
  onUpdate: (idx: number, patch: Partial<WidgetConfig>) => void
  onUpdateDS: (idx: number, patch: Record<string, any>) => void
  onRemove: (idx: number) => void
}) {
  const typeInfo = CONFIG_WIDGET_TYPES.find(t => t.type === config.type)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          {(() => { const Icon = sandboxIconMap[typeInfo?.icon || 'Hash'] || Hash; return <Icon size={15} className="text-amber-600" /> })()}
          <span className="text-sm font-semibold text-gray-800">{typeInfo?.label || config.type}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">{config.type}</span>
        </div>
        <button onClick={() => onRemove(idx)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {/* Settings */}
        <div className="p-5 space-y-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Настройки</h4>

          {/* Type selector */}
          <div>
            <label className="label">Тип визуализации</label>
            <div className="flex flex-wrap gap-1">
              {CONFIG_WIDGET_TYPES.map(t => {
                const Icon = sandboxIconMap[t.icon] || Hash
                return (
                  <button key={t.type} onClick={() => onUpdate(idx, { type: t.type })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                      config.type === t.type ? 'bg-primary-100 text-primary-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}>
                    <Icon size={12} /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Data source */}
          {config.type !== 'text' && config.type !== 'chart' && (
            <>
              <div>
                <label className="label">Источник данных</label>
                <select value={config.dataSource?.kind || 'object-field'} onChange={e => onUpdateDS(idx, { kind: e.target.value })}
                  className="input input-sm">
                  <option value="object-field">Поле объекта</option>
                  <option value="object-count">Количество объектов</option>
                  <option value="ref-aggregation">Агрегация справочника</option>
                  <option value="ref-records">Записи справочника</option>
                  <option value="todos">Список дел</option>
                  <option value="static">Статическое значение</option>
                </select>
              </div>

              {config.dataSource?.kind === 'object-field' && (
                <div>
                  <label className="label">Поле</label>
                  <select value={config.dataSource?.field || ''} onChange={e => onUpdateDS(idx, { field: e.target.value })}
                    className="input input-sm">
                    <option value="">Выберите...</option>
                    <option value="progress">Прогресс</option>
                    <option value="priority">Приоритет</option>
                    <option value="plan_duration_days">Длительность (дни)</option>
                  </select>
                </div>
              )}

              {config.dataSource?.kind === 'static' && (
                <div>
                  <label className="label">Значение</label>
                  <input type="number" value={config.dataSource?.filter?.value || ''}
                    onChange={e => onUpdateDS(idx, { filter: { value: e.target.value } })}
                    className="input input-sm" />
                </div>
              )}

              {(config.dataSource?.kind === 'ref-aggregation' || config.dataSource?.kind === 'ref-records') && (
                <div>
                  <label className="label">ID справочника</label>
                  <input value={config.dataSource?.refTableId || ''} onChange={e => onUpdateDS(idx, { refTableId: e.target.value })}
                    className="input input-sm" placeholder="UUID" />
                </div>
              )}

              {(config.type === 'table' || config.type === 'list') && (
                <div>
                  <label className="label">Лимит строк</label>
                  <input type="number" min={1} max={100} value={config.dataSource?.limit || ''}
                    onChange={e => onUpdateDS(idx, { limit: Number(e.target.value) || undefined })}
                    className="input input-sm" placeholder="Без ограничения" />
                </div>
              )}
            </>
          )}

          {/* Format (number/gauge) */}
          {(config.type === 'number' || config.type === 'gauge') && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label">Формат</label>
                  <select value={config.format || 'number'} onChange={e => onUpdate(idx, { format: e.target.value as any })}
                    className="input input-sm">
                    <option value="number">Число</option>
                    <option value="percent">%</option>
                    <option value="currency">Валюта</option>
                    <option value="duration">Время</option>
                  </select>
                </div>
                <div>
                  <label className="label">Префикс</label>
                  <input value={config.prefix || ''} onChange={e => onUpdate(idx, { prefix: e.target.value })}
                    className="input input-sm" placeholder="$" />
                </div>
                <div>
                  <label className="label">Суффикс</label>
                  <input value={config.suffix || ''} onChange={e => onUpdate(idx, { suffix: e.target.value })}
                    className="input input-sm" placeholder="шт." />
                </div>
              </div>
            </>
          )}

          {/* Gauge min/max */}
          {config.type === 'gauge' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Min</label>
                <input type="number" value={config.min ?? 0} onChange={e => onUpdate(idx, { min: Number(e.target.value) })}
                  className="input input-sm" />
              </div>
              <div>
                <label className="label">Max</label>
                <input type="number" value={config.max ?? 100} onChange={e => onUpdate(idx, { max: Number(e.target.value) })}
                  className="input input-sm" />
              </div>
            </div>
          )}

          {/* Thresholds */}
          {(config.type === 'number' || config.type === 'gauge') && (
            <div>
              <label className="label">Пороги</label>
              <div className="space-y-1.5">
                {(config.thresholds || []).map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="color" value={t.color}
                      onChange={e => {
                        const next = [...(config.thresholds || [])]; next[i] = { ...t, color: e.target.value }
                        onUpdate(idx, { thresholds: next })
                      }}
                      className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="number" value={t.value}
                      onChange={e => {
                        const next = [...(config.thresholds || [])]; next[i] = { ...t, value: Number(e.target.value) }
                        onUpdate(idx, { thresholds: next })
                      }}
                      className="input input-sm flex-1" placeholder="Значение" />
                    <button onClick={() => onUpdate(idx, { thresholds: config.thresholds?.filter((_, j) => j !== i) })}
                      className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={() => onUpdate(idx, { thresholds: [...(config.thresholds || []), { value: 0, color: '#22c55e' }] })}
                  className="text-xs text-primary-600 hover:text-primary-800">+ Добавить порог</button>
              </div>
            </div>
          )}

          {/* Text content */}
          {config.type === 'text' && (
            <div>
              <label className="label">Содержимое (Markdown)</label>
              <textarea value={config.content || ''} onChange={e => onUpdate(idx, { content: e.target.value })}
                className="input text-sm min-h-[120px] font-mono" rows={6}
                placeholder={'# Заголовок\n\nТекст. Переменные: {{obj.name}}'} />
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="p-5 bg-surface-50">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Превью</h4>
          <ConfigurableWidget config={config} />
        </div>
      </div>
    </div>
  )
}
