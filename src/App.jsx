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
import { supabase } from './supabase'

function App() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('dashboard')

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

  if (!user) return <Login onLogin={handleLogin} />

  // Choose dashboard based on role
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
  const showAuditLog = user.role === 'manager' || user.role === 'admin'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', padding: '10px' }}>
        <div>
          <button onClick={() => setView('dashboard')} style={{ marginRight: '10px' }}>Dashboard</button>
          <button onClick={() => setView('broadcasts')} style={{ marginRight: '10px' }}>Broadcasts</button>
          <button onClick={() => setView('messages')} style={{ marginRight: '10px' }}>Messages</button>
          {showUserManagement && <button onClick={() => setView('users')} style={{ marginRight: '10px' }}>User Management</button>}
          {showAuditLog && <button onClick={() => setView('audit')}>Audit Log</button>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span>{user.email} ({user.role})</span>
          <NotificationsCenter user={user} />
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>
      <div style={{ padding: '20px' }}>
        {view === 'dashboard' && <DashboardComponent user={user} />}
        {view === 'broadcasts' && <Broadcasts user={user} />}
        {view === 'messages' && (
          user.role === 'agent' ? 
            <SendPrivateMessage user={user} /> : 
            <PrivateMessageInbox user={user} />
        )}
        {view === 'users' && <UserManagement user={user} />}
        {view === 'audit' && <AuditLog />}
      </div>
    </div>
  )
}

export default App