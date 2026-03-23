import type { WidgetProps } from '../../../lib/widget-types'

export default function DescriptionWidget({ obj, customTitle }: WidgetProps) {
  if (!obj) return null

  return (
    <div className="card h-full">
      <div className="card-header">
        <h3 className="card-header-title">{customTitle || 'Описание'}</h3>
      </div>
      <div className="card-body">
        {obj.description ? (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{obj.description}</p>
        ) : (
          <p className="text-sm text-gray-400">Описание не заполнено</p>
        )}
      </div>
    </div>
  )
}
