import { useEffect, useState, FormEvent } from 'react'
import { api } from '../../../lib/api'
import { ListTodo, Plus, Trash2, Check, Clock } from 'lucide-react'
import { WidgetCard, EmptyState, Skeleton } from '../../ui/WidgetCard'

import type { WidgetProps } from '../../../lib/widget-types'

export default function TodosWidget({ customTitle }: WidgetProps) {
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
    <WidgetCard icon={ListTodo} title={customTitle || "Список дел"} count={todos.filter(t => !t.is_done).length} iconBg="bg-emerald-50" iconColor="text-emerald-600">
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
