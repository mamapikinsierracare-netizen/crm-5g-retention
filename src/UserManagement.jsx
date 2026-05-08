import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

export default function UserManagement({ user: currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEmail, setEditingEmail] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState('agent')
  
  // Form state for creating new users directly
  const [newUser, setNewUser] = useState({
    email: '',
    fullName: '',
    role: 'agent',
    password: ''
  })

  // 1. Fetch the logged-in user's role first to determine what they can see
  const fetchCurrentRole = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('role')
      .eq('email', currentUser.email)
      .single()
    if (data) setCurrentUserRole(data.role)
  }, [currentUser.email])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('role', { ascending: true })

    if (!error && data) {
      // Logic: If I am a manager, filter out all admins from the list
      if (currentUserRole === 'manager') {
        setUsers(data.filter(u => u.role !== 'admin'))
      } else {
        setUsers(data)
      }
    }
    setLoading(false)
  }, [currentUserRole])

  useEffect(() => {
    fetchCurrentRole().then(fetchUsers)
  }, [fetchCurrentRole, fetchUsers])

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      // INVOKING THE EDGE FUNCTION: 'manage-users'
      // This sends the form data to your Supabase server to handle Auth + Table insertion
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: newUser
      })

      if (error) {
        // If the Edge Function returns an error (like User Already Exists)
        const errorContext = error.context ? await error.context.json() : null;
        throw new Error(errorContext?.error || error.message || "Failed to create user");
      }

      alert(`✅ Success! Account created for ${newUser.email}`)
      
      // Reset form
      setNewUser({
        email: '',
        fullName: '',
        role: 'agent',
        password: ''
      })
      
      // Refresh the table list
      fetchUsers()

    } catch (err) {
      alert("Account Creation Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateRole = async (email, newRole) => {
    // Extra Safety Check: Prevent a Manager from accidentally promoting someone to Admin
    if (currentUserRole === 'manager' && newRole === 'admin') {
      alert("Unauthorized: Managers cannot create administrators.")
      return
    }

    const { error } = await supabase
      .from('users')
      .update({ role: newRole })
      .eq('email', email)

    if (error) alert('Update failed: ' + error.message)
    else fetchUsers()
    setEditingEmail(null)
  }

  const handleDeleteUser = async (email, targetRole) => {
    if (targetRole === 'admin' && currentUserRole !== 'admin') {
      alert("Unauthorized: You cannot delete an administrator.")
      return
    }

    if (window.confirm(`Are you sure you want to disable ${email}?`)) {
      const { error } = await supabase.from('users').delete().eq('email', email)
      if (error) alert('Delete failed: ' + error.message)
      else fetchUsers()
    }
  }

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Processing...</div>

  return (
    <div className="user-management-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>👥 User Access Management</h2>
        <button className="btn-outline" onClick={fetchUsers}>🔄 Refresh List</button>
      </div>

      {/* DIRECT USER CREATION FORM */}
      <div className="card" style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Add New System User</h3>
        <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <input 
            type="email" 
            placeholder="User Email" 
            required 
            value={newUser.email}
            onChange={e => setNewUser({...newUser, email: e.target.value})}
          />
          <input 
            type="text" 
            placeholder="Full Name" 
            required 
            value={newUser.fullName}
            onChange={e => setNewUser({...newUser, fullName: e.target.value})}
          />
          <select 
            value={newUser.role}
            onChange={e => setNewUser({...newUser, role: e.target.value})}
          >
            <option value="agent">Retention Agent</option>
            <option value="supervisor">Supervisor</option>
            <option value="finance">Finance</option>
            <option value="manager">Manager</option>
            {/* ONLY ADMIN CAN SEE THIS OPTION */}
            {currentUserRole === 'admin' && <option value="admin">System Admin</option>}
          </select>
          <input 
            type="password" 
            placeholder="Password" 
            required 
            value={newUser.password}
            onChange={e => setNewUser({...newUser, password: e.target.value})}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
      </div>

      {/* USER LIST TABLE */}
      <div className="table-container">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
              <th style={{ padding: '12px' }}>Identity</th>
              <th>Full Name</th>
              <th>Role / Permission</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Management</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.email} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: 'bold' }}>{u.email}</div>
                  <small style={{ color: '#888' }}>ID: {u.email === currentUser.email ? ' (You)' : 'External'}</small>
                </td>
                <td>{u.full_name || 'N/A'}</td>
                <td>
                  {editingEmail === u.email ? (
                    <select
                      value={u.role}
                      onChange={e => handleUpdateRole(u.email, e.target.value)}
                      autoFocus
                    >
                      <option value="agent">agent</option>
                      <option value="supervisor">supervisor</option>
                      <option value="finance">finance</option>
                      <option value="manager">manager</option>
                      {currentUserRole === 'admin' && <option value="admin">admin</option>}
                    </select>
                  ) : (
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '0.8rem',
                      background: u.role === 'admin' ? '#343a40' : '#e9ecef',
                      color: u.role === 'admin' ? '#fff' : '#495057',
                      fontWeight: 'bold'
                    }}>
                      {u.role.toUpperCase()}
                    </span>
                  )}
                </td>
                <td>
                  <span style={{ color: '#28a745' }}>● Active</span>
                </td>
                <td style={{ textAlign: 'right', padding: '12px' }}>
                  {editingEmail === u.email ? (
                    <button onClick={() => setEditingEmail(null)} className="btn-sm">Cancel</button>
                  ) : (
                    <button 
                      onClick={() => setEditingEmail(u.email)} 
                      className="btn-sm" 
                      disabled={u.role === 'admin' && currentUserRole !== 'admin'}
                    >
                      Edit Role
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteUser(u.email, u.role)} 
                    style={{ marginLeft: '10px', color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer' }}
                    disabled={u.role === 'admin' && currentUserRole !== 'admin'}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}