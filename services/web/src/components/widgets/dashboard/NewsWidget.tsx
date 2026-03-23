import { useEffect, useState } from 'react'
import { api } from '../../../lib/api'
import { Newspaper } from 'lucide-react'
import { WidgetCard, EmptyState, Skeleton } from '../../ui/WidgetCard'

import type { WidgetProps } from '../../../lib/widget-types'

export default function NewsWidget({ customTitle }: WidgetProps) {
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getNews().then(setNews).catch(() => setNews([])).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard icon={Newspaper} title={customTitle || "Новости"} count={news.length} iconBg="bg-amber-50" iconColor="text-amber-600">
      {loading ? <Skeleton /> : news.length === 0 ? (
        <EmptyState text="Нет новостей" />
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {news.map(item => (
            <div key={item.id} className="border-l-2 border-accent-300 pl-3">
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              {item.body && <p className="text-xs text-gray-500 mt-0.5 truncate-2">{item.body}</p>}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">
                  {new Date(item.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                </span>
                {item.author_name && <span className="text-xs text-gray-400">&middot; {item.author_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}
