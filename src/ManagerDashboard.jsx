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

      // Churn rate: (clients who have call outcome "No longer using our service" in last 30 days) / total active
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
      const { data: churned } = await supabase
        .from('call_activities')
        .select('client_account_id')
        .eq('response_outcome', 'No longer using our service')
        .gte('call_time', thirtyDaysAgo)
      const uniqueChurned = new Set(churned?.map(c => c.client_account_id)).size
      const churnRate = activeClients ? (uniqueChurned / activeClients) * 100 : 0

      // Winback conversion rate: (Paid response_outcome) / total Winback calls
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

      // Average LTV as average package_price * 12 (rough)
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

      // Agent performance (similar to leaderboard)
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

      // Daily calls last 7 days trend
      const last7Days = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const start = date.toISOString().slice(0, 10)
        const end = new Date(date.getTime() + 86400000).toISOString().slice(0, 10)
        const { count } = await supabase.from('call_activities').select('*', { count: 'exact', head: true }).gte('call_time', start).lt('call_time', end)
        last7Days.push({ date: start, calls: count || 0 })
      }
      setRecentTrend(last7Days)

      setLoading(false)
    }
    fetchKPIs()
  }, [])

  if (loading) return <div>Loading manager dashboard...</div>

  return (
    <div>
      <h2>Manager Dashboard – Key Performance Indicators</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '15px', marginBottom: '30px' }}>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Total Clients</strong><br />{kpis.totalClients}</div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Active Clients</strong><br />{kpis.activeClients}</div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Churn Rate (30d)</strong><br />{kpis.churnRate}%</div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Winback Conversion</strong><br />{kpis.winbackConversionRate}%</div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Revenue This Month</strong><br />${kpis.revenueThisMonth}</div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Avg LTV</strong><br />${kpis.ltv}</div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', background: '#f9f9f9' }}><strong>Avg Calls per Agent</strong><br />{kpis.avgCallsPerAgent}</div>
      </div>

      <h3>Daily Call Trend (Last 7 days)</h3>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '30px' }}>
        {recentTrend.map(day => (
          <div key={day.date} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ backgroundColor: '#007bff', height: `${day.calls * 5}px`, minHeight: '5px', width: '100%', borderRadius: '4px' }} title={`${day.calls} calls`}></div>
            <div style={{ fontSize: '12px' }}>{day.date.slice(5)}</div>
            <div style={{ fontSize: '12px' }}>{day.calls}</div>
          </div>
        ))}
      </div>

      <h3>Top Agent Performance (by Successful Winbacks)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f0f0f0' }}>
          <tr><th>Agent</th><th>Successful Winbacks</th><th>Revenue Generated</th></tr>
        </thead>
        <tbody>
          {agentPerformance.map(agent => (
            <tr key={agent.email} style={{ borderBottom: '1px solid #ddd' }}>
              <td>{agent.email}</td><td>{agent.wins}</td><td>${agent.revenue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}