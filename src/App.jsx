import { useState, useEffect } from 'react'
import Login from './Login'
import AgentDashboard from './AgentDashboard'
import FinanceDashboard from './FinanceDashboard'
import SupervisorDashboard from './SupervisorDashboard'
import ManagerDashboard from './ManagerDashboard'
import Broadcasts from './Broadcasts'
import SendPrivateMessage from './SendPrivateMessage'
import PrivateMessageInbox from './PrivateMessageInbox'
import AuditLog from './AuditLog'
import UserManagement from './UserManagement'
import NotificationsCenter from './NotificationsCenter'
import BulkUpload from './BulkUpload'
import CustomersList from './CustomersList'
import { supabase } from './supabase'
import companyLogo from './assets/one.jpg'
import ConversionSettings from './components/ConversionSettings'
import BackupManager from './components/BackupManager'
import TwoFactorSetup from './components/TwoFactorSetup'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('dashboard')
  
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from('users')
          .select('role')
          .eq('email', session.user.email)
          .single()
          .then(({ data }) => {
            if (data) {
              setUser({
                email: session.user.email,
                role: data.role,
              })
            }
          })
      }
    })
  }, [])

  const handleLogin = (userInfo) => setUser(userInfo)
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setView('dashboard')
  }
  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }

  if (!user) return <Login onLogin={handleLogin} />

  let DashboardComponent
  if (user.role === 'finance') {
    DashboardComponent = FinanceDashboard
  } else if (user.role === 'supervisor') {
    DashboardComponent = SupervisorDashboard
  } else if (user.role === 'manager' || user.role === 'admin') {
    DashboardComponent = ManagerDashboard
  } else {
    DashboardComponent = AgentDashboard
  }

  const showUserManagement = user.role === 'manager' || user.role === 'admin'
  const showAuditLog = user.role === 'manager' || user.role === 'admin' || user.role === 'agent'
  const showBulkUpload = user.role === 'manager' || user.role === 'admin'
  const showConversion = user.role === 'finance' || user.role === 'manager' || user.role === 'admin'
  const showBackup = user.role === 'manager' || user.role === 'admin'
  const show2FA = user.role === 'manager' || user.role === 'admin'

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `url(${companyLogo})`,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px',
        backgroundPosition: 'center',
        opacity: 0.06,
        zIndex: 0,
        pointerEvents: 'none',
      }} />
      
      <div style={{ position: 'relative', zIndex: 1 }}>
        <header className="app-header">
          <div className="logo-area">
            <img src={companyLogo} alt="Company Logo" className="logo-img" onClick={() => setView('dashboard')} />
            <div className="nav-buttons">
              <button onClick={() => setView('dashboard')}>Dashboard</button>
              <button onClick={() => setView('broadcasts')}>Broadcasts</button>
              <button onClick={() => setView('messages')}>Messages</button>
              <button onClick={() => setView('customers')}>Customers</button>
              {showUserManagement && <button onClick={() => setView('users')}>User Management</button>}
              {showAuditLog && <button onClick={() => setView('audit')}>Audit Log</button>}
              {showBulkUpload && <button onClick={() => setView('bulk')}>Bulk Upload</button>}
              {showConversion && <button onClick={() => setView('conversion')}>Conversion</button>}
              {showBackup && <button onClick={() => setView('backup')}>Backup</button>}
              {show2FA && <button onClick={() => setView('2fa')}>2FA Setup</button>}
            </div>
          </div>
          <div className="user-area">
            <span className="user-badge">{user.email} ({user.role})</span>
            <button onClick={toggleTheme} className="btn-outline btn-sm">
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
            <NotificationsCenter user={user} />
            <button onClick={handleLogout}>Logout</button>
          </div>
        </header>
        <div style={{ padding: '1.5rem' }}>
          {view === 'dashboard' && <DashboardComponent user={user} />}
          {view === 'broadcasts' && <Broadcasts user={user} />}
          {view === 'messages' && (
            user.role === 'agent' ? 
              <SendPrivateMessage user={user} /> : 
              <PrivateMessageInbox user={user} />
          )}
          {view === 'customers' && <CustomersList user={user} />}
          {view === 'users' && <UserManagement user={user} />}
          {view === 'audit' && <AuditLog user={user} />}
          {view === 'bulk' && <BulkUpload user={user} />}
          {view === 'conversion' && <ConversionSettings user={user} />}
          {view === 'backup' && <BackupManager user={user} />}
          {view === '2fa' && <TwoFactorSetup user={user} />}
        </div>
      </div>
    </div>
  )
}

export default App