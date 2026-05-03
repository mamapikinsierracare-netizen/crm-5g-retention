import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function AuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ user: '', table: '', action: '' })

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true)
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('action_time', { ascending: false })
        .limit(200)

      if (filters.user) query = query.ilike('user_email', `%${filters.user}%`)
      if (filters.table) query = query.eq('table_name', filters.table)
      if (filters.action) query = query.eq('action', filters.action)

      const { data, error } = await query
      if (!error) setLogs(data || [])
      setLoading(false)
    }
    fetchLogs()
  }, [filters])

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value })
  }

  if (loading) return <div>Loading audit log...</div>

  return (
    <div>
      <h2>Audit Log</h2>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          name="user"
          placeholder="Filter by user email"
          value={filters.user}
          onChange={handleFilterChange}
          style={{ padding: '5px' }}
        />
        <select name="table" value={filters.table} onChange={handleFilterChange}>
          <option value="">All tables</option>
          <option>clients</option>
          <option>call_activities</option>
          <option>invoice_requests</option>
          <option>broadcasts</option>
          <option>private_messages</option>
          <option>users</option>
        </select>
        <select name="action" value={filters.action} onChange={handleFilterChange}>
          <option value="">All actions</option>
          <option>INSERT</option>
          <option>UPDATE</option>
          <option>DELETE</option>
        </select>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f0f0f0' }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>User</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Role</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Action</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Table</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Record ID</th>
              <th style={{ padding: '8px', textAlign: 'left' }}>Changes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px' }}>{new Date(log.action_time).toLocaleString()}</td>
                <td style={{ padding: '8px' }}>{log.user_email}</td>
                <td style={{ padding: '8px' }}>{log.user_role}</td>
                <td style={{ padding: '8px' }}>{log.action}</td>
                <td style={{ padding: '8px' }}>{log.table_name}</td>
                <td style={{ padding: '8px' }}>{log.record_id}</td>
                <td style={{ padding: '8px' }}>
                  <pre style={{ margin: 0, fontSize: '12px', maxWidth: '300px', overflowX: 'auto' }}>
                    {JSON.stringify(log.old_data || log.new_data, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}