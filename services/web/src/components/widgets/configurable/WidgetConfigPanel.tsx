import { useState } from 'react'
import { X, Hash, Gauge, Type, Table, List, BarChart3 } from 'lucide-react'
import type { WidgetConfig, ConfigWidgetType } from '../../../lib/widget-config-types'
import { CONFIG_WIDGET_TYPES } from '../../../lib/widget-config-types'

const iconMap: Record<string, any> = {
  Hash, Gauge, Type, Table, List, BarChart3,
}

interface WidgetConfigPanelProps {
  config: WidgetConfig | null
  onSave: (config: WidgetConfig) => void
  onClose: () => void
}

export default function WidgetConfigPanel({ config, onSave, onClose }: WidgetConfigPanelProps) {
  const [cfg, setCfg] = useState<WidgetConfig>(config || { type: 'number' })

  const update = (patch: Partial<WidgetConfig>) => setCfg(prev => ({ ...prev, ...patch }))
  const updateDS = (patch: Record<string, any>) => setCfg(prev => ({
    ...prev,
    dataSource: { ...prev.dataSource, kind: prev.dataSource?.kind || 'object-field', ...patch },
  }))

  return (
    <>
      <div className="widget-library-overlay" onClick={onClose} />
      <div className="widget-library-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Настройка виджета</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Widget type */}
          <div>
            <label className="label">Тип виджета</label>
            <div className="grid grid-cols-2 gap-1.5">
              {CONFIG_WIDGET_TYPES.map(t => {
                const Icon = iconMap[t.icon] || Hash
                return (
                  <button key={t.type} onClick={() => update({ type: t.type })}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${
                      cfg.type === t.type ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300' : 'hover:bg-gray-50 text-gray-600'
                    }`}>
                    <Icon size={14} />
                    <div>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-[10px] text-gray-400">{t.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Data source */}
          {cfg.type !== 'text' && cfg.type !== 'chart' && (
            <div>
              <label className="label">Источник данных</label>
              <select value={cfg.dataSource?.kind || 'object-field'} onChange={e => updateDS({ kind: e.target.value })}
                className="input input-sm">
                <option value="object-field">Поле объекта</option>
                <option value="object-count">Количество объектов</option>
                <option value="ref-aggregation">Агрегация справочника</option>
                <option value="ref-records">Записи справочника</option>
                <option value="todos">Список дел</option>
                <option value="static">Статическое значение</option>
              </select>
            </div>
          )}

          {/* Field selection for object-field */}
          {cfg.dataSource?.kind === 'object-field' && (
            <div>
              <label className="label">Поле</label>
              <select value={cfg.dataSource.field || ''} onChange={e => updateDS({ field: e.target.value })}
                className="input input-sm">
                <option value="">Выберите поле...</option>
                <option value="progress">Прогресс</option>
                <option value="priority">Приоритет</option>
                <option value="plan_duration_days">Длительность (дни)</option>
              </select>
            </div>
          )}

          {/* Static value */}
          {cfg.dataSource?.kind === 'static' && (
            <div>
              <label className="label">Значение</label>
              <input type="number" value={cfg.dataSource.filter?.value || ''}
                onChange={e => updateDS({ filter: { value: e.target.value } })}
                className="input input-sm" />
            </div>
          )}

          {/* Ref table selection */}
          {(cfg.dataSource?.kind === 'ref-aggregation' || cfg.dataSource?.kind === 'ref-records') && (
            <div>
              <label className="label">ID справочника</label>
              <input value={cfg.dataSource.refTableId || ''}
                onChange={e => updateDS({ refTableId: e.target.value })}
                className="input input-sm" placeholder="UUID справочника" />
            </div>
          )}

          {/* Limit */}
          {(cfg.type === 'table' || cfg.type === 'list') && (
            <div>
              <label className="label">Лимит строк</label>
              <input type="number" min={1} max={100} value={cfg.dataSource?.limit || ''}
                onChange={e => updateDS({ limit: Number(e.target.value) || undefined })}
                className="input input-sm" placeholder="Без ограничения" />
            </div>
          )}

          {/* Format (number/gauge) */}
          {(cfg.type === 'number' || cfg.type === 'gauge') && (
            <>
              <div>
                <label className="label">Формат</label>
                <select value={cfg.format || 'number'} onChange={e => update({ format: e.target.value as any })}
                  className="input input-sm">
                  <option value="number">Число</option>
                  <option value="percent">Процент</option>
                  <option value="currency">Валюта</option>
                  <option value="duration">Длительность</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Префикс</label>
                  <input value={cfg.prefix || ''} onChange={e => update({ prefix: e.target.value })}
                    className="input input-sm" placeholder="напр. $" />
                </div>
                <div>
                  <label className="label">Суффикс</label>
                  <input value={cfg.suffix || ''} onChange={e => update({ suffix: e.target.value })}
                    className="input input-sm" placeholder="напр. шт." />
                </div>
              </div>
            </>
          )}

          {/* Gauge min/max */}
          {cfg.type === 'gauge' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Минимум</label>
                <input type="number" value={cfg.min ?? 0} onChange={e => update({ min: Number(e.target.value) })}
                  className="input input-sm" />
              </div>
              <div>
                <label className="label">Максимум</label>
                <input type="number" value={cfg.max ?? 100} onChange={e => update({ max: Number(e.target.value) })}
                  className="input input-sm" />
              </div>
            </div>
          )}

          {/* Thresholds */}
          {(cfg.type === 'number' || cfg.type === 'gauge') && (
            <div>
              <label className="label">Пороги</label>
              <div className="space-y-1.5">
                {(cfg.thresholds || []).map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="color" value={t.color}
                      onChange={e => {
                        const next = [...(cfg.thresholds || [])]
                        next[i] = { ...t, color: e.target.value }
                        update({ thresholds: next })
                      }}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
                    <input type="number" value={t.value}
                      onChange={e => {
                        const next = [...(cfg.thresholds || [])]
                        next[i] = { ...t, value: Number(e.target.value) }
                        update({ thresholds: next })
                      }}
                      className="input input-sm flex-1" placeholder="Значение" />
                    <button onClick={() => update({ thresholds: cfg.thresholds?.filter((_, j) => j !== i) })}
                      className="p-1 text-gray-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button onClick={() => update({ thresholds: [...(cfg.thresholds || []), { value: 0, color: '#22c55e' }] })}
                  className="text-xs text-primary-600 hover:text-primary-800">
                  + Добавить порог
                </button>
              </div>
            </div>
          )}

          {/* Text content */}
          {cfg.type === 'text' && (
            <div>
              <label className="label">Содержимое (Markdown)</label>
              <textarea value={cfg.content || ''} onChange={e => update({ content: e.target.value })}
                className="input text-sm min-h-[120px] font-mono" rows={6}
                placeholder="# Заголовок\n\nТекст. Переменные: {{obj.name}}, {{obj.progress}}" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost btn-sm">Отмена</button>
          <button onClick={() => onSave(cfg)} className="btn-primary btn-sm">Сохранить</button>
        </div>
      </div>
    </>
  )
}
