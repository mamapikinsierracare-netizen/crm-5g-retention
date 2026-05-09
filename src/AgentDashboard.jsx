import { useState, useEffect, useCallback } from 'react'
import ClientSearch from './ClientSearch'
import ActivityTimeline from './ActivityTimeline'
import CallForm from './CallForm'
import AgentInvoices from './AgentInvoices'
import { supabase } from './supabase'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts'

// --- HELPER FUNCTIONS MOVED OUTSIDE COMPONENT FOR PERFORMANCE ---
function getDateRange(range) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));

  switch (range) {
    case 'Today': return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    case 'This Week': return { start: startOfWeek.toISOString(), end: new Date(startOfWeek.getTime() + (7 * 86400000)).toISOString() };
    case 'This Month': return { 
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), 
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString() 
    };
    default: return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
  }
}

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
// ----------------------------------------------------------------

export default function AgentDashboard({ user }) {
  // Extract email safely at the top to satisfy React Compiler's strict dependency checks
  const userEmail = user?.email;

  const [selectedClient, setSelectedClient] = useState(null)
  const [refreshTimeline, setRefreshTimeline] = useState(0)
  const [editingClient, setEditingClient] = useState(false)
  const [editForm, setEditForm] = useState({})
  
  // ORIGINAL: state for KPIs
  const [kpiData, setKpiData] = useState({
    today: { calls: 0, winbacks: 0, revenue: 0 },
    week: { calls: 0, winbacks: 0, revenue: 0 },
    month: { calls: 0, winbacks: 0, revenue: 0 },
    conversionRate: 0,
    weeklyTrend: []   // last 7 days: { date, calls }
  })

  // NEW: State for Team Gamification & Transparency
  const [globalStats, setGlobalStats] = useState({
    teamAvgCalls: 0,
    teamAvgWinbacks: 0,
    leaderboard: [],
    trendData: [],
    totalUniverse: 0
  })

  const fetchKPIs = useCallback(async () => {
    if (!userEmail) return

    const { data: calls, error } = await supabase
      .from('call_activities')
      .select('call_time, call_type, call_outcome, package_price_at_time')
      .eq('agent_email', userEmail)

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
  }, [userEmail])

  const fetchGlobalStats = useCallback(async () => {
    if (!userEmail) return;
    
    const { data: allCalls } = await supabase
      .from('call_activities')
      .select('*, clients(aav_value_usd)')
      .gte('call_time', startOfMonth());
    
    const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true });
    
    const validCalls = allCalls || [];
    
    const uniqueAgents = new Set(validCalls.map(c => c.agent_email)).size || 1;
    const teamAvgCalls = Math.round(validCalls.length / uniqueAgents);
    const winbackCalls = validCalls.filter(c => c.response_outcome === 'Paid' || c.call_outcome === 'Success' || c.call_outcome === 'Won');
    const teamAvgWinbacks = Math.round(winbackCalls.length / uniqueAgents);

    const agentMap = new Map();
    validCalls.forEach(c => {
      const email = c.agent_email || 'System';
      if (!agentMap.has(email)) agentMap.set(email, { name: email.split('@')[0], email, wins: 0, revenue: 0 });
      const a = agentMap.get(email);
      if (c.response_outcome === 'Paid' || c.call_outcome === 'Success' || c.call_outcome === 'Won') {
        a.wins += 1;
        a.revenue += (Number(c.clients?.aav_value_usd) || c.package_price_at_time || 0);
      }
    });
    const leaderboard = Array.from(agentMap.values()).sort((a,b) => b.wins - a.wins);

    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0,0,0,0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const dayCalls = validCalls.filter(c => {
        const ct = new Date(c.call_time);
        return ct >= day && ct < nextDay;
      });
      const myCallsCount = dayCalls.filter(c => c.agent_email === userEmail).length;
      
      trend.push({
        date: day.toLocaleDateString(undefined, { weekday: 'short' }),
        teamCalls: dayCalls.length,
        myCalls: myCallsCount
      });
    }

    setGlobalStats({ teamAvgCalls, teamAvgWinbacks, leaderboard, trendData: trend, totalUniverse: count || 0 });
  }, [userEmail])

  // CLEANED UP EFFECT
  useEffect(() => {
    // Wrapping in an async function tells the compiler the state updates are safe and deferred
    const loadDashboardData = async () => {
      if (userEmail) {
        await Promise.all([fetchKPIs(), fetchGlobalStats()]);
      }
    };
    
    loadDashboardData();
  }, [fetchKPIs, fetchGlobalStats, userEmail]);

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
        updated_by: userEmail,
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
    fetchKPIs()   
    fetchGlobalStats() 
  }

  const renderPerformanceSection = () => (
    <>
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
          
          <div className="kpi-card" style={{ background: '#f8f9fa', border: '1px solid #ddd' }}>
            <h3>My Benchmarks</h3>
            <div className="kpi-sub" style={{ marginTop: '10px' }}>
              <strong>Avg Team Calls:</strong> {globalStats.teamAvgCalls}/mo
              <span style={{ color: kpiData.month.calls >= globalStats.teamAvgCalls ? '#4caf50' : '#f44336', marginLeft: '5px' }}>
                {kpiData.month.calls >= globalStats.teamAvgCalls ? '▲' : '▼'}
              </span>
            </div>
            <div className="kpi-sub" style={{ marginTop: '5px' }}>
              <strong>Avg Team Winbacks:</strong> {globalStats.teamAvgWinbacks}/mo
              <span style={{ color: kpiData.month.winbacks >= globalStats.teamAvgWinbacks ? '#4caf50' : '#f44336', marginLeft: '5px' }}>
                {kpiData.month.winbacks >= globalStats.teamAvgWinbacks ? '▲' : '▼'}
              </span>
            </div>
            <div className="kpi-sub" style={{ marginTop: '10px', color: '#666', fontSize: '0.8rem' }}>
              Full DB Access: <strong>{globalStats.totalUniverse}</strong> Leads
            </div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '20px', height: '350px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>Activity Trend: Me vs. Team</h3>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={globalStats.trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickMargin={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="teamCalls" name="Team Calls" stroke="#ccc" fill="#eee" strokeWidth={2} />
              <Area type="monotone" dataKey="myCalls" name="My Calls" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.3} strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: '20px', height: '350px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>🏆 Open Team Leaderboard</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', color: '#666' }}>
                <th style={{ paddingBottom: '10px' }}>Rank</th>
                <th style={{ paddingBottom: '10px' }}>Agent</th>
                <th style={{ paddingBottom: '10px' }}>Winbacks</th>
                <th style={{ paddingBottom: '10px' }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {globalStats.leaderboard.map((agent, index) => {
                const isMe = agent.email === userEmail;
                return (
                  <tr key={agent.email} style={{ 
                    borderBottom: '1px solid #f9f9f9',
                    backgroundColor: isMe ? '#e3f2fd' : 'transparent',
                    fontWeight: isMe ? 'bold' : 'normal'
                  }}>
                    <td style={{ padding: '12px 0' }}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </td>
                    <td>{agent.name} {isMe && '(You)'}</td>
                    <td>{agent.wins}</td>
                    <td style={{ color: '#4caf50' }}>${agent.revenue.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )

  if (!selectedClient) {
    return (
      <div>
        <h2>Agent Workspace</h2>
        <p>Welcome, {userEmail}</p>
        {renderPerformanceSection()}
        <ClientSearch onSelectClient={handleSelectClient} />
        <AgentInvoices agentEmail={userEmail} />
      </div>
    )
  }

  return (
    <div>
      <h2>Agent Workspace</h2>
      <p>Welcome, {userEmail}</p>
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
            <div><strong>Package:</strong> {selectedClient.current_package} - USD ${selectedClient.package_price} 
  {selectedClient.package_price_nle && ` (≈ NLe ${selectedClient.package_price_nle.toFixed(2)})`}
</div>
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
      <AgentInvoices agentEmail={userEmail} />
    </div>
  )
}