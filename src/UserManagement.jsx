import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UserManagement({ user: currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState(null)

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    if (!error) setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleUpdateRole = async (userId, newRole) => {
    const { error } = await supabase.from('users').update({ role: newRole }).eq('email', userId)
    if (error) alert('Update failed: ' + error.message)
    else fetchUsers()
    setEditingUserId(null)
  }

  const handleDeleteUser = async (email) => {
    if (window.confirm(`Delete user ${email}? This only removes from public.users, not from Auth.`)) {
      const { error } = await supabase.from('users').delete().eq('email', email)
      if (error) alert('Delete failed: ' + error.message)
      else fetchUsers()
    }
  }

  if (loading) return <div>Loading users...</div>

  return (
    <div>
      <h2>User Management</h2>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => window.open('https://supabase.com/dashboard/project/jlpztcesjnikrjyjjauu/auth/users', '_blank')}
        >
          Open Supabase Auth Panel (Create User)
        </button>
        <button onClick={fetchUsers}>Refresh Users</button>
      </div>
      <p style={{ marginBottom: '15px', color: '#555' }}>
        <strong>Note:</strong> After creating a user in the Auth panel, click <strong>Refresh Users</strong> and then assign a role using the "Edit Role" button below.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f0f0f0' }}>
          <tr>
            <th style={{ padding: '8px', textAlign: 'left' }}>Email</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Role</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Full Name</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Team</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.email}>
              <td style={{ padding: '8px' }}>{u.email}</td>
              <td style={{ padding: '8px' }}>
                {editingUserId === u.email ? (
                  <select
                    value={u.role}
                    onChange={e => handleUpdateRole(u.email, e.target.value)}
                    style={{ padding: '4px' }}
                  >
                    <option>agent</option>
                    <option>supervisor</option>
                    <option>manager</option>
                    <option>finance</option>
                    <option>admin</option>
                  </select>
                ) : (
                  u.role
                )}
              </td>
              <td style={{ padding: '8px' }}>{u.full_name}</td>
              <td style={{ padding: '8px' }}>{u.team}</td>
              <td style={{ padding: '8px' }}>
                {editingUserId === u.email ? (
                  <button onClick={() => setEditingUserId(null)}>Cancel</button>
                ) : (
                  <button onClick={() => setEditingUserId(u.email)}>Edit Role</button>
                )}
                <button onClick={() => handleDeleteUser(u.email)} style={{ marginLeft: '5px', color: 'red' }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}