import type { WidgetProps } from '../../../lib/widget-types'

// Placeholder — real GanttTab is injected as override from ObjectCardPage
export default function GanttWidget({ obj }: WidgetProps) {
  if (!obj) return null
  return (
    <div className="card">
      <div className="card-body">
        <p className="text-sm text-gray-400">Загрузка диаграммы Ганта...</p>
      </div>
    </div>
  )
}
