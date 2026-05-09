import { useState, useEffect } from 'react'
import Login from './Login'
import AgentDashboard from './AgentDashboard'
import FinanceDashboard from './FinanceDashboard'
import SupervisorDashboard from './SupervisorDashboard'
import ManagerDashboard from './ManagerDashboard'
import Broadcasts from './Broadcasts'
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
import AgentMessageCenter from './components/AgentMessageCenter'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
          .select('role, full_name')
          .eq('email', session.user.email)
          .single()
          .then(({ data }) => {
            if (data) {
              setUser({
                email: session.user.email,
                role: data.role,
                full_name: data.full_name,
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

  // --- THE GATEKEEPER: ROLE-BASED DASHBOARD ROUTING ---
  let DashboardComponent
  if (user.role === 'finance') {
    DashboardComponent = FinanceDashboard
  } else if (user.role === 'supervisor') {
    DashboardComponent = SupervisorDashboard
  } else if (user.role === 'manager' || user.role === 'admin') {
    DashboardComponent = ManagerDashboard
  } else {
    // Default fallback is Agent
    DashboardComponent = AgentDashboard
  }

  // --- THE GATEKEEPER: NAVIGATION PERMISSIONS ---
  const isManagerOrAdmin = user.role === 'manager' || user.role === 'admin';
  const isFinance = user.role === 'finance';
  const isAgentOrSupervisor = user.role === 'agent' || user.role === 'supervisor';

  const navItems = [
    { label: 'Dashboard', view: 'dashboard', show: true },
    
    // Comm/Operations: Hidden from Finance
    { label: 'Broadcasts', view: 'broadcasts', show: !isFinance },
    { label: 'Messages', view: 'messages', show: !isFinance },
    
    // Global Access
    { label: 'Customers', view: 'customers', show: true },
    
    // Admin / Manager Exclusive
    { label: 'User Management', view: 'users', show: isManagerOrAdmin },
    { label: 'Bulk Upload', view: 'bulk', show: isManagerOrAdmin },
    { label: 'Backup', view: 'backup', show: isManagerOrAdmin },
    { label: '2FA Setup', view: '2fa', show: isManagerOrAdmin },
    
    // Shared Permissions
    { label: 'Audit Log', view: 'audit', show: isManagerOrAdmin || isAgentOrSupervisor },
    { label: 'Conversion', view: 'conversion', show: isManagerOrAdmin || isFinance },
  ]

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen)

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Watermark */}
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
            <button className="hamburger" onClick={toggleSidebar}>
              ☰
            </button>
            <img src={companyLogo} alt="Company Logo" className="logo-img" onClick={() => setView('dashboard')} />
            <div className="desktop-nav">
              {navItems.filter(item => item.show).map(item => (
                <button key={item.view} onClick={() => { setView(item.view); setSidebarOpen(false); }}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="user-area">
            <span className="user-badge">{user.full_name || user.email} ({user.role})</span>
            <button onClick={toggleTheme} className="btn-outline btn-sm">
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
            <NotificationsCenter user={user} />
            <button onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {/* Mobile sidebar */}
        <div className={`mobile-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h3>Menu</h3>
            <button onClick={toggleSidebar}>✕</button>
          </div>
          <div className="sidebar-nav">
            {navItems.filter(item => item.show).map(item => (
              <button key={item.view} onClick={() => { setView(item.view); setSidebarOpen(false); }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {sidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}

        <div style={{ padding: '1.5rem' }}>
          {view === 'dashboard' && <DashboardComponent user={user} />}
          {view === 'broadcasts' && <Broadcasts user={user} />}
          {view === 'messages' && (
            user.role === 'agent' ? 
              <AgentMessageCenter user={user} /> : 
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