import { useEffect, useState } from 'react'
import type { WidgetProps } from '../../../lib/widget-types'
import { resolveValue, formatValue } from './data-utils'

export default function NumberWidget({ obj, config, customTitle }: WidgetProps) {
  if (!config) return null
  const [value, setValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    resolveValue(config.dataSource, obj).then(v => {
      setValue(v)
      setLoading(false)
    })
  }, [config.dataSource, obj])

  const thresholds = config.thresholds || []
  const bgColor = getThresholdColor(value, thresholds)
  const formatted = formatValue(value, config.format, config.decimals, config.prefix, config.suffix)

  return (
    <div className="card h-full" style={bgColor ? { backgroundColor: bgColor + '18' } : undefined}>
      <div className="card-body flex flex-col items-center justify-center text-center py-6">
        {customTitle && (
          <p className="text-xs text-gray-500 uppercase font-medium mb-2 tracking-wider">{customTitle}</p>
        )}
        {loading ? (
          <div className="h-10 w-20 bg-gray-100 rounded animate-pulse" />
        ) : (
          <p className="text-3xl font-bold" style={bgColor ? { color: bgColor } : { color: '#1f2937' }}>
            {formatted}
          </p>
        )}
        {thresholds.length > 0 && (
          <div className="flex gap-1 mt-2">
            {thresholds.map((t, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] text-gray-400">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                {t.label || `≥${t.value}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getThresholdColor(value: number | null, thresholds: { value: number; color: string }[]): string | null {
  if (value === null || thresholds.length === 0) return null
  const sorted = [...thresholds].sort((a, b) => b.value - a.value)
  for (const t of sorted) {
    if (value >= t.value) return t.color
  }
  return null
}
