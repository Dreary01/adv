import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, FolderTree, Database, GitBranch } from 'lucide-react'
import { api } from '../lib/api'
import SvarGrid from '../components/ui/SvarGrid'

// Action bitmask constants
const ACTION_READ = 1
const ACTION_CREATE = 2
const ACTION_UPDATE = 4
const ACTION_DELETE = 8

const ACTION_LABELS = [
  { bit: ACTION_READ, label: 'Чтение' },
  { bit: ACTION_CREATE, label: 'Создание' },
  { bit: ACTION_UPDATE, label: 'Изменение' },
  { bit: ACTION_DELETE, label: 'Удаление' },
]

interface Permission {
  id: string
  user_id: string
  resource_type: string
  resource_id: string
  actions: number
  recursive: boolean
  resource_name?: string
}

export default function UserPermissionsPage() {
  const { id: userId } = useParams<{ id: string }>()
  const [user, setUser] = useState<any>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [tab, setTab] = useState<'object' | 'ref_table'>('object')
  const [showAdd, setShowAdd] = useState(false)

  const loadPerms = () => {
    if (!userId) return
    api.getPermissions({ user_id: userId }).then(setPermissions).catch(() => {})
  }
  useEffect(() => {
    if (!userId) return
    api.getUser(userId).then(setUser).catch(() => {})
    loadPerms()
  }, [userId])

  const filtered = permissions.filter(p => p.resource_type === tab)

  const toggleAction = async (perm: Permission, bit: number) => {
    const newActions = perm.actions ^ bit
    if (newActions === 0) {
      await api.revokePermission(perm.id)
    } else {
      await api.updatePermission(perm.id, { actions: newActions })
    }
    loadPerms()
  }

  const toggleRecursive = async (perm: Permission) => {
    await api.updatePermission(perm.id, { recursive: !perm.recursive })
    loadPerms()
  }

  const revoke = async (perm: Permission) => {
    await api.revokePermission(perm.id)
    loadPerms()
  }

  if (!user) return null

  return (
    <div className="page space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="page-title">Права доступа: {user.first_name} {user.last_name}</h1>
          <p className="page-subtitle">{user.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button onClick={() => setTab('object')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
            tab === 'object' ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <FolderTree size={14} /> Объекты
        </button>
        <button onClick={() => setTab('ref_table')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
            tab === 'ref_table' ? 'border-primary-600 text-primary-600 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <Database size={14} /> Справочники
        </button>
      </div>

      {/* Permissions list */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs font-semibold text-gray-500 uppercase">
            {tab === 'object' ? 'Доступ к объектам' : 'Доступ к справочникам'}
          </span>
          <button onClick={() => setShowAdd(true)} className="btn-primary btn-xs">
            <Plus size={13} /> Добавить
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">Нет назначенных прав</div>
        ) : (
          <SvarGrid
            data={filtered}
            columns={[
              { id: 'resource_name', header: 'Ресурс', flexgrow: 1, cell: ({ row }: any) => (
                <span className="font-medium text-gray-900">{row.resource_name || row.resource_id.slice(0, 8)}</span>
              )},
              ...ACTION_LABELS.map(a => ({
                id: `action_${a.bit}`, header: a.label, width: 80,
                cell: ({ row }: any) => (
                  <div className="text-center">
                    <input type="checkbox" checked={(row.actions & a.bit) !== 0}
                      onChange={() => toggleAction(row, a.bit)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                  </div>
                ),
              })),
              ...(tab === 'object' ? [{ id: 'recursive', header: 'Рекурсивно', width: 100, cell: ({ row }: any) => (
                <div className="text-center">
                  <button onClick={() => toggleRecursive(row)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                      row.recursive ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                    <GitBranch size={11} />
                    {row.recursive ? 'Да' : 'Нет'}
                  </button>
                </div>
              )}] : []),
              { id: 'del', header: '', width: 50, cell: ({ row }: any) => (
                <button onClick={() => revoke(row)} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50">
                  <Trash2 size={13} />
                </button>
              )},
            ]}
          />
        )}
      </div>

      {showAdd && userId && (
        <AddPermissionModal
          userId={userId}
          resourceType={tab}
          onClose={() => setShowAdd(false)}
          onAdded={loadPerms}
        />
      )}
    </div>
  )
}

function AddPermissionModal({ userId, resourceType, onClose, onAdded }: {
  userId: string; resourceType: string; onClose: () => void; onAdded: () => void
}) {
  const [resources, setResources] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [actions, setActions] = useState(ACTION_READ)
  const [recursive, setRecursive] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (resourceType === 'object') {
      api.getObjects({ parent_id: 'all' }).then((objs: any) => {
        setResources((objs || []).map((o: any) => ({ id: o.id, name: o.name })))
      }).catch(() => {})
    } else {
      api.getRefTables().then((tables: any) => {
        setResources((tables || []).map((t: any) => ({ id: t.id, name: t.name })))
      }).catch(() => {})
    }
  }, [resourceType])

  const filtered = search
    ? resources.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
    : resources

  const submit = async () => {
    if (!selectedId) return
    await api.grantPermission({
      user_id: userId,
      resource_type: resourceType,
      resource_id: selectedId,
      actions,
      recursive,
    })
    onAdded()
    onClose()
  }

  const toggleBit = (bit: number) => setActions(a => a ^ bit)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="card w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold">
            Добавить доступ: {resourceType === 'object' ? 'Объект' : 'Справочник'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <span className="text-lg">&times;</span>
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-auto">
          {/* Resource selector */}
          <div>
            <label className="label">Ресурс</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..." className="input input-sm mb-2" />
            <div className="border border-gray-200 rounded-lg max-h-48 overflow-auto">
              {filtered.map(r => (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-0 transition-colors ${
                    selectedId === r.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
                  }`}>
                  {r.name}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-3 py-4 text-xs text-gray-400 text-center">Ничего не найдено</p>}
            </div>
          </div>

          {/* Actions */}
          <div>
            <label className="label">Права</label>
            <div className="flex gap-3">
              {ACTION_LABELS.map(a => (
                <label key={a.bit} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={(actions & a.bit) !== 0} onChange={() => toggleBit(a.bit)}
                    className="rounded border-gray-300 text-primary-600" />
                  {a.label}
                </label>
              ))}
            </div>
          </div>

          {/* Recursive (objects only) */}
          {resourceType === 'object' && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)}
                className="rounded border-gray-300 text-primary-600" />
              <GitBranch size={14} className="text-gray-400" />
              Рекурсивно (включая дочерние объекты)
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="btn-ghost btn-sm">Отмена</button>
          <button onClick={submit} disabled={!selectedId || actions === 0} className="btn-primary btn-sm">Назначить</button>
        </div>
      </div>
    </div>
  )
}
