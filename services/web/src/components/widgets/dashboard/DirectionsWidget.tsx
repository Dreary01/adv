import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../../lib/api'
import { FolderTree, Circle, ChevronRight, Briefcase, Target, Layers, Flag, CheckSquare, Users, Folder } from 'lucide-react'
import { WidgetCard, EmptyState, Skeleton } from '../../ui/WidgetCard'
import type { WidgetProps } from '../../../lib/widget-types'

const iconMap: Record<string, any> = {
  briefcase: Briefcase, target: Target, layers: Layers, flag: Flag,
  'check-square': CheckSquare, users: Users, folder: Folder,
}

export default function DirectionsWidget({ colSpan = 12, customTitle }: WidgetProps) {
  const [directions, setDirections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDashboardDirections().then(setDirections).catch(() => setDirections([])).finally(() => setLoading(false))
  }, [])

  // Adapt: 1 col at ≤4, 2 col at ≤8, 3 col at 9+
  const gridCols = colSpan <= 4 ? 'grid-cols-1' : colSpan <= 8 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <WidgetCard icon={FolderTree} title={customTitle || "Направления"} count={directions.length} iconBg="bg-blue-50" iconColor="text-blue-600">
      {loading ? <Skeleton /> : directions.length === 0 ? (
        <EmptyState text="Нет объектов" />
      ) : (
        <div className={`grid ${gridCols} gap-3`}>
          {directions.map(dir => {
            const Icon = iconMap[dir.type_icon] || Briefcase
            const color = dir.type_color || '#3d5af5'
            return (
              <div key={dir.id} className="card p-3 hover:shadow-md transition-shadow">
                <Link to={`/projects/${dir.id}`} className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ backgroundColor: color + '14', color }}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate hover:text-primary-600 transition-colors">{dir.name}</p>
                    <p className="text-xs text-gray-400">{dir.type_name}</p>
                  </div>
                </Link>
                {dir.children && dir.children.length > 0 && (
                  <div className="space-y-1 mt-2 pt-2 border-t border-gray-100">
                    {dir.children.map((child: any) => {
                      const ChildIcon = iconMap[child.type_icon] || Circle
                      return (
                        <Link key={child.id} to={`/projects/${child.id}`} className="flex items-center gap-2 text-xs text-gray-600 hover:text-primary-600 transition-colors">
                          <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                          <ChildIcon size={12} className="flex-shrink-0" style={{ color: child.type_color || '#888' }} />
                          <span className="truncate">{child.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}
