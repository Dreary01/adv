import type { WidgetDataSource } from '../../../lib/widget-config-types'
import { api } from '../../../lib/api'

export async function resolveValue(dataSource: WidgetDataSource | undefined, obj?: any): Promise<number | null> {
  if (!dataSource) return null

  switch (dataSource.kind) {
    case 'object-field': {
      if (!obj || !dataSource.field) return null
      const val = obj[dataSource.field] ?? obj.field_values?.[dataSource.field]
      return typeof val === 'number' ? val : Number(val) || null
    }
    case 'object-count': {
      if (!obj) return null
      try {
        const result = await api.getDescendantsCount(obj.id)
        return typeof result === 'number' ? result : result?.count ?? null
      } catch { return null }
    }
    case 'ref-aggregation': {
      if (!dataSource.refTableId) return null
      try {
        const agg = await api.getRefAggregations(dataSource.refTableId, obj?.id)
        if (dataSource.column && agg?.[dataSource.column]) {
          const val = agg[dataSource.column][dataSource.aggregation || 'sum']
          return typeof val === 'number' ? val : Number(val) || null
        }
        return null
      } catch { return null }
    }
    case 'static': {
      return dataSource.filter?.value ? Number(dataSource.filter.value) : null
    }
    default:
      return null
  }
}

export function formatValue(
  value: number | null,
  format?: string,
  decimals?: number,
  prefix?: string,
  suffix?: string,
): string {
  if (value === null) return '—'
  const d = decimals ?? (format === 'percent' ? 0 : 1)
  let formatted: string

  switch (format) {
    case 'percent':
      formatted = `${value.toFixed(d)}%`
      break
    case 'currency':
      formatted = new Intl.NumberFormat('ru-RU', { style: 'decimal', minimumFractionDigits: d, maximumFractionDigits: d }).format(value)
      break
    case 'duration':
      if (value >= 24) formatted = `${Math.floor(value / 24)}д ${Math.round(value % 24)}ч`
      else formatted = `${value.toFixed(d)} ч`
      break
    default:
      formatted = Number.isInteger(value) && d === 0 ? String(value) : value.toFixed(d)
  }

  return `${prefix || ''}${formatted}${suffix || ''}`
}
