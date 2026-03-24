import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'

// Lazy-loaded pages — each becomes a separate chunk
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const ObjectCardPage = lazy(() => import('./pages/ObjectCardPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const ObjectTypesPage = lazy(() => import('./pages/ObjectTypesPage'))
const ObjectTypeDetailPage = lazy(() => import('./pages/ObjectTypeDetailPage'))
const RequisitesPage = lazy(() => import('./pages/RequisitesPage'))
const RefTablesPage = lazy(() => import('./pages/RefTablesPage'))
const RefTableDetailPage = lazy(() => import('./pages/RefTableDetailPage'))
const WidgetLibraryPage = lazy(() => import('./pages/WidgetLibraryPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const UserPermissionsPage = lazy(() => import('./pages/UserPermissionsPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  const userLoaded = useAuthStore(s => s.userLoaded)
  if (!token && !userLoaded) return null
  if (!token) return <Navigate to="/login" />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  const userLoaded = useAuthStore(s => s.userLoaded)
  if (!userLoaded) return null
  if (!user?.is_admin) return <Navigate to="/" />
  return <>{children}</>
}

const PageLoader = () => (
  <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Загрузка...</div>
)

export default function App() {
  const loadUser = useAuthStore(s => s.loadUser)
  useEffect(() => { loadUser() }, [loadUser])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="admin/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
          <Route path="admin/users/:id/permissions" element={<AdminRoute><UserPermissionsPage /></AdminRoute>} />
          <Route path="admin/object-types" element={<AdminRoute><ObjectTypesPage /></AdminRoute>} />
          <Route path="admin/object-types/:id" element={<AdminRoute><ObjectTypeDetailPage /></AdminRoute>} />
          <Route path="admin/requisites" element={<AdminRoute><RequisitesPage /></AdminRoute>} />
          <Route path="admin/ref-tables" element={<AdminRoute><RefTablesPage /></AdminRoute>} />
          <Route path="admin/ref-tables/:id" element={<AdminRoute><RefTableDetailPage /></AdminRoute>} />
          <Route path="admin/widgets" element={<AdminRoute><WidgetLibraryPage /></AdminRoute>} />
          <Route path="admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ObjectCardPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
