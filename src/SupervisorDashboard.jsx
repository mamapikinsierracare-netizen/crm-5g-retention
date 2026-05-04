import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import DateRangeFilter from './DateRangeFilter'

function getDateRange(range) {
  // same function as above (copy exactly)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1))
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)

  switch (range) {
    case 'Today':
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() }
    case 'This Week':
      return { start: startOfWeek.toISOString(), end: new Date(endOfWeek.getTime() + 86400000).toISOString() }
    case 'Last Week':
      const lastWeekStart = new Date(startOfWeek)
      lastWeekStart.setDate(startOfWeek.getDate() - 7)
      const lastWeekEnd = new Date(lastWeekStart)
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6)
      return { start: lastWeekStart.toISOString(), end: new Date(lastWeekEnd.getTime() + 86400000).toISOString() }
    case 'This Month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start: monthStart.toISOString(), end: new Date(monthEnd.getTime() + 86400000).toISOString() }
    case 'Last Month':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start: lastMonthStart.toISOString(), end: new Date(lastMonthEnd.getTime() + 86400000).toISOString() }
    case 'Last 3 Months':
      const threeMonthsAgo = new Date(now)
      threeMonthsAgo.setMonth(now.getMonth() - 3)
      return { start: threeMonthsAgo.toISOString(), end: today.toISOString() }
    case 'Last 6 Months':
      const sixMonthsAgo = new Date(now)
      sixMonthsAgo.setMonth(now.getMonth() - 6)
      return { start: sixMonthsAgo.toISOString(), end: today.toISOString() }
    case 'This Year':
      const yearStart = new Date(now.getFullYear(), 0, 1)
      return { start: yearStart.toISOString(), end: today.toISOString() }
    case 'Past Years':
      const pastYearsEnd = new Date(now.getFullYear(), 0, 1)
      return { start: '1970-01-01T00:00:00Z', end: pastYearsEnd.toISOString() }
    default:
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() }
  }
}

export default function SupervisorDashboard({ user }) {
  const [range, setRange] = useState('Today')
  const [kpis, setKpis] = useState({
    totalCalls: 0,
    successfulWinbacks: 0,
    winbackConversionRate: 0,
    revenue: 0,
    uniqueClients: 0,
    avgCallDuration: 0,
  })
  const [leaderboard, setLeaderboard] = useState([])
  const [trendData, setTrendData] = useState([])
  const [recentCalls, setRecentCalls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      const { start, end } = getDateRange(range)

      const { data: calls, error } = await supabase
        .from('call_activities')
        .select('*, clients(name, account_id)')
        .gte('call_time', start)
        .lt('call_time', end)

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      const callsArray = calls || []

      // KPIs
      const totalCalls = callsArray.length
      const winbackCalls = callsArray.filter(c => c.call_type === 'Winback')
      const successfulWinbacks = winbackCalls.filter(c => c.response_outcome === 'Paid').length
      const winbackConversionRate = winbackCalls.length ? (successfulWinbacks / winbackCalls.length) * 100 : 0
      const revenue = callsArray.filter(c => c.response_outcome === 'Paid').reduce((sum, c) => sum + (c.package_price_at_time || 0), 0)
      const uniqueClients = new Set(callsArray.map(c => c.client_account_id)).size
      let avgCallDuration = 0
      const durations = callsArray.map(c => c.call_duration_seconds).filter(d => d && d > 0)
      if (durations.length) avgCallDuration = durations.reduce((a, b) => a + b, 0) / durations.length

      setKpis({ totalCalls, successfulWinbacks, winbackConversionRate: winbackConversionRate.toFixed(1), revenue, uniqueClients, avgCallDuration: Math.round(avgCallDuration) })

      // Leaderboard
      const agentMap = new Map()
      callsArray.forEach(call => {
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

      // Trend
      const dayCount = (new Date(end) - new Date(start)) / (1000 * 3600 * 24)
      let grouped
      if (dayCount <= 31) {
        const map = new Map()
        callsArray.forEach(call => { const day = call.call_time.slice(0,10); map.set(day, (map.get(day)||0)+1) })
        grouped = Array.from(map.entries()).map(([date, count]) => ({ date, count }))
        grouped.sort((a,b)=>a.date.localeCompare(b.date))
      } else {
        const map = new Map()
        callsArray.forEach(call => {
          const d = new Date(call.call_time)
          const year = d.getFullYear()
          const week = Math.ceil((((d - new Date(year,0,1)) / 86400000) + 1) / 7)
          const key = `${year}-W${week}`
          map.set(key, (map.get(key)||0)+1)
        })
        grouped = Array.from(map.entries()).map(([week, count]) => ({ date: week, count }))
        grouped.sort((a,b)=>a.date.localeCompare(b.date))
      }
      setTrendData(grouped)

      // Recent calls (limit 20)
      setRecentCalls(callsArray.slice(0,20))

      setLoading(false)
    }
    fetchData()
  }, [range])

  if (loading) return <div>Loading supervisor dashboard...</div>

  const maxCount = Math.max(...trendData.map(d => d.count), 1)
  const isDaily = trendData.length > 0 && trendData[0].date.includes('-W') === false

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Supervisor Dashboard – Team Performance</h2>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-number">{kpis.totalCalls}</div><div className="stat-label">Total Calls</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.successfulWinbacks}</div><div className="stat-label">Successful Winbacks</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.winbackConversionRate}%</div><div className="stat-label">Winback Conversion</div></div>
        <div className="stat-card"><div className="stat-number">${kpis.revenue.toLocaleString()}</div><div className="stat-label">Revenue</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.uniqueClients}</div><div className="stat-label">Unique Clients</div></div>
        {kpis.avgCallDuration > 0 && <div className="stat-card"><div className="stat-number">{kpis.avgCallDuration}s</div><div className="stat-label">Avg Call Duration</div></div>}
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3>Call Trend ({isDaily ? 'daily' : 'weekly'})</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', justifyContent: 'space-around', flexWrap: 'wrap' }}>
          {trendData.map(item => (
            <div key={item.date} style={{ textAlign: 'center', flex: 1, minWidth: '50px' }}>
              <div style={{ backgroundColor: 'var(--primary)', height: `${(item.count / maxCount) * 120}px`, width: '30px', margin: '0 auto', borderRadius: '8px 8px 4px 4px' }} />
              <div style={{ fontSize: '0.7rem', marginTop: '8px' }}>{item.date.slice(5)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Agent Leaderboard (by successful winbacks)</h3>
        <table><thead><tr><th>Agent</th><th>Successful Winbacks</th><th>Revenue Generated</th></tr></thead>
        <tbody>{leaderboard.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center' }}>No winback data in this period</td></tr>}
          {leaderboard.map(agent => <tr key={agent.email}><td>{agent.email}</td><td>{agent.wins}</td><td>${agent.revenue.toLocaleString()}</td></tr>)}
        </tbody></table>
      </div>

      <div className="table-container">
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Recent Calls (within selected period)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table><thead><tr><th>Time</th><th>Client</th><th>Agent</th><th>Type</th><th>Outcome</th></tr></thead>
          <tbody>{recentCalls.map(call => (
            <tr key={call.id}><td>{new Date(call.call_time).toLocaleString()}</td><td>{call.clients?.name} ({call.clients?.account_id})</td><td>{call.agent_email}</td><td>{call.call_type}</td><td>{call.call_outcome}</td></tr>
          ))}</tbody></table>
        </div>
      </div>
    </div>
  )
}