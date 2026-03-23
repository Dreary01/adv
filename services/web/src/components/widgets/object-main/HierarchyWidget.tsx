import type { WidgetProps } from '../../../lib/widget-types'

// HierarchyWidget is a thin wrapper — the actual HierarchyTab component
// stays in ObjectCardPage.tsx since it's very large and tightly coupled.
// This widget just re-exports the props interface for the registry.
// The actual rendering is handled by WidgetGrid which passes through to HierarchyTab.

export default function HierarchyWidget({ obj, onDeleteNode }: WidgetProps) {
  // This component is a placeholder — the real HierarchyTab is injected
  // during widget registration in ObjectCardPage to avoid circular deps.
  if (!obj) return null
  return (
    <div className="card">
      <div className="card-body">
        <p className="text-sm text-gray-400">Загрузка иерархии...</p>
      </div>
    </div>
  )
}
