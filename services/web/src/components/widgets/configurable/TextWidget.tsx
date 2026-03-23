import type { WidgetProps } from '../../../lib/widget-types'

export default function TextWidget({ obj, config, customTitle }: WidgetProps) {
  if (!config) return null

  let content = config.content || ''

  // Replace template variables
  if (obj) {
    content = content.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path: string) => {
      const parts = path.split('.')
      let val: any = parts[0] === 'obj' ? obj : obj
      for (const p of parts[0] === 'obj' ? parts.slice(1) : parts) {
        val = val?.[p]
      }
      return val !== undefined && val !== null ? String(val) : '—'
    })
  }

  return (
    <div className="card h-full">
      {customTitle && (
        <div className="card-header">
          <h3 className="card-header-title">{customTitle}</h3>
        </div>
      )}
      <div className="card-body">
        <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{content}</div>
      </div>
    </div>
  )
}
