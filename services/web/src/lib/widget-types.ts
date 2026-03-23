import { ComponentType } from 'react'
import type { WidgetConfig } from './widget-config-types'

export type PageType = 'dashboard' | 'object-main' | 'object-gantt' | 'object-ref-tables' | 'object-events' | 'admin-widgets'

export interface WidgetProps {
  obj?: any
  onDeleteNode?: (node: any) => void
  colSpan?: number  // current grid column span (1-12), for responsive layout
  customTitle?: string | null  // custom title override from layout
  config?: WidgetConfig | null  // configuration for configurable widgets
}

export interface WidgetDefinition {
  id: string
  title: string
  icon: any
  iconBg: string
  iconColor: string
  category: string
  component: ComponentType<WidgetProps>
  defaultColSpan: number
  minColSpan: number
  maxColSpan: number
  pageTypes: PageType[]
}

export interface WidgetPlacement {
  widgetId: string
  colSpan: number
  height?: number | null  // undefined/null = auto (natural height), number = px
  title?: string | null   // null/undefined = use default from registry
  order: number
  visible: boolean
  config?: WidgetConfig | null  // for configurable widgets
}

export interface LayoutConfig {
  placements: WidgetPlacement[]
}
