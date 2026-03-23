import type { WidgetProps } from '../../../lib/widget-types'

// Placeholder — real EventsTab is injected as override from ObjectCardPage
export default function EventsWidget({ obj }: WidgetProps) {
  if (!obj) return null
  return (
    <div className="card">
      <div className="card-body">
        <p className="text-sm text-gray-400">Загрузка ленты событий...</p>
      </div>
    </div>
  )
}
