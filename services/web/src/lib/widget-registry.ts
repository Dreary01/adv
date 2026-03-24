import { lazy, Suspense, createElement, ComponentType } from 'react'
import { Inbox, ListTodo, Newspaper, FolderTree, Activity, BarChart3, Calendar, FileText, List, GanttChart, Database, Clock, Wrench } from 'lucide-react'
import type { WidgetDefinition, PageType, LayoutConfig, WidgetProps } from './widget-types'
import { setRegistryAccessors } from './layout-store'

// Dashboard widgets
import RequestsWidget from '../components/widgets/dashboard/RequestsWidget'
import TodosWidget from '../components/widgets/dashboard/TodosWidget'
import NewsWidget from '../components/widgets/dashboard/NewsWidget'
import DirectionsWidget from '../components/widgets/dashboard/DirectionsWidget'
import EventFeedWidget from '../components/widgets/dashboard/EventFeedWidget'

// Object-main widgets
import StatusMetricsWidget from '../components/widgets/object-main/StatusMetricsWidget'
import DatesWidget from '../components/widgets/object-main/DatesWidget'
import RequisitesWidget from '../components/widgets/object-main/RequisitesWidget'
import DescriptionWidget from '../components/widgets/object-main/DescriptionWidget'
import HierarchyWidget from '../components/widgets/object-main/HierarchyWidget'

// Configurable widget
import ConfigurableWidget from '../components/widgets/configurable/ConfigurableWidget'

// Lazy-loaded heavy widgets — only loaded when their tab is opened
const LazyGanttWidget = lazy(() => import('../components/widgets/object-main/GanttWidget'))
const GanttWidget: ComponentType<WidgetProps> = (props) =>
  createElement(Suspense, { fallback: createElement('div', { className: 'flex items-center justify-center h-64 text-gray-400 text-sm' }, 'Загрузка диаграммы...') },
    createElement(LazyGanttWidget, props))

// Regular imports for lighter widgets
import RefTablesWidget from '../components/widgets/object-main/RefTablesWidget'
import EventsWidget from '../components/widgets/object-main/EventsWidget'

const registry = new Map<string, WidgetDefinition>()

export function registerWidget(def: WidgetDefinition) {
  registry.set(def.id, def)
}

export function getWidget(id: string): WidgetDefinition | undefined {
  const def = registry.get(id)
  if (def) return def
  // Dynamic configurable widgets: cfg-xxx → use 'configurable' definition
  if (id.startsWith('cfg-')) return registry.get('configurable')
  return undefined
}

export function getWidgetsForPage(pageType: PageType): WidgetDefinition[] {
  return Array.from(registry.values()).filter(w => w.pageTypes.includes(pageType))
}

export function getAllWidgets(): WidgetDefinition[] {
  return Array.from(registry.values())
}

export function getValidWidgetIds(pageType: PageType): Set<string> {
  return new Set(getWidgetsForPage(pageType).map(w => w.id))
}

// Default layouts
const defaultLayouts: Record<PageType, () => LayoutConfig> = {
  dashboard: () => ({
    placements: [
      { widgetId: 'requests', colSpan: 12, height: null, order: 0, visible: true },
      { widgetId: 'todos', colSpan: 6, height: null, order: 1, visible: true },
      { widgetId: 'news', colSpan: 6, height: null, order: 2, visible: true },
      { widgetId: 'directions', colSpan: 12, height: null, order: 3, visible: true },
      { widgetId: 'event-feed', colSpan: 12, height: null, order: 4, visible: true },
    ],
  }),
  'object-main': () => ({
    placements: [
      { widgetId: 'status-metrics', colSpan: 4, height: null, order: 0, visible: true },
      { widgetId: 'dates', colSpan: 8, height: null, order: 1, visible: true },
      { widgetId: 'requisites', colSpan: 6, height: null, order: 2, visible: true },
      { widgetId: 'description', colSpan: 6, height: null, order: 3, visible: true },
      { widgetId: 'hierarchy', colSpan: 12, height: null, order: 4, visible: true },
    ],
  }),
  'object-gantt': () => ({
    placements: [
      { widgetId: 'gantt-chart', colSpan: 12, height: null, order: 0, visible: true },
    ],
  }),
  'object-ref-tables': () => ({
    placements: [
      { widgetId: 'ref-tables', colSpan: 12, height: null, order: 0, visible: true },
    ],
  }),
  'object-events': () => ({
    placements: [
      { widgetId: 'events-feed', colSpan: 12, height: null, order: 0, visible: true },
    ],
  }),
  'admin-widgets': () => ({
    placements: [],
  }),
}

export function getDefaultLayout(pageType: PageType): LayoutConfig {
  return defaultLayouts[pageType]()
}

// Register all widgets — Dashboard
registerWidget({
  id: 'requests', title: 'Запросы', icon: Inbox, category: 'Дашборд',
  iconBg: 'bg-violet-50', iconColor: 'text-violet-600',
  component: RequestsWidget, defaultColSpan: 12, minColSpan: 6, maxColSpan: 12,
  pageTypes: ['dashboard'],
})
registerWidget({
  id: 'todos', title: 'Список дел', icon: ListTodo, category: 'Дашборд',
  iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
  component: TodosWidget, defaultColSpan: 6, minColSpan: 4, maxColSpan: 12,
  pageTypes: ['dashboard'],
})
registerWidget({
  id: 'news', title: 'Новости', icon: Newspaper, category: 'Дашборд',
  iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
  component: NewsWidget, defaultColSpan: 6, minColSpan: 4, maxColSpan: 12,
  pageTypes: ['dashboard'],
})
registerWidget({
  id: 'directions', title: 'Направления', icon: FolderTree, category: 'Дашборд',
  iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
  component: DirectionsWidget, defaultColSpan: 12, minColSpan: 6, maxColSpan: 12,
  pageTypes: ['dashboard'],
})
registerWidget({
  id: 'event-feed', title: 'Лента событий', icon: Activity, category: 'Общие',
  iconBg: 'bg-rose-50', iconColor: 'text-rose-600',
  component: EventFeedWidget, defaultColSpan: 12, minColSpan: 6, maxColSpan: 12,
  pageTypes: ['dashboard'],
})

// Project widgets
registerWidget({
  id: 'status-metrics', title: 'Статус', icon: BarChart3, category: 'Проект',
  iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
  component: StatusMetricsWidget, defaultColSpan: 4, minColSpan: 3, maxColSpan: 12,
  pageTypes: ['object-main'],
})
registerWidget({
  id: 'dates', title: 'Сроки', icon: Calendar, category: 'Проект',
  iconBg: 'bg-orange-50', iconColor: 'text-orange-600',
  component: DatesWidget, defaultColSpan: 12, minColSpan: 8, maxColSpan: 12,
  pageTypes: ['object-main'],
})
registerWidget({
  id: 'requisites', title: 'Реквизиты', icon: FileText, category: 'Проект',
  iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600',
  component: RequisitesWidget, defaultColSpan: 6, minColSpan: 4, maxColSpan: 12,
  pageTypes: ['object-main'],
})
registerWidget({
  id: 'description', title: 'Описание', icon: FileText, category: 'Проект',
  iconBg: 'bg-gray-50', iconColor: 'text-gray-600',
  component: DescriptionWidget, defaultColSpan: 6, minColSpan: 4, maxColSpan: 12,
  pageTypes: ['object-main'],
})
registerWidget({
  id: 'hierarchy', title: 'Иерархия', icon: List, category: 'Проект',
  iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600',
  component: HierarchyWidget, defaultColSpan: 12, minColSpan: 8, maxColSpan: 12,
  pageTypes: ['object-main'],
})

// Visualization widgets
registerWidget({
  id: 'gantt-chart', title: 'Диаграмма Ганта', icon: GanttChart, category: 'Визуализация',
  iconBg: 'bg-teal-50', iconColor: 'text-teal-600',
  component: GanttWidget, defaultColSpan: 12, minColSpan: 8, maxColSpan: 12,
  pageTypes: ['object-gantt'],
})
registerWidget({
  id: 'ref-tables', title: 'Справочники', icon: Database, category: 'Визуализация',
  iconBg: 'bg-purple-50', iconColor: 'text-purple-600',
  component: RefTablesWidget, defaultColSpan: 12, minColSpan: 6, maxColSpan: 12,
  pageTypes: ['object-ref-tables'],
})
registerWidget({
  id: 'events-feed', title: 'Лента событий', icon: Clock, category: 'Общие',
  iconBg: 'bg-rose-50', iconColor: 'text-rose-600',
  component: EventsWidget, defaultColSpan: 12, minColSpan: 6, maxColSpan: 12,
  pageTypes: ['object-events'],
})

// Configurable widget (user-created)
registerWidget({
  id: 'configurable', title: 'Настраиваемый', icon: Wrench, category: 'Пользовательские',
  iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
  component: ConfigurableWidget, defaultColSpan: 4, minColSpan: 2, maxColSpan: 12,
  pageTypes: ['dashboard', 'object-main', 'object-gantt', 'object-ref-tables', 'object-events', 'admin-widgets'],
})

// Wire up to layout store
setRegistryAccessors(getDefaultLayout, getValidWidgetIds)
