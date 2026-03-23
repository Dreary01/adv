import { BarChart3 } from 'lucide-react'
import type { WidgetProps } from '../../../lib/widget-types'

export default function ChartWidget({ customTitle }: WidgetProps) {
  return (
    <div className="card h-full">
      {customTitle && (
        <div className="card-header">
          <h3 className="card-header-title">{customTitle}</h3>
        </div>
      )}
      <div className="card-body flex flex-col items-center justify-center py-10 text-center">
        <BarChart3 size={32} className="text-gray-300 mb-3" />
        <p className="text-sm text-gray-500 font-medium">Диаграмма</p>
        <p className="text-xs text-gray-400 mt-1">Визуализация данных будет реализована позже</p>
      </div>
    </div>
  )
}
