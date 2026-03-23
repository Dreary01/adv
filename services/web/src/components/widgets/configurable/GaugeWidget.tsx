import { useEffect, useState } from 'react'
import type { WidgetProps } from '../../../lib/widget-types'
import { resolveValue, formatValue } from './data-utils'

export default function GaugeWidget({ obj, config, customTitle }: WidgetProps) {
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

  const min = config.min ?? 0
  const max = config.max ?? 100
  const thresholds = config.thresholds || []
  const pct = value !== null ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0
  const formatted = formatValue(value, config.format, config.decimals, config.prefix, config.suffix)

  // Build gradient from thresholds
  const gradientStops = buildGradient(thresholds, min, max)

  return (
    <div className="card h-full">
      <div className="card-body flex flex-col items-center justify-center py-6">
        {customTitle && (
          <p className="text-xs text-gray-500 uppercase font-medium mb-3 tracking-wider">{customTitle}</p>
        )}

        {/* Arc gauge */}
        <div className="relative w-32 h-16 overflow-hidden">
          <svg viewBox="0 0 120 60" className="w-full h-full">
            {/* Background arc */}
            <path d="M 10 55 A 50 50 0 0 1 110 55" fill="none" stroke="#e5e7eb" strokeWidth="8" strokeLinecap="round" />
            {/* Threshold zones */}
            {gradientStops.map((stop, i) => {
              const nextStop = gradientStops[i + 1]
              if (!nextStop) return null
              const startAngle = Math.PI * (1 - stop.pct / 100)
              const endAngle = Math.PI * (1 - nextStop.pct / 100)
              const x1 = 60 + 50 * Math.cos(startAngle)
              const y1 = 55 - 50 * Math.sin(startAngle)
              const x2 = 60 + 50 * Math.cos(endAngle)
              const y2 = 55 - 50 * Math.sin(endAngle)
              const largeArc = (stop.pct - nextStop.pct) > 50 ? 1 : 0
              return (
                <path key={i} d={`M ${x1} ${y1} A 50 50 0 ${largeArc} 0 ${x2} ${y2}`}
                  fill="none" stroke={stop.color} strokeWidth="8" strokeLinecap="round" opacity="0.3" />
              )
            })}
            {/* Value arc */}
            {!loading && value !== null && (
              <path
                d={`M 10 55 A 50 50 0 ${pct > 50 ? 1 : 0} 1 ${60 + 50 * Math.cos(Math.PI * (1 - pct / 100))} ${55 - 50 * Math.sin(Math.PI * (1 - pct / 100))}`}
                fill="none" stroke={getThresholdColor(value, thresholds) || '#3d5af5'} strokeWidth="8" strokeLinecap="round"
              />
            )}
          </svg>
        </div>

        {loading ? (
          <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-xl font-bold text-gray-900 -mt-1">{formatted}</p>
        )}

        <div className="flex justify-between w-full px-2 mt-1">
          <span className="text-[10px] text-gray-400">{min}</span>
          <span className="text-[10px] text-gray-400">{max}</span>
        </div>
      </div>
    </div>
  )
}

function getThresholdColor(value: number | null, thresholds: { value: number; color: string }[]): string | null {
  if (value === null || thresholds.length === 0) return null
  const sorted = [...thresholds].sort((a, b) => b.value - a.value)
  for (const t of sorted) { if (value >= t.value) return t.color }
  return null
}

function buildGradient(thresholds: { value: number; color: string }[], min: number, max: number) {
  if (thresholds.length === 0) return []
  const range = max - min
  const sorted = [...thresholds].sort((a, b) => a.value - b.value)
  return sorted.map(t => ({ pct: ((t.value - min) / range) * 100, color: t.color }))
}
