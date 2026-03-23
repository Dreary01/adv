import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { api } from '../../../lib/api'
import { formatDateRu, businessDaysBetween, calculateForecast } from '../../../lib/date-utils'
import type { WidgetProps } from '../../../lib/widget-types'

export default function DatesWidget({ obj, colSpan = 12, customTitle }: WidgetProps) {
  if (!obj) return null

  const plans = obj.plans || []
  const baseline = plans.find((p: any) => p.plan_type === 'baseline')
  const operational = plans.find((p: any) => p.plan_type === 'operational')
  const forecast = calculateForecast(obj)

  const [editDates, setEditDates] = useState(false)
  const [dateForm, setDateForm] = useState({
    start_date: operational?.start_date || '',
    end_date: operational?.end_date || '',
    duration_days: operational?.duration_days || '',
    effort_hours: operational?.effort_hours || '',
  })
  const [saving, setSaving] = useState(false)

  const startEditDates = () => {
    setDateForm({
      start_date: operational?.start_date || '',
      end_date: operational?.end_date || '',
      duration_days: operational?.duration_days || '',
      effort_hours: operational?.effort_hours || '',
    })
    setEditDates(true)
  }

  const saveDates = async () => {
    setSaving(true)
    try {
      await api.upsertOperationalPlan(obj.id, {
        start_date: dateForm.start_date || null,
        end_date: dateForm.end_date || null,
        duration_days: dateForm.duration_days ? Number(dateForm.duration_days) : null,
        effort_hours: dateForm.effort_hours ? Number(dateForm.effort_hours) : null,
      })
      setEditDates(false)
      window.location.reload()
    } catch { }
    setSaving(false)
  }

  const handleCreateBaseline = async () => {
    await api.createBaseline(obj.id)
    window.location.reload()
  }

  const duration = dateForm.start_date && dateForm.end_date
    ? businessDaysBetween(dateForm.start_date, dateForm.end_date)
    : operational?.duration_days || null

  // Adapt: 1 col at ≤5, 2 col at ≤8, 3 col at 9+
  const gridCols = colSpan <= 5 ? 'grid-cols-1' : colSpan <= 8 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-header-title">{customTitle || 'Сроки'}</h3>
        {!editDates && (
          <button onClick={startEditDates} className="btn-ghost btn-sm">
            <Pencil size={13} /> Изменить
          </button>
        )}
      </div>
      <div className="card-body">
        <div className={`grid ${gridCols} gap-6`}>
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Оперативный план</h4>
            {editDates ? (
              <div className="space-y-3">
                <div>
                  <label className="label">Начало</label>
                  <input type="date" value={dateForm.start_date}
                    onChange={e => setDateForm({ ...dateForm, start_date: e.target.value })}
                    className="input input-sm" />
                </div>
                <div>
                  <label className="label">Завершение</label>
                  <input type="date" value={dateForm.end_date}
                    onChange={e => setDateForm({ ...dateForm, end_date: e.target.value })}
                    className="input input-sm" />
                </div>
                <div>
                  <label className="label">Длительность (раб. дн.)</label>
                  <input type="number" min="1" value={dateForm.duration_days}
                    onChange={e => setDateForm({ ...dateForm, duration_days: e.target.value })}
                    className="input input-sm" placeholder={duration ? String(duration) : '—'} />
                </div>
                <div>
                  <label className="label">Трудозатраты (ч.)</label>
                  <input type="number" min="0" step="0.5" value={dateForm.effort_hours}
                    onChange={e => setDateForm({ ...dateForm, effort_hours: e.target.value })}
                    className="input input-sm" placeholder="—" />
                </div>
                <div className="form-actions">
                  <button onClick={saveDates} disabled={saving} className="btn-primary btn-xs">
                    {saving ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  <button onClick={() => setEditDates(false)} className="btn-ghost btn-xs">Отмена</button>
                </div>
              </div>
            ) : (
              <DateReadonly label="Оперативный" items={[
                { label: 'Начало', value: formatDateRu(operational?.start_date), highlight: true },
                { label: 'Завершение', value: formatDateRu(operational?.end_date), highlight: true },
                { label: 'Длительность', value: operational?.duration_days ? `${operational.duration_days} раб. дн.` : '—' },
                ...(operational?.effort_hours ? [{ label: 'Трудозатраты', value: `${operational.effort_hours} ч.` }] : []),
              ]} />
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Утверждённый план</h4>
            {baseline ? (
              <DateReadonly items={[
                { label: 'Начало', value: formatDateRu(baseline.start_date) },
                { label: 'Завершение', value: formatDateRu(baseline.end_date) },
                ...(baseline.duration_days ? [{ label: 'Длительность', value: `${baseline.duration_days} раб. дн.` }] : []),
              ]} />
            ) : (
              <p className="text-xs text-gray-400 italic">Не утверждён</p>
            )}
            {operational && (
              <button onClick={handleCreateBaseline} className="btn-secondary btn-xs mt-3">
                {baseline ? 'Обновить' : 'Утвердить'}
              </button>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Фактические</h4>
            <DateReadonly items={[
              { label: 'Начало', value: formatDateRu(obj.actual_start_date) },
              { label: 'Завершение', value: formatDateRu(obj.actual_end_date) },
            ]} />
            {obj.status !== 'completed' && (forecast.start || forecast.end) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Прогноз</h4>
                <DateReadonly items={[
                  { label: 'Начало', value: formatDateRu(forecast.start), cls: 'text-blue-600' },
                  { label: 'Завершение', value: formatDateRu(forecast.end), cls: 'text-blue-600' },
                ]} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DateReadonly({ items, label }: {
  label?: string
  items: { label: string; value: string; highlight?: boolean; cls?: string }[]
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span className="text-xs text-gray-500 flex-shrink-0">{item.label}</span>
          <span className={`text-sm text-right truncate ${item.cls || (item.highlight ? 'font-semibold text-orange-500' : 'text-gray-700')}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
