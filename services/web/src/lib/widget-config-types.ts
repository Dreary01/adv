export type ConfigWidgetType = 'number' | 'gauge' | 'table' | 'list' | 'text' | 'chart'

export interface WidgetDataSource {
  kind: 'object-field' | 'object-count' | 'ref-aggregation' | 'ref-records' | 'objects' | 'todos' | 'static'
  field?: string
  refTableId?: string
  column?: string
  aggregation?: string
  filter?: Record<string, string>
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export interface WidgetThreshold {
  value: number
  color: string
  label?: string
}

export interface WidgetConfig {
  type: ConfigWidgetType

  dataSource?: WidgetDataSource

  // Display
  format?: 'number' | 'percent' | 'currency' | 'duration' | 'date'
  prefix?: string
  suffix?: string
  decimals?: number

  // Thresholds (number/gauge)
  thresholds?: WidgetThreshold[]

  // Gauge
  min?: number
  max?: number

  // Table
  columns?: string[]
  showAggregation?: boolean

  // Text
  content?: string
}

export const CONFIG_WIDGET_TYPES: { type: ConfigWidgetType; label: string; description: string; icon: string }[] = [
  { type: 'number', label: 'Число', description: 'Одно значение с порогами цвета', icon: 'Hash' },
  { type: 'gauge', label: 'Шкала', description: 'Прогресс-шкала с min/max', icon: 'Gauge' },
  { type: 'text', label: 'Текст', description: 'Markdown-текст с переменными', icon: 'Type' },
  { type: 'table', label: 'Таблица', description: 'Данные из справочника или объектов', icon: 'Table' },
  { type: 'list', label: 'Список', description: 'Компактный список элементов', icon: 'List' },
  { type: 'chart', label: 'Диаграмма', description: 'Столбчатая/круговая (скоро)', icon: 'BarChart3' },
]
