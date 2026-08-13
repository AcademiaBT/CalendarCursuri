import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import Login from './components/Login'
import CalendarPage from './components/Calendar/CalendarPage'
import AdminPanel from './components/Admin/AdminPanel'
import ReportsPage from './components/Reports/ReportsPage'
import SettingsPage from './components/Settings/SettingsPage'

function AppShell() {
  const { user, isAdmin, loading } = useAuth()

  if (loading) return <div className="loading-screen">Se incarca...</div>
  if (!user) return <Login />

  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<CalendarPage />} />
          <Route path="/rapoarte" element={<ReportsPage />} />
          <Route path="/setari" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={isAdmin ? <AdminPanel /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </AuthProvider>
  )
}
