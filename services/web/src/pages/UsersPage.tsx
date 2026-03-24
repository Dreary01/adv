import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Shield, ShieldCheck, Pencil, UserX, KeyRound, X, Eye } from 'lucide-react'
import { api } from '../lib/api'
import SvarGrid from '../components/ui/SvarGrid'

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  is_admin: boolean
  created_at: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)

  const load = () => { api.getUsers().then(setUsers).catch(() => {}) }
  useEffect(load, [])

  return (
    <div className="page space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Пользователи</h1>
          <p className="page-subtitle">Управление учётными записями и правами доступа</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
          <Plus size={15} /> Создать
        </button>
      </div>

      <div className="card overflow-hidden">
        <SvarGrid
          data={users}
          columns={[
            {
              id: 'name',
              header: 'Имя',
              flexgrow: 1,
              cell: ({ row }: { row: User }) => (
                <span className="font-medium text-gray-900">{row.first_name} {row.last_name}</span>
              ),
            },
            {
              id: 'email',
              header: 'Email',
              flexgrow: 1,
              cell: ({ row }: { row: User }) => (
                <span className="text-gray-500">{row.email}</span>
              ),
            },
            {
              id: 'role',
              header: 'Роль',
              width: 160,
              cell: ({ row }: { row: User }) =>
                row.is_admin ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                    <ShieldCheck size={12} /> Админ
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    <Shield size={12} /> Пользователь
                  </span>
                ),
            },
            {
              id: 'status',
              header: 'Статус',
              width: 140,
              cell: ({ row }: { row: User }) => (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  row.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}>
                  {row.is_active ? 'Активен' : 'Заблокирован'}
                </span>
              ),
            },
            {
              id: 'actions',
              header: 'Действия',
              width: 160,
              cell: ({ row }: { row: User }) => (
                <div className="flex items-center justify-end gap-1">
                  <Link to={`/admin/users/${row.id}/permissions`}
                    className="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Права доступа">
                    <Eye size={14} />
                  </Link>
                  <button onClick={() => setEditUser(row)}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Редактировать">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setResetUser(row)}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Сменить пароль">
                    <KeyRound size={14} />
                  </button>
                  {row.is_active && (
                    <button onClick={async () => {
                      if (confirm(`Заблокировать ${row.first_name} ${row.last_name}?`)) {
                        await api.deleteUser(row.id)
                        load()
                      }
                    }}
                      className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Заблокировать">
                      <UserX size={14} />
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
        {users.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">Нет пользователей</div>
        )}
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  )
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', is_admin: false })
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    try {
      await api.createUser(form)
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Ошибка')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold">Новый пользователь</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Имя</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="input input-sm" />
            </div>
            <div>
              <label className="label">Фамилия</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="input input-sm" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input input-sm" />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input input-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} className="rounded border-gray-300" />
            Администратор
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="btn-ghost btn-sm">Отмена</button>
          <button onClick={submit} className="btn-primary btn-sm">Создать</button>
        </div>
      </div>
    </div>
  )
}

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    email: user.email, first_name: user.first_name, last_name: user.last_name,
    is_active: user.is_active, is_admin: user.is_admin,
  })
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    try {
      await api.updateUser(user.id, form)
      onSaved()
      onClose()
    } catch (e: any) {
      setError(e.message || 'Ошибка')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold">Редактировать: {user.first_name} {user.last_name}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Имя</label>
              <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="input input-sm" />
            </div>
            <div>
              <label className="label">Фамилия</label>
              <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="input input-sm" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input input-sm" />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.is_admin} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} className="rounded border-gray-300" />
              Администратор
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300" />
              Активен
            </label>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="btn-ghost btn-sm">Отмена</button>
          <button onClick={submit} className="btn-primary btn-sm">Сохранить</button>
        </div>
      </div>
    </div>
  )
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    await api.resetUserPassword(user.id, password)
    setDone(true)
    setTimeout(onClose, 1000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold">Сменить пароль: {user.first_name}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-3">
          {done ? (
            <p className="text-sm text-green-600">Пароль изменён</p>
          ) : (
            <>
              <div>
                <label className="label">Новый пароль</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input input-sm" autoFocus />
              </div>
            </>
          )}
        </div>
        {!done && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
            <button onClick={onClose} className="btn-ghost btn-sm">Отмена</button>
            <button onClick={submit} disabled={!password} className="btn-primary btn-sm">Сменить</button>
          </div>
        )}
      </div>
    </div>
  )
}
