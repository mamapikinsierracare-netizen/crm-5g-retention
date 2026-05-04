import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function ManagerDashboard() {
  const [kpis, setKpis] = useState({
    totalClients: 0,
    activeClients: 0,
    churnRate: 0,
    ltv: 0,
    winbackConversionRate: 0,
    revenueThisMonth: 0,
    avgCallsPerAgent: 0,
  })
  const [agentPerformance, setAgentPerformance] = useState([])
  const [recentTrend, setRecentTrend] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchKPIs = async () => {
      // Total clients
      const { count: totalClients } = await supabase.from('clients').select('*', { count: 'exact', head: true })
      // Active clients (not soft-deleted)
      const { count: activeClients } = await supabase.from('clients').select('*', { count: 'exact', head: true }).is('deleted_at', null)

      // Churn rate
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data: churned } = await supabase
        .from('call_activities')
        .select('client_account_id')
        .eq('response_outcome', 'No longer using our service')
        .gte('call_time', thirtyDaysAgo)
      const uniqueChurned = new Set(churned?.map(c => c.client_account_id)).size
      const churnRate = activeClients ? (uniqueChurned / activeClients) * 100 : 0

      // Winback conversion rate
      const { data: winbacks } = await supabase
        .from('call_activities')
        .select('response_outcome')
        .eq('call_type', 'Winback')
      const totalWinbacks = winbacks?.length || 0
      const successfulWinbacks = winbacks?.filter(w => w.response_outcome === 'Paid').length || 0
      const winbackConversionRate = totalWinbacks ? (successfulWinbacks / totalWinbacks) * 100 : 0

      // Revenue this month
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { data: paidThisMonth } = await supabase
        .from('call_activities')
        .select('package_price_at_time')
        .eq('response_outcome', 'Paid')
        .gte('call_time', firstDayOfMonth)
      const revenueThisMonth = paidThisMonth?.reduce((sum, p) => sum + (p.package_price_at_time || 0), 0) || 0

      // Average LTV
      const { data: clientsWithPrice } = await supabase.from('clients').select('package_price')
      const avgPrice = clientsWithPrice?.reduce((sum, c) => sum + (c.package_price || 0), 0) / (clientsWithPrice?.length || 1)
      const ltv = avgPrice * 12

      // Average calls per agent
      const { data: agents } = await supabase.from('users').select('email').eq('role', 'agent')
      const agentCount = agents?.length || 1
      const { count: totalCalls } = await supabase.from('call_activities').select('*', { count: 'exact', head: true })
      const avgCallsPerAgent = totalCalls / agentCount

      setKpis({
        totalClients: totalClients || 0,
        activeClients: activeClients || 0,
        churnRate: churnRate.toFixed(1),
        ltv: ltv.toFixed(0),
        winbackConversionRate: winbackConversionRate.toFixed(1),
        revenueThisMonth,
        avgCallsPerAgent: avgCallsPerAgent.toFixed(1),
      })

      // Agent performance (leaderboard)
      const { data: allCalls } = await supabase.from('call_activities').select('agent_email, response_outcome, package_price_at_time')
      const agentMap = new Map()
      allCalls?.forEach(call => {
        if (call.response_outcome === 'Paid') {
          const existing = agentMap.get(call.agent_email) || { wins: 0, revenue: 0 }
          existing.wins += 1
          existing.revenue += (call.package_price_at_time || 0)
          agentMap.set(call.agent_email, existing)
        }
      })
      const agentArray = Array.from(agentMap.entries()).map(([email, data]) => ({ email, wins: data.wins, revenue: data.revenue }))
      agentArray.sort((a, b) => b.wins - a.wins)
      setAgentPerformance(agentArray.slice(0, 10))

      // Daily calls last 7 days
      const last7Days = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const start = date.toISOString().slice(0, 10)
        const end = new Date(date.getTime() + 86400000).toISOString().slice(0, 10)
        const { count } = await supabase.from('call_activities').select('*', { count: 'exact', head: true }).gte('call_time', start).lt('call_time', end)
        const maxCalls = 10 // for bar scaling
        last7Days.push({ date: start, day: start.slice(5), calls: count || 0, barWidth: Math.min(100, (count / maxCalls) * 100) })
      }
      setRecentTrend(last7Days)

      setLoading(false)
    }
    fetchKPIs()
  }, [])

  if (loading) return <div>Loading manager dashboard...</div>

  const maxCalls = Math.max(...recentTrend.map(d => d.calls), 1)

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>Manager Dashboard – Key Performance Indicators</h2>

      {/* Stats grid – using your CSS classes */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-number">{kpis.totalClients}</div><div className="stat-label">Total Clients</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.activeClients}</div><div className="stat-label">Active Clients</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.churnRate}%</div><div className="stat-label">Churn Rate (30d)</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.winbackConversionRate}%</div><div className="stat-label">Winback Conversion</div></div>
        <div className="stat-card"><div className="stat-number">${kpis.revenueThisMonth.toLocaleString()}</div><div className="stat-label">Revenue This Month</div></div>
        <div className="stat-card"><div className="stat-number">${Number(kpis.ltv).toLocaleString()}</div><div className="stat-label">Avg LTV</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.avgCallsPerAgent}</div><div className="stat-label">Avg Calls/Agent</div></div>
      </div>

      {/* Daily Call Trend – Modern bar chart */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Daily Call Trend (Last 7 days)</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', justifyContent: 'space-around', flexWrap: 'wrap' }}>
          {recentTrend.map(day => (
            <div key={day.date} style={{ textAlign: 'center', flex: 1, minWidth: '60px' }}>
              <div style={{
                backgroundColor: 'var(--primary)',
                height: `${(day.calls / maxCalls) * 120}px`,
                width: '40px',
                margin: '0 auto',
                borderRadius: '8px 8px 4px 4px',
                transition: 'height 0.3s',
              }} />
              <div style={{ marginTop: '8px', fontWeight: '500', fontSize: '0.8rem' }}>{day.day}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{day.calls} calls</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Agent Performance Table */}
      <div className="table-container">
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Top Agent Performance (by Successful Winbacks)</h3>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Successful Winbacks</th>
              <th>Revenue Generated</th>
            </tr>
          </thead>
          <tbody>
            {agentPerformance.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>No winback data yet</td>
              </tr>
            ) : (
              agentPerformance.map(agent => (
                <tr key={agent.email}>
                  <td>{agent.email}</td>
                  <td>{agent.wins}</td>
                  <td>${agent.revenue.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}