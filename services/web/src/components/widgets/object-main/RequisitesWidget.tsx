import type { WidgetProps } from '../../../lib/widget-types'

export default function RequisitesWidget({ obj, colSpan = 12, customTitle }: WidgetProps) {
  if (!obj) return null

  const narrow = colSpan !== undefined && colSpan <= 5

  return (
    <div className="card h-full">
      <div className="card-header">
        <h3 className="card-header-title">{customTitle || 'Реквизиты проекта'}</h3>
      </div>
      <div className="card-body">
        {obj.field_values && Object.keys(obj.field_values).length > 0 ? (
          narrow ? (
            // Stacked layout for narrow containers
            <div className="space-y-3">
              {Object.entries(obj.field_values).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-gray-500 mb-0.5">{key}</p>
                  <p className="text-sm text-gray-900">{String(value)}</p>
                </div>
              ))}
            </div>
          ) : (
            // Table layout for wider containers
            <table className="w-full">
              <tbody className="divide-y divide-gray-50">
                {Object.entries(obj.field_values).map(([key, value]) => (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-sm text-gray-500 whitespace-nowrap">{key}</td>
                    <td className="py-2 text-sm text-gray-900 break-words">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <p className="text-sm text-gray-400">Нет заполненных реквизитов</p>
        )}
      </div>
    </div>
  )
}
