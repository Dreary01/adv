import { useEffect, useState, FormEvent } from 'react'
import { api } from '../lib/api'
import {
  Inbox, ListTodo, Newspaper, FolderTree, Activity,
  Plus, Trash2, Check, Circle, ChevronRight, AlertCircle,
  Clock, Briefcase, Target, Layers, Flag, CheckSquare, Users, Folder
} from 'lucide-react'

const iconMap: Record<string, any> = {
  briefcase: Briefcase, target: Target, layers: Layers, flag: Flag,
  'check-square': CheckSquare, users: Users, folder: Folder,
}

// ─── Requests Widget ────────────────────────────────────

function RequestsWidget() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDashboardRequests().then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [])

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

  return (
    <WidgetCard icon={Inbox} title="Запросы" count={items.length} iconBg="bg-violet-50" iconColor="text-violet-600">
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

// ─── Todos Widget ───────────────────────────────────────

function TodosWidget() {
  const [todos, setTodos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')

  const load = () => api.getTodos().then(setTodos).catch(() => setTodos([])).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await api.createTodo({ title: newTitle.trim() })
    setNewTitle('')
    load()
  }

  const handleToggle = async (id: string) => { await api.toggleTodo(id); load() }
  const handleDelete = async (id: string) => { await api.deleteTodo(id); load() }

  return (
    <WidgetCard icon={ListTodo} title="Список дел" count={todos.filter(t => !t.is_done).length} iconBg="bg-emerald-50" iconColor="text-emerald-600">
      <form onSubmit={handleAdd} className="flex gap-2 mb-3">
        <input
          type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
          placeholder="Новая задача..."
          className="input-sm flex-1"
        />
        <button type="submit" className="btn-primary btn-sm px-2.5">
          <Plus size={15} />
        </button>
      </form>
      {loading ? <Skeleton /> : todos.length === 0 ? (
        <EmptyState text="Список дел пуст" />
      ) : (
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {todos.map(todo => (
            <div key={todo.id} className="flex items-center gap-2 py-1.5 px-1 group hover:bg-gray-50/70 rounded-lg transition-colors">
              <button onClick={() => handleToggle(todo.id)}
                className={`flex-shrink-0 w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center transition-colors ${
                  todo.is_done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-400'
                }`}>
                {todo.is_done && <Check size={11} strokeWidth={3} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${todo.is_done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {todo.title}
                </p>
                {todo.object_name && <p className="text-xs text-gray-400 truncate">{todo.object_name}</p>}
              </div>
              {todo.due_date && (
                <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                  <Clock size={11} />
                  {new Date(todo.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
              )}
              <button onClick={() => handleDelete(todo.id)} className="icon-btn-danger reveal-on-hover p-1">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ─── News Widget ────────────────────────────────────────

function NewsWidget() {
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getNews().then(setNews).catch(() => setNews([])).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard icon={Newspaper} title="Новости" count={news.length} iconBg="bg-amber-50" iconColor="text-amber-600">
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

// ─── Directions Widget ──────────────────────────────────

function DirectionsWidget() {
  const [directions, setDirections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDashboardDirections().then(setDirections).catch(() => setDirections([])).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard icon={FolderTree} title="Направления" count={directions.length} iconBg="bg-blue-50" iconColor="text-blue-600">
      {loading ? <Skeleton /> : directions.length === 0 ? (
        <EmptyState text="Нет объектов" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {directions.map(dir => {
            const Icon = iconMap[dir.type_icon] || Briefcase
            const color = dir.type_color || '#3d5af5'
            return (
              <div key={dir.id} className="card p-3 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                       style={{ backgroundColor: color + '14', color }}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{dir.name}</p>
                    <p className="text-xs text-gray-400">{dir.type_name}</p>
                  </div>
                </div>
                {dir.children && dir.children.length > 0 && (
                  <div className="space-y-1 mt-2 pt-2 border-t border-gray-100">
                    {dir.children.map((child: any) => {
                      const ChildIcon = iconMap[child.type_icon] || Circle
                      return (
                        <div key={child.id} className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 transition-colors">
                          <ChevronRight size={12} className="text-gray-300" />
                          <ChildIcon size={12} style={{ color: child.type_color || '#888' }} />
                          <span className="truncate">{child.name}</span>
                        </div>
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

// ─── Event Feed Widget ──────────────────────────────────

function EventFeedWidget() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getDashboardEvents().then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false))
  }, [])

  return (
    <WidgetCard icon={Activity} title="Лента событий" count={events.length} iconBg="bg-rose-50" iconColor="text-rose-600">
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

// ─── Shared Components ──────────────────────────────────

function WidgetCard({ icon: Icon, title, count, iconBg, iconColor, children }: {
  icon: any; title: string; count: number; iconBg: string; iconColor: string; children: React.ReactNode
}) {
  return (
    <div className="widget">
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state py-8">
      <AlertCircle size={24} className="empty-state-icon" />
      <p className="empty-state-text">{text}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="skeleton space-y-3">
      <div className="skeleton-line w-3/4" />
      <div className="skeleton-line w-1/2" />
      <div className="skeleton-line w-2/3" />
    </div>
  )
}

// ─── Dashboard Page ─────────────────────────────────────

export default function DashboardPage() {
  return (
    <div className="page-wide space-y-5">
      <div>
        <h1 className="page-title">Рабочий стол</h1>
        <p className="page-subtitle">Обзор текущей активности</p>
      </div>

      <RequestsWidget />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TodosWidget />
        <NewsWidget />
      </div>

      <DirectionsWidget />
      <EventFeedWidget />
    </div>
  )
}
