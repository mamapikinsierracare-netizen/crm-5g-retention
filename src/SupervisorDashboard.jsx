import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function SupervisorDashboard({ user }) {
  const [teamStats, setTeamStats] = useState({ totalCallsToday: 0, winbackSuccessRate: 0, revenueToday: 0 })
  const [leaderboard, setLeaderboard] = useState([])
  const [recentCalls, setRecentCalls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      // 1. Total calls today
      const today = new Date().toISOString().slice(0, 10)
      const { count: totalCalls } = await supabase
        .from('call_activities')
        .select('*', { count: 'exact', head: true })
        .gte('call_time', today)

      // 2. Winback success rate (response_outcome = 'Paid')
      const { data: winbacks } = await supabase
        .from('call_activities')
        .select('response_outcome')
        .eq('call_type', 'Winback')
      const successful = winbacks?.filter(w => w.response_outcome === 'Paid').length || 0
      const winbackRate = winbacks?.length ? (successful / winbacks.length) * 100 : 0

      // 3. Revenue today (sum of package_price_at_time where response_outcome = 'Paid' and call_time >= today)
      const { data: paidToday } = await supabase
        .from('call_activities')
        .select('package_price_at_time')
        .eq('response_outcome', 'Paid')
        .gte('call_time', today)
      const revenueToday = paidToday?.reduce((sum, p) => sum + (p.package_price_at_time || 0), 0) || 0

      setTeamStats({
        totalCallsToday: totalCalls || 0,
        winbackSuccessRate: winbackRate.toFixed(1),
        revenueToday
      })

      // 4. Agent leaderboard (by successful winbacks)
      const { data: allCalls } = await supabase
        .from('call_activities')
        .select('agent_email, response_outcome, package_price_at_time')
      const agentMap = new Map()
      allCalls?.forEach(call => {
        if (call.response_outcome === 'Paid') {
          const existing = agentMap.get(call.agent_email) || { wins: 0, revenue: 0 }
          existing.wins += 1
          existing.revenue += (call.package_price_at_time || 0)
          agentMap.set(call.agent_email, existing)
        }
      })
      const leaderboardArray = Array.from(agentMap.entries()).map(([email, data]) => ({ email, wins: data.wins, revenue: data.revenue }))
      leaderboardArray.sort((a, b) => b.wins - a.wins)
      setLeaderboard(leaderboardArray.slice(0, 10))

      // 5. Recent 20 calls (all agents)
      const { data: recent } = await supabase
        .from('call_activities')
        .select('*, clients(name, account_id)')
        .order('call_time', { ascending: false })
        .limit(20)
      setRecentCalls(recent || [])

      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading) return <div>Loading supervisor dashboard...</div>

  return (
    <div>
      <h2>Supervisor Dashboard</h2>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', minWidth: '150px' }}>
          <strong>Total Calls Today</strong><br />
          {teamStats.totalCallsToday}
        </div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', minWidth: '150px' }}>
          <strong>Winback Success Rate</strong><br />
          {teamStats.winbackSuccessRate}%
        </div>
        <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', minWidth: '150px' }}>
          <strong>Revenue Today</strong><br />
          ${teamStats.revenueToday}
        </div>
      </div>

      <h3>Agent Leaderboard (by successful winbacks)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f0f0f0' }}>
          <tr>
            <th style={{ padding: '8px', textAlign: 'left' }}>Agent</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Successful Winbacks</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Revenue Generated</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map(agent => (
            <tr key={agent.email} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '8px' }}>{agent.email}</td>
              <td style={{ padding: '8px' }}>{agent.wins}</td>
              <td style={{ padding: '8px' }}>${agent.revenue}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Recent Team Calls</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: '#f0f0f0' }}>
          <tr>
            <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Client</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Agent</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Type</th>
            <th style={{ padding: '8px', textAlign: 'left' }}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {recentCalls.map(call => (
            <tr key={call.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '8px' }}>{new Date(call.call_time).toLocaleString()}</td>
              <td style={{ padding: '8px' }}>{call.clients?.name} ({call.clients?.account_id})</td>
              <td style={{ padding: '8px' }}>{call.agent_email}</td>
              <td style={{ padding: '8px' }}>{call.call_type}</td>
              <td style={{ padding: '8px' }}>{call.call_outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}