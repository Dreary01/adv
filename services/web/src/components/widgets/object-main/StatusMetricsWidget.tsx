import { Play, Pause, Square } from 'lucide-react'
import type { WidgetProps } from '../../../lib/widget-types'

const statusCssClass: Record<string, string> = {
  not_started: 'status-not-started',
  in_progress: 'status-in-progress',
  completed: 'status-completed',
  on_hold: 'status-on-hold',
  cancelled: 'status-cancelled',
}

const statusLabel: Record<string, string> = {
  not_started: 'Не начат',
  in_progress: 'В работе',
  completed: 'Завершён',
  on_hold: 'Приостановлен',
  cancelled: 'Отменён',
}

export default function StatusMetricsWidget({ obj, customTitle }: WidgetProps) {
  if (!obj) return null
  const stClass = statusCssClass[obj.status] || 'status-not-started'
  const stLabel = statusLabel[obj.status] || statusLabel.not_started

  return (
    <div className="card h-full">
      <div className="card-body">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 uppercase font-medium">{customTitle || 'Статус'}</span>
          <div className="flex gap-1">
            <button className="btn-icon-sm text-blue-500" title="Старт"><Play size={12} /></button>
            <button className="btn-icon-sm text-amber-500" title="Пауза"><Pause size={12} /></button>
            <button className="btn-icon-sm text-red-500" title="Стоп"><Square size={12} /></button>
          </div>
        </div>
        <p className="text-2xl font-bold text-gray-900">{obj.progress}%</p>
        <span className={stClass}>{stLabel}</span>
        <div className="progress-bar mt-2">
          <div className="progress-bar-fill progress-bar-fill-green" style={{ width: `${obj.progress}%` }} />
        </div>
      </div>
    </div>
  )
}
