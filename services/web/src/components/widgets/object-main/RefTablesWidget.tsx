import type { WidgetProps } from '../../../lib/widget-types'

// Placeholder — real RefTablesTab is injected as override from ObjectCardPage
export default function RefTablesWidget({ obj }: WidgetProps) {
  if (!obj) return null
  return (
    <div className="card">
      <div className="card-body">
        <p className="text-sm text-gray-400">Загрузка справочников...</p>
      </div>
    </div>
  )
}
