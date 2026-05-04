import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export default function SupervisorDashboard({ user }) {
  const [teamStats, setTeamStats] = useState({ totalCallsToday: 0, winbackSuccessRate: 0, revenueToday: 0 })
  const [leaderboard, setLeaderboard] = useState([])
  const [recentCalls, setRecentCalls] = useState([])
  const [dailyTrend, setDailyTrend] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      // 1. Total calls today
      const today = new Date().toISOString().slice(0, 10)
      const { count: totalCallsToday } = await supabase
        .from('call_activities')
        .select('*', { count: 'exact', head: true })
        .gte('call_time', today)

      // 2. Winback success rate
      const { data: winbacks } = await supabase
        .from('call_activities')
        .select('response_outcome')
        .eq('call_type', 'Winback')
      const totalWinbacks = winbacks?.length || 0
      const successfulWinbacks = winbacks?.filter(w => w.response_outcome === 'Paid').length || 0
      const winbackSuccessRate = totalWinbacks ? (successfulWinbacks / totalWinbacks) * 100 : 0

      // 3. Revenue today (paid calls today)
      const { data: paidToday } = await supabase
        .from('call_activities')
        .select('package_price_at_time')
        .eq('response_outcome', 'Paid')
        .gte('call_time', today)
      const revenueToday = paidToday?.reduce((sum, p) => sum + (p.package_price_at_time || 0), 0) || 0

      setTeamStats({
        totalCallsToday: totalCallsToday || 0,
        winbackSuccessRate: winbackSuccessRate.toFixed(1),
        revenueToday,
      })

      // 4. Agent leaderboard (successful winbacks & revenue)
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

      // 6. Daily call trend (last 7 days)
      const last7Days = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const start = date.toISOString().slice(0, 10)
        const end = new Date(date.getTime() + 86400000).toISOString().slice(0, 10)
        const { count } = await supabase
          .from('call_activities')
          .select('*', { count: 'exact', head: true })
          .gte('call_time', start)
          .lt('call_time', end)
        last7Days.push({ date: start, day: start.slice(5), calls: count || 0 })
      }
      setDailyTrend(last7Days)

      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading) return <div>Loading supervisor dashboard...</div>

  const maxCalls = Math.max(...dailyTrend.map(d => d.calls), 1)

  return (
    <div>
      <h2 style={{ marginBottom: '1rem' }}>Supervisor Dashboard – Team Performance</h2>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{teamStats.totalCallsToday}</div>
          <div className="stat-label">Total Calls Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{teamStats.winbackSuccessRate}%</div>
          <div className="stat-label">Winback Success Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">${teamStats.revenueToday.toLocaleString()}</div>
          <div className="stat-label">Revenue Today</div>
        </div>
      </div>

      {/* Daily Call Trend – bar chart */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Daily Call Trend (Last 7 days)</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', justifyContent: 'space-around', flexWrap: 'wrap' }}>
          {dailyTrend.map(day => (
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

      {/* Agent Leaderboard */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Agent Leaderboard (by successful winbacks)</h3>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Successful Winbacks</th>
              <th>Revenue Generated</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>No winback data yet</td>
              </tr>
            ) : (
              leaderboard.map(agent => (
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

      {/* Recent Team Calls */}
      <div className="table-container">
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Recent Team Calls</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Client</th>
                <th>Agent</th>
                <th>Type</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {recentCalls.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No calls yet</td>
                </tr>
              ) : (
                recentCalls.map(call => (
                  <tr key={call.id}>
                    <td>{new Date(call.call_time).toLocaleString()}</td>
                    <td>{call.clients?.name} ({call.clients?.account_id})</td>
                    <td>{call.agent_email}</td>
                    <td>{call.call_type}</td>
                    <td>{call.call_outcome}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}