import { useState, useEffect } from 'react'
import ClientSearch from './ClientSearch'
import ActivityTimeline from './ActivityTimeline'
import CallForm from './CallForm'
import AgentInvoices from './AgentInvoices'
import { supabase } from './supabase'

export default function AgentDashboard({ user }) {
  const [selectedClient, setSelectedClient] = useState(null)
  const [refreshTimeline, setRefreshTimeline] = useState(0)
  const [editingClient, setEditingClient] = useState(false)
  const [editForm, setEditForm] = useState({})
  
  // NEW: state for KPIs
  const [kpiData, setKpiData] = useState({
    today: { calls: 0, winbacks: 0, revenue: 0 },
    week: { calls: 0, winbacks: 0, revenue: 0 },
    month: { calls: 0, winbacks: 0, revenue: 0 },
    conversionRate: 0,
    weeklyTrend: []   // last 7 days: { date, calls }
  })

  // Helper: start of day (local midnight in ISO)
  const startOfDay = (date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }

  const startOfWeek = () => {
    const now = new Date()
    const day = now.getDay() // 0 = Sunday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
    const monday = new Date(now.setDate(diff))
    monday.setHours(0, 0, 0, 0)
    return monday.toISOString()
  }

  const startOfMonth = () => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    firstDay.setHours(0, 0, 0, 0)
    return firstDay.toISOString()
  }

  // Fetch agent performance data
  const fetchKPIs = async () => {
    if (!user?.email) return

    const { data: calls, error } = await supabase
      .from('call_activities')
      .select('call_time, call_type, call_outcome, package_price_at_time')
      .eq('agent_email', user.email)

    if (error) {
      console.error('Error fetching KPIs:', error)
      return
    }

    const isInRange = (callTime, startDate) => new Date(callTime) >= new Date(startDate)

    const calculatePeriod = (startDate) => {
      const periodCalls = calls.filter(c => isInRange(c.call_time, startDate))
      const winbackCalls = periodCalls.filter(c => c.call_type === 'Winback')
      const successfulWinbacks = winbackCalls.filter(c => c.call_outcome === 'Success' || c.call_outcome === 'Won')
      const revenue = successfulWinbacks.reduce((sum, c) => sum + (c.package_price_at_time || 0), 0)
      return {
        calls: periodCalls.length,
        winbacks: successfulWinbacks.length,
        revenue
      }
    }

    const today = calculatePeriod(startOfDay(new Date()))
    const week = calculatePeriod(startOfWeek())
    const month = calculatePeriod(startOfMonth())

    const totalWinbackCallsMonth = calls.filter(c => 
      c.call_type === 'Winback' && isInRange(c.call_time, startOfMonth())
    ).length
    const conversionRate = totalWinbackCallsMonth > 0 ? (month.winbacks / totalWinbackCallsMonth) * 100 : 0

    // Weekly trend (last 7 days)
    const last7Days = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date()
      day.setDate(day.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)
      const dayCalls = calls.filter(c => {
        const ct = new Date(c.call_time)
        return ct >= day && ct < nextDay
      }).length
      last7Days.push({
        date: day.toLocaleDateString(undefined, { weekday: 'short' }),
        calls: dayCalls
      })
    }

    setKpiData({
      today, week, month,
      conversionRate: Math.round(conversionRate),
      weeklyTrend: last7Days
    })
  }

  // Fetch KPIs on mount and when user changes
  useEffect(() => {
    fetchKPIs()
  }, [user])

  const handleSelectClient = (client) => {
    setSelectedClient(client)
    setEditForm(client)
    setEditingClient(false)
  }

  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value })
  }

  const handleSaveClient = async () => {
    const { error } = await supabase
      .from('clients')
      .update({
        name: editForm.name,
        contact: editForm.contact,
        address: editForm.address,
        current_package: editForm.current_package,
        package_price: parseFloat(editForm.package_price),
        retention_agent: editForm.retention_agent,
        installation_date: editForm.installation_date,
        account_status: editForm.account_status,
        updated_by: user.email,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', selectedClient.account_id)

    if (error) {
      alert('Update failed: ' + error.message)
    } else {
      alert('Client updated successfully')
      setSelectedClient({ ...selectedClient, ...editForm })
      setEditingClient(false)
    }
  }

  const handleCallSubmitted = () => {
    setRefreshTimeline(prev => prev + 1)
    fetchKPIs()   // Refresh KPIs after a new call
  }

  // Shared header with welcome message and KPI section (always visible)
  const renderPerformanceSection = () => (
    <div className="kpi-section" style={{ marginBottom: '2rem' }}>
      <h2>📊 My Performance</h2>
      <div className="kpi-grid">
        <div className="kpi-card">
          <h3>Today</h3>
          <div className="kpi-value">{kpiData.today.calls}</div>
          <div className="kpi-label">Calls</div>
          <div className="kpi-sub">{kpiData.today.winbacks} winbacks</div>
          <div className="kpi-sub">${kpiData.today.revenue} revenue</div>
        </div>
        <div className="kpi-card">
          <h3>This Week</h3>
          <div className="kpi-value">{kpiData.week.calls}</div>
          <div className="kpi-label">Calls</div>
          <div className="kpi-sub">{kpiData.week.winbacks} winbacks</div>
          <div className="kpi-sub">${kpiData.week.revenue} revenue</div>
        </div>
        <div className="kpi-card">
          <h3>This Month</h3>
          <div className="kpi-value">{kpiData.month.calls}</div>
          <div className="kpi-label">Calls</div>
          <div className="kpi-sub">{kpiData.month.winbacks} winbacks</div>
          <div className="kpi-sub">${kpiData.month.revenue} revenue</div>
          <div className="kpi-sub">Conversion: {kpiData.conversionRate}%</div>
        </div>
      </div>
      <div className="trend-section">
        <h3>Last 7 Days Call Trend</h3>
        <div className="bar-chart">
          {kpiData.weeklyTrend.map((day, idx) => (
            <div key={idx} className="bar-item">
              <div className="bar-label">{day.date}</div>
              <div className="bar-container">
                <div 
                  className="bar" 
                  style={{ height: `${Math.min(day.calls * 10, 100)}%` }}
                ></div>
              </div>
              <div className="bar-value">{day.calls}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  if (!selectedClient) {
    return (
      <div>
        <h2>Agent Dashboard</h2>
        <p>Welcome, {user.email} (Role: {user.role})</p>
        {renderPerformanceSection()}
        <ClientSearch onSelectClient={handleSelectClient} />
        <AgentInvoices agentEmail={user.email} />
      </div>
    )
  }

  return (
    <div>
      <h2>Agent Dashboard</h2>
      <p>Welcome, {user.email} (Role: {user.role})</p>
      {renderPerformanceSection()}
      <ClientSearch onSelectClient={handleSelectClient} />

      <div style={{ marginTop: '20px', border: '1px solid var(--border)', padding: '15px', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Client Details</h3>
          <div>
            {!editingClient ? (
              <button onClick={() => setEditingClient(true)}>Edit</button>
            ) : (
              <>
                <button onClick={handleSaveClient}>Save</button>
                <button onClick={() => setEditingClient(false)} style={{ marginLeft: '8px' }}>Cancel</button>
              </>
            )}
          </div>
        </div>

        {!editingClient ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div><strong>Account ID:</strong> {selectedClient.account_id}</div>
            <div><strong>Name:</strong> {selectedClient.name}</div>
            <div><strong>Contact:</strong> {selectedClient.contact}</div>
            <div><strong>Address:</strong> {selectedClient.address || '-'}</div>
            <div><strong>Package:</strong> {selectedClient.current_package} - ${selectedClient.package_price}</div>
            <div><strong>Retention Agent:</strong> {selectedClient.retention_agent || '-'}</div>
            <div><strong>Installation Date:</strong> {selectedClient.installation_date || '-'}</div>
            <div><strong>Account Status:</strong> {selectedClient.account_status || 'active'}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <div><label>Account ID</label><input value={editForm.account_id} disabled style={{ background: '#f0f0f0' }} /></div>
            <div><label>Name</label><input name="name" value={editForm.name} onChange={handleEditChange} required /></div>
            <div><label>Contact</label><input name="contact" value={editForm.contact} onChange={handleEditChange} required /></div>
            <div><label>Address</label><input name="address" value={editForm.address || ''} onChange={handleEditChange} /></div>
            <div>
              <label>Package Type</label>
              <select name="current_package" value={editForm.current_package} onChange={handleEditChange}>
                <option>Base</option><option>Pro</option><option>Max</option>
                <option>Awujor Base</option><option>Awujor Pro</option><option>Awujor Max</option>
                <option>One Access</option><option>Other</option>
              </select>
            </div>
            <div><label>Price ($)</label><input type="number" name="package_price" value={editForm.package_price} onChange={handleEditChange} /></div>
            <div><label>Retention Agent</label><input name="retention_agent" value={editForm.retention_agent || ''} onChange={handleEditChange} placeholder="Agent email or name" /></div>
            <div><label>Installation Date</label><input type="date" name="installation_date" value={editForm.installation_date || ''} onChange={handleEditChange} /></div>
            <div>
              <label>Account Status</label>
              <select name="account_status" value={editForm.account_status || 'active'} onChange={handleEditChange}>
                <option>active</option><option>disabled</option><option>deleted</option>
              </select>
            </div>
          </div>
        )}

        <ActivityTimeline key={refreshTimeline} clientAccountId={selectedClient.account_id} />
        <CallForm client={selectedClient} user={user} onCallSubmitted={handleCallSubmitted} />
      </div>
      <AgentInvoices agentEmail={user.email} />
    </div>
  )
}