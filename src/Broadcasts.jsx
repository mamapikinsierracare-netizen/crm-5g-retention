import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function Broadcasts({ user }) {
  const [broadcasts, setBroadcasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    type: 'announcement',
    is_pinned: false,
    expires_at: '',
  })

  const isModerator = ['supervisor', 'manager', 'finance', 'admin'].includes(user.role)

  useEffect(() => {
    const fetchBroadcasts = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('broadcasts')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      if (!error) {
        setBroadcasts(data || [])
        // Mark all displayed broadcasts as read for this user
        if (data && data.length > 0 && user?.email) {
          const reads = data.map(b => ({
            broadcast_id: b.id,
            user_email: user.email,
          }))
          for (const read of reads) {
            await supabase
              .from('broadcast_reads')
              .upsert(read, { onConflict: 'broadcast_id, user_email' })
          }
        }
      } else console.error(error)
      setLoading(false)
    }

    fetchBroadcasts()
  }, [user?.email]) // dependency on user email to re‑fetch if user changes (though unlikely)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const expiresAtValue = form.expires_at && form.expires_at.trim() !== '' ? form.expires_at : null

    const payload = {
      title: form.title,
      content: form.content,
      type: form.type,
      is_pinned: form.is_pinned,
      expires_at: expiresAtValue,
      created_by: user.email,
      created_by_role: user.role,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const { error } = await supabase
        .from('broadcasts')
        .update(payload)
        .eq('id', editingId)
      if (error) alert('Update failed: ' + error.message)
    } else {
      const { data, error } = await supabase
        .from('broadcasts')
        .insert([{ ...payload, created_at: new Date().toISOString() }])
        .select()
      if (error) {
        alert('Create failed: ' + error.message)
      } else {
        // Send notifications to all managers and admins
        const { data: users } = await supabase
          .from('users')
          .select('email')
          .in('role', ['manager', 'admin'])
        if (users && users.length > 0 && data && data[0]) {
          const broadcastId = data[0].id
          const notifications = users.map(u => ({
            user_email: u.email,
            title: 'New Broadcast',
            message: `${form.title} - ${form.content.substring(0, 100)}`,
            type: 'broadcast',
            related_id: broadcastId,
          }))
          await supabase.from('notifications').insert(notifications)
        }
      }
    }
    setShowForm(false)
    setEditingId(null)
    setForm({ title: '', content: '', type: 'announcement', is_pinned: false, expires_at: '' })
    // Re-fetch broadcasts after create/update
    const { data: newData } = await supabase
      .from('broadcasts')
      .select('*')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (newData) setBroadcasts(newData)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Delete this broadcast?')) {
      await supabase.from('broadcasts').delete().eq('id', id)
      // Refresh list
      const { data: newData } = await supabase
        .from('broadcasts')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (newData) setBroadcasts(newData)
    }
  }

  const handleEdit = (broadcast) => {
    setEditingId(broadcast.id)
    setForm({
      title: broadcast.title,
      content: broadcast.content,
      type: broadcast.type,
      is_pinned: broadcast.is_pinned,
      expires_at: broadcast.expires_at ? broadcast.expires_at.slice(0, 16) : '',
    })
    setShowForm(true)
  }

  const handlePin = async (id, currentPinned) => {
    await supabase
      .from('broadcasts')
      .update({ is_pinned: !currentPinned, updated_at: new Date().toISOString() })
      .eq('id', id)
    // Refresh list
    const { data: newData } = await supabase
      .from('broadcasts')
      .select('*')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    if (newData) setBroadcasts(newData)
  }

  if (loading) return <div>Loading broadcasts...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Broadcasts</h2>
        {isModerator && (
          <button onClick={() => { setShowForm(!showForm); if (showForm) { setEditingId(null); setForm({ title: '', content: '', type: 'announcement', is_pinned: false, expires_at: '' }); } }}>
            {showForm ? 'Cancel' : '+ New Broadcast'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: '1px solid var(--border)', padding: '15px', marginBottom: '20px', borderRadius: 'var(--radius)' }}>
          <div><label>Title:</label><input name="title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} required style={{width: '100%'}} /></div>
          <div><label>Content:</label><textarea name="content" value={form.content} onChange={e => setForm({...form, content: e.target.value})} required rows="3" style={{width: '100%'}} /></div>
          <div><label>Type:</label>
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
              <option>announcement</option><option>info</option><option>warning</option><option>success</option>
            </select>
          </div>
          <div><label><input type="checkbox" checked={form.is_pinned} onChange={e => setForm({...form, is_pinned: e.target.checked})} /> Pin to top</label></div>
          <div><label>Expires at (optional):</label><input type="datetime-local" value={form.expires_at} onChange={e => setForm({...form, expires_at: e.target.value})} /></div>
          <button type="submit">{editingId ? 'Update' : 'Create'}</button>
        </form>
      )}

      {broadcasts.length === 0 && <p>No broadcasts yet.</p>}
      {broadcasts.map(b => (
        <div key={b.id} style={{ borderLeft: '4px solid ' + (b.type === 'warning' ? 'orange' : b.type === 'success' ? 'green' : b.type === 'info' ? 'blue' : 'gray'), marginBottom: '15px', padding: '10px', background: 'var(--bg-card)', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>{b.title} {b.is_pinned && '📌'} <small>({b.type})</small></h3>
            {isModerator && (
              <div>
                <button onClick={() => handlePin(b.id, b.is_pinned)}>{b.is_pinned ? 'Unpin' : 'Pin'}</button>
                <button onClick={() => handleEdit(b)}>Edit</button>
                <button onClick={() => handleDelete(b.id)}>Delete</button>
              </div>
            )}
          </div>
          <p>{b.content}</p>
          <div style={{ fontSize: 'small', color: 'var(--text-muted)' }}>Posted by {b.created_by} ({b.created_by_role}) on {new Date(b.created_at).toLocaleString()}{b.expires_at && ` – Expires: ${new Date(b.expires_at).toLocaleString()}`}</div>
        </div>
      ))}
    </div>
  )
}