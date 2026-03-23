import { useEffect, useState } from 'react'
import { Circle } from 'lucide-react'
import type { WidgetProps } from '../../../lib/widget-types'
import { api } from '../../../lib/api'

export default function ListWidget({ obj, config, customTitle }: WidgetProps) {
  if (!config) return null
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    loadData().finally(() => setLoading(false))
  }, [config.dataSource, obj])

  async function loadData() {
    const ds = config!.dataSource
    if (!ds) return

    let data: any[] = []
    if (ds.kind === 'todos') {
      data = await api.getTodos()
    } else if (ds.kind === 'objects' && obj) {
      const subtree = await api.getObjectSubtree(obj.id)
      data = subtree || []
    }

    if (ds.limit) data = data.slice(0, ds.limit)
    setItems(data)
  }

  return (
    <div className="card h-full">
      {customTitle && (
        <div className="card-header">
          <h3 className="card-header-title">{customTitle}</h3>
        </div>
      )}
      <div className="card-body">
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Нет элементов</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {items.map((item, i) => (
              <div key={item.id || i} className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-50 transition-colors">
                <Circle size={6} className="text-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-800 truncate">{item.name || item.title || '—'}</span>
                {item.status && (
                  <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{item.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
