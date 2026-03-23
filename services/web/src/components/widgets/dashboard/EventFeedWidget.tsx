import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { Activity } from 'lucide-react'
import { WidgetCard, EmptyState, Skeleton } from '../../ui/WidgetCard'

import type { WidgetProps } from '../../../lib/widget-types'

export default function EventFeedWidget({ customTitle }: WidgetProps) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDashboardEvents().then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard icon={Activity} title={customTitle || "Лента событий"} count={events.length} iconBg="bg-rose-50" iconColor="text-rose-600">
      {loading ? <Skeleton /> : events.length === 0 ? (
        <EmptyState text="Нет событий" />
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {events.map(ev => (
            <div key={ev.id} className={`flex items-start gap-3 py-2 px-2 rounded-lg ${ev.is_read ? '' : 'bg-rose-50/50'}`}>
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ev.is_read ? 'bg-gray-300' : 'bg-rose-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{ev.title}</p>
                {ev.body && <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.body}</p>}
                <span className="text-xs text-gray-400">
                  {new Date(ev.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}
