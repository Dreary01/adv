import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { Inbox, Circle } from 'lucide-react'
import { Briefcase, Target, Layers, Flag, CheckSquare, Users, Folder } from 'lucide-react'
import { WidgetCard, EmptyState, Skeleton } from '../../ui/WidgetCard'

const iconMap: Record<string, any> = {
  briefcase: Briefcase, target: Target, layers: Layers, flag: Flag,
  'check-square': CheckSquare, users: Users, folder: Folder,
}

const priorityLabel = (p: number) => {
  const map: Record<number, { text: string; cls: string }> = {
    4: { text: 'Критический', cls: 'badge-red' },
    3: { text: 'Высокий', cls: 'badge-orange' },
    2: { text: 'Средний', cls: 'badge-amber' },
    1: { text: 'Низкий', cls: 'badge-blue' },
  }
  return map[p] || null
}

const statusLabel = (s: string) => {
  const map: Record<string, { text: string; cls: string }> = {
    not_started: { text: 'Не начат', cls: 'badge-gray' },
    in_progress: { text: 'В работе', cls: 'badge-blue' },
  }
  return map[s] || { text: s, cls: 'badge-gray' }
}

import type { WidgetProps } from '../../../lib/widget-types'

export default function RequestsWidget({ customTitle }: WidgetProps) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDashboardRequests().then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard icon={Inbox} title={customTitle || "Запросы"} count={items.length} iconBg="bg-violet-50" iconColor="text-violet-600">
      {loading ? <Skeleton /> : items.length === 0 ? (
        <EmptyState text="Нет входящих запросов" />
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map(item => {
            const pr = priorityLabel(item.priority)
            const st = statusLabel(item.status)
            const Icon = iconMap[item.type_icon] || Circle
            return (
              <div key={item.id} className="flex items-center gap-3 py-2.5 px-1 hover:bg-gray-50/70 rounded-lg transition-colors cursor-pointer">
                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                     style={{ backgroundColor: (item.type_color || '#3d5af5') + '14', color: item.type_color || '#3d5af5' }}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.type_name}</p>
                </div>
                <span className={`badge ${st.cls}`}>{st.text}</span>
                {pr && <span className={`badge ${pr.cls}`}>{pr.text}</span>}
              </div>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}
