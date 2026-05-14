import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// --- HELPER: Secure Password Generator ---
const generateSecurePassword = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass + "1A!"; // Guarantee at least one number, uppercase, and special char
};

export default function UserManagement({ user: currentUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEmail, setEditingEmail] = useState(null)
  const [currentUserRole, setCurrentUserRole] = useState('agent')
  
  // State to show generated passwords to the admin
  const [newlyGeneratedInfo, setNewlyGeneratedInfo] = useState(null)
  
  const [newUser, setNewUser] = useState({
    email: '',
    fullName: '',
    role: 'agent'
  })

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
      if (currentUserRole === 'manager') {
        setUsers(data.filter(u => u.role !== 'admin'))
      } else {
        setUsers(data)
      }
    }
    setLoading(false)
  }, [currentUserRole])

  // FIX 1: Safe async effect execution to prevent cascading renders
  useEffect(() => {
    const loadData = async () => {
      await fetchCurrentRole();
      await fetchUsers();
    };
    loadData();
  }, [fetchCurrentRole, fetchUsers])

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const generatedPassword = generateSecurePassword();

      // FIX 2: Removed unused 'data' variable
      const { error } = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'create',
          ...newUser, 
          password: generatedPassword,
          requires_password_change: true 
        }
      })

      if (error) {
        const errorContext = error.context ? await error.context.json() : null;
        throw new Error(errorContext?.error || error.message || "Failed to create user");
      }

      // Ensure the public users table has the flag set to true
      await supabase.from('users').update({ requires_password_change: true }).eq('email', newUser.email);

      setNewlyGeneratedInfo({ email: newUser.email, password: generatedPassword });
      
      setNewUser({ email: '', fullName: '', role: 'agent' })
      fetchUsers()

    } catch (err) {
      alert("Account Creation Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  // --- REGENERATE PASSWORD FEATURE ---
  const handleRegeneratePassword = async (email, role) => {
    if (role === 'admin' && currentUserRole !== 'admin') {
      alert("Unauthorized: Only Admins can reset Admin passwords.");
      return;
    }

    if (!window.confirm(`Are you sure you want to force a password reset for ${email}?`)) return;

    setLoading(true);
    try {
      const generatedPassword = generateSecurePassword();

      // Tell the Edge Function to reset the password
      const { error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'reset_password', email: email, password: generatedPassword }
      });

      if (error) throw error;

      // Lock the user out until they change it
      await supabase.from('users').update({ requires_password_change: true }).eq('email', email);

      setNewlyGeneratedInfo({ email: email, password: generatedPassword, isReset: true });
    } catch (err) {
      alert("Password Reset Error: " + err.message + "\n\n(Ensure your manage-users Edge Function supports the 'reset_password' action.)");
    } finally {
      setLoading(false);
    }
  }

  const handleUpdateRole = async (email, newRole) => {
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

    if (window.confirm(`Are you sure you want to delete ${email}?`)) {
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

      {/* SECURE PASSWORD DISPLAY VAULT */}
      {newlyGeneratedInfo && (
        <div style={{ background: '#e3f2fd', border: '2px solid #007bff', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#0056b3' }}>
            {newlyGeneratedInfo.isReset ? '🔐 Password Successfully Reset' : '✅ Account Created Successfully'}
          </h3>
          <p style={{ margin: '0 0 10px 0' }}>Please copy these credentials and send them to the user. <strong>They will be forced to change this password upon first login.</strong></p>
          <div style={{ background: '#fff', padding: '15px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '1.2rem', border: '1px dashed #007bff' }}>
            <div><strong>Email:</strong> {newlyGeneratedInfo.email}</div>
            <div style={{ marginTop: '10px' }}><strong>Temp Password:</strong> {newlyGeneratedInfo.password}</div>
          </div>
          <button onClick={() => setNewlyGeneratedInfo(null)} style={{ marginTop: '15px' }} className="btn-primary">Clear Screen</button>
        </div>
      )}

      {/* DIRECT USER CREATION FORM */}
      <div className="card" style={{ marginBottom: '30px', padding: '20px', border: '1px solid #ddd' }}>
        <h3 style={{ marginTop: 0 }}>Add New System User</h3>
        <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>Email Address</label>
            <input type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} style={{ width: '100%', padding: '8px' }}/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>Full Name</label>
            <input type="text" required value={newUser.fullName} onChange={e => setNewUser({...newUser, fullName: e.target.value})} style={{ width: '100%', padding: '8px' }}/>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '5px', fontWeight: 'bold' }}>System Role</label>
            <select value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})} style={{ width: '100%', padding: '8px' }}>
              <option value="agent">Retention Agent</option>
              <option value="supervisor">Supervisor</option>
              <option value="finance">Finance</option>
              <option value="manager">Manager</option>
              {currentUserRole === 'admin' && <option value="admin">System Admin</option>}
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '9px' }}>
            {loading ? 'Processing...' : 'Auto-Generate & Create'}
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
              <th style={{ textAlign: 'right', paddingRight: '12px' }}>Security & Management</th>
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
                    <select value={u.role} onChange={e => handleUpdateRole(u.email, e.target.value)} autoFocus>
                      <option value="agent">agent</option>
                      <option value="supervisor">supervisor</option>
                      <option value="finance">finance</option>
                      <option value="manager">manager</option>
                      {currentUserRole === 'admin' && <option value="admin">admin</option>}
                    </select>
                  ) : (
                    <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', background: u.role === 'admin' ? '#343a40' : '#e9ecef', color: u.role === 'admin' ? '#fff' : '#495057', fontWeight: 'bold' }}>
                      {u.role.toUpperCase()}
                    </span>
                  )}
                </td>
                <td>
                  {u.requires_password_change ? 
                    <span style={{ color: '#ff9800', fontWeight: 'bold', fontSize: '0.85rem' }}>⚠ Pending Reset</span> : 
                    <span style={{ color: '#28a745', fontWeight: 'bold', fontSize: '0.85rem' }}>● Secure</span>
                  }
                </td>
                <td style={{ textAlign: 'right', padding: '12px' }}>
                  <button 
                    onClick={() => handleRegeneratePassword(u.email, u.role)}
                    className="btn-outline btn-sm"
                    style={{ marginRight: '10px', borderColor: '#ff9800', color: '#ff9800' }}
                    disabled={u.role === 'admin' && currentUserRole !== 'admin'}
                  >
                    Reset Password
                  </button>
                  {editingEmail === u.email ? (
                    <button onClick={() => setEditingEmail(null)} className="btn-sm">Cancel</button>
                  ) : (
                    <button onClick={() => setEditingEmail(u.email)} className="btn-sm" disabled={u.role === 'admin' && currentUserRole !== 'admin'}>Edit Role</button>
                  )}
                  <button onClick={() => handleDeleteUser(u.email, u.role)} style={{ marginLeft: '10px', color: '#dc3545', border: 'none', background: 'none', cursor: 'pointer' }} disabled={u.role === 'admin' && currentUserRole !== 'admin'}>
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