import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../lib/store'
import {
  LayoutDashboard, Settings, FolderTree, SlidersHorizontal,
  LogOut, Database, ChevronRight, BarChart3
} from 'lucide-react'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Рабочий стол' },
  { to: '/projects', icon: FolderTree, label: 'Проекты' },
  { to: '/analytics', icon: BarChart3, label: 'Аналитика' },
  { to: '/admin/object-types', icon: Settings, label: 'Типы объектов', section: 'admin' },
  { to: '/admin/requisites', icon: SlidersHorizontal, label: 'Реквизиты', section: 'admin' },
  { to: '/admin/ref-tables', icon: Database, label: 'Справочники', section: 'admin' },
]

export default function Layout() {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  const mainLinks = nav.filter(n => !n.section)
  const adminLinks = nav.filter(n => n.section === 'admin')

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-lg shadow-primary-600/30">
              <span className="text-white font-bold text-sm tracking-tight">A</span>
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-white tracking-tight">
                ADV
              </h1>
              <p className="text-[10px] text-gray-500 tracking-widest uppercase">Platform</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {mainLinks.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <n.icon size={17} strokeWidth={1.8} />
              <span className="flex-1">{n.label}</span>
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-40 transition-opacity" />
            </NavLink>
          ))}

          {/* Admin section */}
          <div className="pt-4 mt-4 border-t border-white/[0.06]">
            <p className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-widest">
              Администрирование
            </p>
            {adminLinks.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
                }
              >
                <n.icon size={17} strokeWidth={1.8} />
                <span className="flex-1">{n.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-300 flex-shrink-0">
              {user?.first_name?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-300 font-medium truncate">
                {user?.first_name || 'Admin'}
              </p>
              <p className="text-[10px] text-gray-600 truncate">{user?.email || ''}</p>
            </div>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="p-1.5 text-gray-600 hover:text-gray-400 hover:bg-white/[0.06] rounded-lg transition-all"
              title="Выйти"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-surface-50">
        <Outlet />
      </main>
    </div>
  )
}
