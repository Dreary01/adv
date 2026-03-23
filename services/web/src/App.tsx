import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ObjectTypesPage from './pages/ObjectTypesPage'
import ObjectTypeDetailPage from './pages/ObjectTypeDetailPage'
import RequisitesPage from './pages/RequisitesPage'
import ProjectsPage from './pages/ProjectsPage'
import RefTablesPage from './pages/RefTablesPage'
import RefTableDetailPage from './pages/RefTableDetailPage'
import ObjectCardPage from './pages/ObjectCardPage'
// import GanttTestPage from './pages/GanttTestPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  if (!isLoggedIn()) return <Navigate to="/login" />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="admin/object-types" element={<ObjectTypesPage />} />
        <Route path="admin/object-types/:id" element={<ObjectTypeDetailPage />} />
        <Route path="admin/requisites" element={<RequisitesPage />} />
        <Route path="admin/ref-tables" element={<RefTablesPage />} />
        <Route path="admin/ref-tables/:id" element={<RefTableDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ObjectCardPage />} />
      </Route>
    </Routes>
  )
}
