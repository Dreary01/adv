import { AlertCircle } from 'lucide-react'

export function WidgetCard({ icon: Icon, title, count, iconBg, iconColor, children }: {
  icon: any; title: string; count: number; iconBg: string; iconColor: string; children: React.ReactNode
}) {
  return (
    <div className="widget h-full">
      <div className="widget-header">
        <div className="flex items-center gap-2.5">
          <div className={`widget-icon ${iconBg}`}>
            <Icon size={15} className={iconColor} />
          </div>
          <h2 className="card-header-title">{title}</h2>
        </div>
        {count > 0 && (
          <span className={`badge ${iconBg} ${iconColor}`}>{count}</span>
        )}
      </div>
      <div className="widget-body">{children}</div>
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state py-8">
      <AlertCircle size={24} className="empty-state-icon" />
      <p className="empty-state-text">{text}</p>
    </div>
  )
}

export function Skeleton() {
  return (
    <div className="skeleton space-y-3">
      <div className="skeleton-line w-3/4" />
      <div className="skeleton-line w-1/2" />
      <div className="skeleton-line w-2/3" />
    </div>
  )
}
