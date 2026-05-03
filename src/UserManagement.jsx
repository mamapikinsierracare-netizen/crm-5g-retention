import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function UserManagement({ user: currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingUserId, setEditingUserId] = useState(null)
  const [form, setForm] = useState({ email: '', role: 'agent', full_name: '', team: '' })
  const [showAddForm, setShowAddForm] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    if (!error) setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleCreateUser = async (e) => {
    e.preventDefault()
    // Create user in auth first (using admin function) – requires service role, but we cannot from client.
    // Alternative: create via Supabase Admin API? Not from client.
    // Simpler: we will only allow manager to update roles of existing users, not create new auth users from UI.
    // For full user creation, use Supabase dashboard or we can create a cloud function later.
    // For now, we implement role update and delete only.
    alert('User creation from UI requires additional backend setup. Use Supabase Auth panel to add new users, then assign role here.')
    setShowAddForm(false)
  }

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
      <button onClick={() => setShowAddForm(!showAddForm)}>+ Add User (manual)</button>
      {showAddForm && (
        <form onSubmit={handleCreateUser} style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '20px' }}>
          <p><strong>Note:</strong> This form only adds to the users table. The user must already exist in Authentication.</p>
          <div><label>Email:</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></div>
          <div><label>Role:</label><select value={form.role} onChange={e => setForm({...form, role: e.target.value})}><option>agent</option><option>supervisor</option><option>manager</option><option>finance</option><option>admin</option></select></div>
          <div><label>Full Name:</label><input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} /></div>
          <div><label>Team:</label><input value={form.team} onChange={e => setForm({...form, team: e.target.value})} /></div>
          <button type="submit">Add</button>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f0f0f0' }}>
          <tr><th>Email</th><th>Role</th><th>Full Name</th><th>Team</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.email}>
              <td>{u.email}</td>
              <td>
                {editingUserId === u.email ? (
                  <select value={u.role} onChange={e => handleUpdateRole(u.email, e.target.value)}>
                    <option>agent</option><option>supervisor</option><option>manager</option><option>finance</option><option>admin</option>
                  </select>
                ) : u.role}
              </td>
              <td>{u.full_name}</td>
              <td>{u.team}</td>
              <td>
                {editingUserId === u.email ? (
                  <button onClick={() => setEditingUserId(null)}>Cancel</button>
                ) : (
                  <button onClick={() => setEditingUserId(u.email)}>Edit Role</button>
                )}
                <button onClick={() => handleDeleteUser(u.email)} style={{ marginLeft: '5px', color: 'red' }}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}