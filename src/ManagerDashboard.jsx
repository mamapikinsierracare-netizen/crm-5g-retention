import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import DateRangeFilter from './DateRangeFilter';

function getDateRange(range, customStart = null, customEnd = null) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  switch (range) {
    case 'Today':
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    case 'This Week':
      return { start: startOfWeek.toISOString(), end: new Date(endOfWeek.getTime() + 86400000).toISOString() };
    case 'Last Week':
      const lastWeekStart = new Date(startOfWeek);
      lastWeekStart.setDate(startOfWeek.getDate() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      return { start: lastWeekStart.toISOString(), end: new Date(lastWeekEnd.getTime() + 86400000).toISOString() };
    case 'This Month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: monthStart.toISOString(), end: new Date(monthEnd.getTime() + 86400000).toISOString() };
    case 'Last Month':
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: lastMonthStart.toISOString(), end: new Date(lastMonthEnd.getTime() + 86400000).toISOString() };
    case 'Last 3 Months':
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      return { start: threeMonthsAgo.toISOString(), end: today.toISOString() };
    case 'Last 6 Months':
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return { start: sixMonthsAgo.toISOString(), end: today.toISOString() };
    case 'This Year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart.toISOString(), end: today.toISOString() };
    case 'Past Years':
      const pastYearsEnd = new Date(now.getFullYear(), 0, 1);
      return { start: '1970-01-01T00:00:00Z', end: pastYearsEnd.toISOString() };
    case 'Custom':
      if (customStart && customEnd) {
        const startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
        return { start: startDate.toISOString(), end: endDate.toISOString() };
      }
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    default:
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
  }
}

export default function ManagerDashboard() {
  const [range, setRange] = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [kpis, setKpis] = useState({
    totalCalls: 0,
    successfulWinbacks: 0,
    winbackConversionRate: 0,
    revenue: 0,
    uniqueClients: 0,
    avgCallDuration: 0,
  });
  const [agentPerformance, setAgentPerformance] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [extendedKPIs, setExtendedKPIs] = useState({
    activeRevenue: 0,
    disabledRevenue: 0,
    totalActiveAccounts: 0,
    totalDisabledAccounts: 0,
    callOutcomes: { Answer: 0, 'Did not answer': 0, Busy: 0, Unreachable: 0 },
    responseOutcomes: {
      Paid: 0, 'Promise to pay': 0, Travel: 0, 'Not interested': 0,
      'To collect equipment': 0, 'No longer using our service': 0, Other: 0,
    },
    agentBreakdown: [],
  });

  const fetchData = async () => {
    setLoading(true);
    const { start, end } = getDateRange(range, customStart, customEnd);

    let callsQuery = supabase
      .from('call_activities')
      .select('*, clients(account_id)');
    if (range !== 'Custom' || (customStart && customEnd)) {
      callsQuery = callsQuery.gte('call_time', start).lt('call_time', end);
    }
    const { data: calls, error: callsErr } = await callsQuery;
    if (callsErr) console.error(callsErr);
    const callsArray = calls || [];

    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('account_id, account_status, retention_agent, aav_value_usd');
    if (clientsErr) console.error(clientsErr);
    const clientsArray = clients || [];

    // Existing KPIs
    const totalCalls = callsArray.length;
    const winbackCalls = callsArray.filter(c => c.call_type === 'Winback');
    const successfulWinbacks = winbackCalls.filter(c => c.response_outcome === 'Paid').length;
    const winbackConversionRate = winbackCalls.length ? (successfulWinbacks / winbackCalls.length) * 100 : 0;
    const revenue = callsArray
      .filter(c => c.response_outcome === 'Paid')
      .reduce((sum, c) => sum + (c.package_price_at_time || 0), 0);
    const uniqueClients = new Set(callsArray.map(c => c.client_account_id)).size;
    let avgCallDuration = 0;
    const durations = callsArray.map(c => c.call_duration_seconds).filter(d => d && d > 0);
    if (durations.length) {
      avgCallDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    }
    setKpis({
      totalCalls,
      successfulWinbacks,
      winbackConversionRate: winbackConversionRate.toFixed(1),
      revenue,
      uniqueClients,
      avgCallDuration: Math.round(avgCallDuration),
    });

    // Agent leaderboard (top by winbacks)
    const agentMap = new Map();
    callsArray.forEach(call => {
      if (call.response_outcome === 'Paid') {
        const existing = agentMap.get(call.agent_email) || { wins: 0, revenue: 0 };
        existing.wins += 1;
        existing.revenue += (call.package_price_at_time || 0);
        agentMap.set(call.agent_email, existing);
      }
    });
    const leaderboardArray = Array.from(agentMap.entries()).map(([email, data]) => ({ email, wins: data.wins, revenue: data.revenue }));
    leaderboardArray.sort((a, b) => b.wins - a.wins);
    setAgentPerformance(leaderboardArray.slice(0, 10));

    // Trend data
    const dayCount = (new Date(end) - new Date(start)) / (1000 * 3600 * 24);
    let grouped;
    if (dayCount <= 31) {
      const map = new Map();
      callsArray.forEach(call => {
        const day = call.call_time.slice(0, 10);
        map.set(day, (map.get(day) || 0) + 1);
      });
      grouped = Array.from(map.entries()).map(([date, count]) => ({ date, count }));
      grouped.sort((a, b) => a.date.localeCompare(b.date));
    } else {
      const map = new Map();
      callsArray.forEach(call => {
        const d = new Date(call.call_time);
        const year = d.getFullYear();
        const week = Math.ceil((((d - new Date(year, 0, 1)) / 86400000) + 1) / 7);
        const key = `${year}-W${week}`;
        map.set(key, (map.get(key) || 0) + 1);
      });
      grouped = Array.from(map.entries()).map(([week, count]) => ({ date: week, count }));
      grouped.sort((a, b) => a.date.localeCompare(b.date));
    }
    setTrendData(grouped);

    // Extended KPIs: revenue splits, call outcomes, response outcomes, agent breakdown
    let activeRev = 0, disabledRev = 0;
    let activeCount = 0, disabledCount = 0;
    clientsArray.forEach(client => {
      const aav = client.aav_value_usd || 0;
      if (client.account_status === 'Active') {
        activeRev += aav;
        activeCount++;
      } else if (client.account_status === 'Disabled') {
        disabledRev += aav;
        disabledCount++;
      }
    });

    const callOutcomes = { Answer: 0, 'Did not answer': 0, Busy: 0, Unreachable: 0 };
    const responseOutcomes = {
      Paid: 0, 'Promise to pay': 0, Travel: 0, 'Not interested': 0,
      'To collect equipment': 0, 'No longer using our service': 0, Other: 0,
    };
    callsArray.forEach(call => {
      const outcome = call.call_outcome;
      if (outcome === 'Answer') callOutcomes.Answer++;
      else if (outcome === 'Did not answer') callOutcomes['Did not answer']++;
      else if (outcome === 'Busy') callOutcomes.Busy++;
      else if (outcome === 'Unreachable') callOutcomes.Unreachable++;

      if (call.call_type === 'Winback' || call.call_type === 'Payment Reminder') {
        const resp = call.response_outcome;
        if (resp === 'Paid') responseOutcomes.Paid++;
        else if (resp === 'Promise to pay') responseOutcomes['Promise to pay']++;
        else if (resp === 'Travel') responseOutcomes.Travel++;
        else if (resp === 'Not interested') responseOutcomes['Not interested']++;
        else if (resp === 'To collect equipment') responseOutcomes['To collect equipment']++;
        else if (resp === 'No longer using our service') responseOutcomes['No longer using our service']++;
        else if (resp === 'Other') responseOutcomes.Other++;
      }
    });

    const allAgents = [...new Set(clientsArray.map(c => c.retention_agent).filter(Boolean))];
    const agentBreakdownMap = new Map();
    allAgents.forEach(agent => {
      agentBreakdownMap.set(agent, {
        activeRevenue: 0, disabledRevenue: 0,
        activeCount: 0, disabledCount: 0,
        totalCalls: 0,
        callOutcomes: { Answer: 0, 'Did not answer': 0, Busy: 0, Unreachable: 0 },
        responseOutcomes: {
          Paid: 0, 'Promise to pay': 0, Travel: 0, 'Not interested': 0,
          'To collect equipment': 0, 'No longer using our service': 0, Other: 0,
        },
      });
    });
    clientsArray.forEach(client => {
      const agent = client.retention_agent;
      if (!agent || !agentBreakdownMap.has(agent)) return;
      const aav = client.aav_value_usd || 0;
      const rec = agentBreakdownMap.get(agent);
      if (client.account_status === 'Active') {
        rec.activeRevenue += aav;
        rec.activeCount++;
      } else if (client.account_status === 'Disabled') {
        rec.disabledRevenue += aav;
        rec.disabledCount++;
      }
    });
    callsArray.forEach(call => {
      const agent = call.agent_email;
      if (!agent || !agentBreakdownMap.has(agent)) return;
      const rec = agentBreakdownMap.get(agent);
      rec.totalCalls++;
      const outcome = call.call_outcome;
      if (outcome === 'Answer') rec.callOutcomes.Answer++;
      else if (outcome === 'Did not answer') rec.callOutcomes['Did not answer']++;
      else if (outcome === 'Busy') rec.callOutcomes.Busy++;
      else if (outcome === 'Unreachable') rec.callOutcomes.Unreachable++;
      if (call.call_type === 'Winback' || call.call_type === 'Payment Reminder') {
        const resp = call.response_outcome;
        if (resp === 'Paid') rec.responseOutcomes.Paid++;
        else if (resp === 'Promise to pay') rec.responseOutcomes['Promise to pay']++;
        else if (resp === 'Travel') rec.responseOutcomes.Travel++;
        else if (resp === 'Not interested') rec.responseOutcomes['Not interested']++;
        else if (resp === 'To collect equipment') rec.responseOutcomes['To collect equipment']++;
        else if (resp === 'No longer using our service') rec.responseOutcomes['No longer using our service']++;
        else if (resp === 'Other') rec.responseOutcomes.Other++;
      }
    });
    const agentBreakdown = Array.from(agentBreakdownMap.entries()).map(([agent, data]) => ({ agent, ...data }));

    setExtendedKPIs({
      activeRevenue: activeRev,
      disabledRevenue: disabledRev,
      totalActiveAccounts: activeCount,
      totalDisabledAccounts: disabledCount,
      callOutcomes,
      responseOutcomes,
      agentBreakdown,
    });
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [range, customStart, customEnd]);

  const handleRangeChange = (newRange) => {
    setRange(newRange);
    setShowCustom(newRange === 'Custom');
    if (newRange !== 'Custom') {
      fetchData();
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      fetchData();
    } else {
      alert('Please select both From and To dates');
    }
  };

  if (loading) return <div>Loading manager dashboard...</div>;

  const maxCount = Math.max(...trendData.map(d => d.count), 1);
  const isDaily = trendData.length > 0 && trendData[0].date.includes('-W') === false;
  const { activeRevenue, disabledRevenue, totalActiveAccounts, totalDisabledAccounts, callOutcomes, responseOutcomes, agentBreakdown } = extendedKPIs;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h2>Manager Dashboard – Key Performance Indicators</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <DateRangeFilter value={range} onChange={handleRangeChange} />
          {showCustom && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <span>to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              <button onClick={applyCustomRange}>Apply</button>
            </>
          )}
        </div>
      </div>

      {/* Original KPI cards */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-number">{kpis.totalCalls}</div><div className="stat-label">Total Calls</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.successfulWinbacks}</div><div className="stat-label">Successful Winbacks</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.winbackConversionRate}%</div><div className="stat-label">Winback Conversion</div></div>
        <div className="stat-card"><div className="stat-number">${kpis.revenue.toLocaleString()}</div><div className="stat-label">Revenue</div></div>
        <div className="stat-card"><div className="stat-number">{kpis.uniqueClients}</div><div className="stat-label">Unique Clients</div></div>
        {kpis.avgCallDuration > 0 && (
          <div className="stat-card"><div className="stat-number">{kpis.avgCallDuration}s</div><div className="stat-label">Avg Call Duration</div></div>
        )}
      </div>

      {/* Active/Disabled Revenue & Accounts */}
      <div className="stats-grid" style={{ marginTop: '1rem' }}>
        <div className="stat-card"><div className="stat-number">${activeRevenue.toFixed(2)}</div><div className="stat-label">Active Revenue (USD)</div></div>
        <div className="stat-card"><div className="stat-number">${disabledRevenue.toFixed(2)}</div><div className="stat-label">Disabled Revenue (USD)</div></div>
        <div className="stat-card"><div className="stat-number">{totalActiveAccounts}</div><div className="stat-label">Active Accounts</div></div>
        <div className="stat-card"><div className="stat-number">{totalDisabledAccounts}</div><div className="stat-label">Disabled Accounts</div></div>
      </div>

      {/* Team Call Outcomes cards */}
      <div className="stats-grid" style={{ marginTop: '1rem' }}>
        <div className="stat-card"><div className="stat-number">{callOutcomes.Answer}</div><div className="stat-label">Answered Calls</div></div>
        <div className="stat-card"><div className="stat-number">{callOutcomes['Did not answer']}</div><div className="stat-label">Did Not Answer</div></div>
        <div className="stat-card"><div className="stat-number">{callOutcomes.Busy}</div><div className="stat-label">Busy</div></div>
        <div className="stat-card"><div className="stat-number">{callOutcomes.Unreachable}</div><div className="stat-label">Unreachable</div></div>
      </div>

      {/* Call Trend Chart */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Call Trend ({isDaily ? 'daily' : 'weekly'})</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', justifyContent: 'space-around', flexWrap: 'wrap' }}>
          {trendData.map(item => (
            <div key={item.date} style={{ textAlign: 'center', flex: 1, minWidth: '50px' }}>
              <div style={{
                backgroundColor: 'var(--primary)',
                height: `${(item.count / maxCount) * 120}px`,
                width: '30px',
                margin: '0 auto',
                borderRadius: '8px 8px 4px 4px',
                transition: 'height 0.3s',
              }} />
              <div style={{ marginTop: '8px', fontSize: '0.7rem' }}>{item.date.slice(5)}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Agent Performance (by winbacks) */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Top Agent Performance (by successful winbacks)</h3>
        <div style={{ overflowX: 'auto' }}>
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
                  <td colSpan={3} style={{ textAlign: 'center', padding: '2rem' }}>No winback data in this period</td>
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

      {/* Agent Breakdown Table */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Agent Performance Details</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '800px' }}>
            <thead>
              <tr>
                <th>Agent</th><th>Active Rev (USD)</th><th>Disabled Rev</th><th>Active Accts</th><th>Disabled Accts</th>
                <th>Total Calls</th><th>Answer</th><th>Did not answer</th><th>Busy</th><th>Unreachable</th>
              </tr>
            </thead>
            <tbody>
              {agentBreakdown.map(agent => (
                <tr key={agent.agent}>
                  <td>{agent.agent}</td>
                  <td>${agent.activeRevenue.toFixed(2)}</td>
                  <td>${agent.disabledRevenue.toFixed(2)}</td>
                  <td>{agent.activeCount}</td>
                  <td>{agent.disabledCount}</td>
                  <td>{agent.totalCalls}</td>
                  <td>{agent.callOutcomes.Answer}</td>
                  <td>{agent.callOutcomes['Did not answer']}</td>
                  <td>{agent.callOutcomes.Busy}</td>
                  <td>{agent.callOutcomes.Unreachable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Response Outcomes Table */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <h3 style={{ padding: '1rem 1rem 0 1rem' }}>Response Outcomes (Winback / Payment Reminder)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: '1000px' }}>
            <thead>
              <tr>
                <th>Agent</th><th>Paid</th><th>Promise to pay</th><th>Travel</th><th>Not interested</th>
                <th>To collect equip.</th><th>No longer using</th><th>Other</th>
              </tr>
            </thead>
            <tbody>
              {agentBreakdown.map(agent => (
                <tr key={agent.agent}>
                  <td>{agent.agent}</td>
                  <td>{agent.responseOutcomes.Paid}</td>
                  <td>{agent.responseOutcomes['Promise to pay']}</td>
                  <td>{agent.responseOutcomes.Travel}</td>
                  <td>{agent.responseOutcomes['Not interested']}</td>
                  <td>{agent.responseOutcomes['To collect equipment']}</td>
                  <td>{agent.responseOutcomes['No longer using our service']}</td>
                  <td>{agent.responseOutcomes.Other}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--bg)', fontWeight: 'bold' }}>
                <td><strong>TOTAL</strong></td>
                <td><strong>{responseOutcomes.Paid}</strong></td>
                <td><strong>{responseOutcomes['Promise to pay']}</strong></td>
                <td><strong>{responseOutcomes.Travel}</strong></td>
                <td><strong>{responseOutcomes['Not interested']}</strong></td>
                <td><strong>{responseOutcomes['To collect equipment']}</strong></td>
                <td><strong>{responseOutcomes['No longer using our service']}</strong></td>
                <td><strong>{responseOutcomes.Other}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}