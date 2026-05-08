import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabase';
import DateRangeFilter from './DateRangeFilter';
// Professional Chart Components
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar 
} from 'recharts';

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
    case 'Last Week': {
      const lastWeekStart = new Date(startOfWeek);
      lastWeekStart.setDate(startOfWeek.getDate() - 7);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
      return { start: lastWeekStart.toISOString(), end: new Date(lastWeekEnd.getTime() + 86400000).toISOString() };
    }
    case 'This Month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: monthStart.toISOString(), end: new Date(monthEnd.getTime() + 86400000).toISOString() };
    }
    case 'Last Month': {
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: lastMonthStart.toISOString(), end: new Date(lastMonthEnd.getTime() + 86400000).toISOString() };
    }
    case 'Last 3 Months': {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      return { start: threeMonthsAgo.toISOString(), end: today.toISOString() };
    }
    case 'Last 6 Months': {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      return { start: sixMonthsAgo.toISOString(), end: today.toISOString() };
    }
    case 'This Year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart.toISOString(), end: today.toISOString() };
    }
    case 'Past Years': {
      const pastYearsEnd = new Date(now.getFullYear(), 0, 1);
      return { start: '1970-01-01T00:00:00Z', end: pastYearsEnd.toISOString() };
    }
    case 'Custom': {
      if (customStart && customEnd) {
        const startDate = new Date(customStart);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(customEnd);
        endDate.setHours(23, 59, 59, 999);
        return { start: startDate.toISOString(), end: endDate.toISOString() };
      }
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    }
    default:
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
  }
}

export default function ManagerDashboard() {
  const [range, setRange] = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [loading, setLoading] = useState(true);

  // Original Data States
  const [callsData, setCallsData] = useState([]);
  const [clientsData, setClientsData] = useState([]);
  const [agentPerformance, setAgentPerformance] = useState([]);
  const [trendData, setTrendData] = useState([]);

  // KPI States
  const [kpis, setKpis] = useState({
    totalCalls: 0,
    successfulWinbacks: 0,
    winbackConversionRate: 0,
    revenue: 0,
    uniqueClients: 0,
    avgCallDuration: 0,
    totalAccountUniverse: 0,
  });

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

    // 1. Fetch Calls with AAV Join
    let callsQuery = supabase
      .from('call_activities')
      .select('*, clients!inner(aav_value_usd)'); 
    if (range !== 'Custom' || (customStart && customEnd)) {
      callsQuery = callsQuery.gte('call_time', start).lt('call_time', end);
    }
    const { data: calls, error: callsErr } = await callsQuery;
    if (callsErr) console.error("Calls Fetch Error:", callsErr);
    const callsArray = calls || [];
    setCallsData(callsArray);

    // 2. Fetch Clients
    const { data: clients, error: clientsErr } = await supabase
      .from('clients')
      .select('*');
    if (clientsErr) console.error("Clients Fetch Error:", clientsErr);
    const clientsArray = clients || [];
    setClientsData(clientsArray);

    // 3. KPI Logic
    const winbackCalls = callsArray.filter(c => c.call_type === 'Winback');
    const successfulWinbacks = winbackCalls.filter(c => c.response_outcome === 'Paid').length;
    const revenue = callsArray
      .filter(c => c.response_outcome === 'Paid')
      .reduce((sum, c) => sum + (Number(c.clients?.aav_value_usd) || 0), 0);

    setKpis({
      totalCalls: callsArray.length,
      successfulWinbacks,
      winbackConversionRate: winbackCalls.length ? ((successfulWinbacks / winbackCalls.length) * 100).toFixed(1) : 0,
      revenue,
      uniqueClients: new Set(callsArray.map(c => c.client_account_id)).size,
      totalAccountUniverse: clientsArray.length,
      avgCallDuration: 0
    });

    // 4. Trend Grouping (Original Logic)
    const dayCount = (new Date(end) - new Date(start)) / (1000 * 3600 * 24);
    const trendMap = new Map();
    callsArray.forEach(call => {
      const key = dayCount <= 31 ? call.call_time.slice(0, 10) : `W${Math.ceil(new Date(call.call_time).getDate() / 7)}`;
      trendMap.set(key, (trendMap.get(key) || 0) + 1);
    });
    setTrendData(Array.from(trendMap.entries()).map(([date, count]) => ({ date, count })).sort((a,b) => a.date.localeCompare(b.date)));

    // 5. Agent Leaderboard (Original Logic)
    const agentMap = new Map();
    callsArray.forEach(call => {
      if (call.response_outcome === 'Paid') {
        const existing = agentMap.get(call.agent_email) || { wins: 0, revenue: 0 };
        existing.wins += 1;
        existing.revenue += (Number(call.clients?.aav_value_usd) || 0);
        agentMap.set(call.agent_email, existing);
      }
    });
    const leaderboard = Array.from(agentMap.entries()).map(([email, d]) => ({ email, wins: d.wins, revenue: d.revenue }));
    setAgentPerformance(leaderboard.sort((a, b) => b.wins - a.wins).slice(0, 10));

    // 6. Extended Stats Logic
    let activeRev = 0, disabledRev = 0, activeCount = 0, disabledCount = 0;
    clientsArray.forEach(client => {
      const aav = Number(client.aav_value_usd) || 0;
      const status = (client.account_status || '').toLowerCase().trim();
      if (status === 'active') { activeRev += aav; activeCount++; }
      else if (status === 'disabled') { disabledRev += aav; disabledCount++; }
    });

    const callOutcomes = { Answer: 0, 'Did not answer': 0, Busy: 0, Unreachable: 0 };
    const responseOutcomes = { Paid: 0, 'Promise to pay': 0, Travel: 0, 'Not interested': 0, 'To collect equipment': 0, 'No longer using our service': 0, Other: 0 };
    
    callsArray.forEach(call => {
      if (callOutcomes.hasOwnProperty(call.call_outcome)) callOutcomes[call.call_outcome]++;
      if (responseOutcomes.hasOwnProperty(call.response_outcome)) responseOutcomes[call.response_outcome]++;
    });

    // 7. Agent Breakdown Logic
    const allAgents = [...new Set(clientsArray.map(c => c.retention_agent).filter(Boolean))];
    const agentBreakdown = allAgents.map(agent => {
        const aClients = clientsArray.filter(c => c.retention_agent === agent);
        const aActive = aClients.filter(c => c.account_status?.toLowerCase().trim() === 'active');
        const aDisabled = aClients.filter(c => c.account_status?.toLowerCase().trim() === 'disabled');
        const aCalls = callsArray.filter(c => c.agent_email === agent);
        const aOutcomes = { Answer: 0, 'Did not answer': 0, Busy: 0, Unreachable: 0 };
        const aResp = { Paid: 0, 'Promise to pay': 0, Travel: 0, 'Not interested': 0, 'To collect equipment': 0, 'No longer using our service': 0, Other: 0 };
        aCalls.forEach(c => {
            if (aOutcomes.hasOwnProperty(c.call_outcome)) aOutcomes[c.call_outcome]++;
            if (aResp.hasOwnProperty(c.response_outcome)) aResp[c.response_outcome]++;
        });

        return {
            agent,
            activeRevenue: aActive.reduce((sum, c) => sum + (Number(c.aav_value_usd) || 0), 0),
            disabledRevenue: aDisabled.reduce((sum, c) => sum + (Number(c.aav_value_usd) || 0), 0),
            activeCount: aActive.length,
            disabledCount: aDisabled.length,
            totalCalls: aCalls.length,
            callOutcomes: aOutcomes,
            responseOutcomes: aResp
        };
    });

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

  useEffect(() => { fetchData(); }, [range, customStart, customEnd]);

  // --- MEMOIZED CALCULATIONS FOR VISUALS ---
  const chartData = useMemo(() => {
    const portfolio = [
      { name: 'Active', value: extendedKPIs.totalActiveAccounts, color: '#007bff' },
      { name: 'Disabled', value: extendedKPIs.totalDisabledAccounts, color: '#e91e63' }
    ];
    const outcomes = Object.entries(extendedKPIs.callOutcomes).map(([name, value]) => ({ name, value }));
    const COLORS = ['#4caf50', '#ff9800', '#f44336', '#9e9e9e'];
    return { portfolio, outcomes, COLORS };
  }, [extendedKPIs]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Updating Manager Dashboard...</div>;

  const totalAAV = extendedKPIs.activeRevenue + extendedKPIs.disabledRevenue || 1;
  const totalCallsCount = kpis.totalCalls || 1;

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Manager Intelligence Dashboard</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <DateRangeFilter value={range} onChange={setRange} />
          {showCustom && (
            <div style={{ display: 'flex', gap: '5px' }}>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              <button onClick={fetchData}>Apply</button>
            </div>
          )}
        </div>
      </div>

      {/* KPI GRID 1 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{kpis.totalAccountUniverse}</div>
          <div className="stat-label">Total Accounts (Active + Disabled)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">${extendedKPIs.activeRevenue.toLocaleString()}</div>
          <div className="stat-label">Active Portfolio AAV ({((extendedKPIs.activeRevenue / totalAAV) * 100).toFixed(1)}%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">${extendedKPIs.disabledRevenue.toLocaleString()}</div>
          <div className="stat-label">Disabled Portfolio AAV ({((extendedKPIs.disabledRevenue / totalAAV) * 100).toFixed(1)}%)</div>
        </div>
      </div>

      {/* KPI GRID 2 */}
      <div className="stats-grid" style={{ marginTop: '20px' }}>
        <div className="stat-card">
          <div className="stat-number">{extendedKPIs.totalActiveAccounts}</div>
          <div className="stat-label">Active Accounts ({((extendedKPIs.totalActiveAccounts / kpis.totalAccountUniverse) * 100).toFixed(1)}%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{extendedKPIs.totalDisabledAccounts}</div>
          <div className="stat-label">Disabled Accounts ({((extendedKPIs.totalDisabledAccounts / kpis.totalAccountUniverse) * 100).toFixed(1)}%)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">${kpis.revenue.toLocaleString()}</div>
          <div className="stat-label">Winback Revenue (Paid)</div>
        </div>
      </div>

      {/* KPI GRID 3: CALL PERFORMANCE */}
      <div className="stats-grid" style={{ marginTop: '20px' }}>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#4caf50' }}>{((extendedKPIs.callOutcomes.Answer / totalCallsCount) * 100).toFixed(1)}%</div>
          <div className="stat-label">Call Answer Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#ff9800' }}>{((extendedKPIs.callOutcomes['Did not answer'] / totalCallsCount) * 100).toFixed(1)}%</div>
          <div className="stat-label">No Answer Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#f44336' }}>{((extendedKPIs.callOutcomes.Busy / totalCallsCount) * 100).toFixed(1)}%</div>
          <div className="stat-label">Busy Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#9e9e9e' }}>{((extendedKPIs.callOutcomes.Unreachable / totalCallsCount) * 100).toFixed(1)}%</div>
          <div className="stat-label">Unreachable Rate</div>
        </div>
      </div>

      {/* NEW: PROFESSIONAL VISUAL INSIGHTS SECTION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '30px' }}>
        {/* Trend Area Chart */}
        <div className="card" style={{ height: '350px', padding: '20px' }}>
          <h3>Call Activity Trend</h3>
          <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#007bff" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#007bff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" fontSize={10} tickMargin={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#007bff" fillOpacity={1} fill="url(#colorCount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Portfolio Pie Chart */}
        <div className="card" style={{ height: '350px', padding: '20px' }}>
          <h3>Portfolio Composition</h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={chartData.portfolio} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                {chartData.portfolio.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome Pie Chart */}
        <div className="card" style={{ height: '350px', padding: '20px' }}>
          <h3>Call Outcome Split</h3>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={chartData.outcomes} outerRadius={80} dataKey="value">
                {chartData.outcomes.map((entry, index) => <Cell key={`cell-${index}`} fill={chartData.COLORS[index % chartData.COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ORIGINAL TABLES (PRESERVED) */}
      <div className="table-container" style={{ marginTop: '30px' }}>
        <h3 style={{ padding: '15px' }}>Agent Performance Details (% Contribution)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8f9fa' }}>
                <th style={{ padding: '12px' }}>Agent</th>
                <th>Active AAV ($ | %)</th>
                <th>Disabled AAV ($ | %)</th>
                <th>Active ACCTS (# | %)</th>
                <th>Disabled ACCTS (# | %)</th>
              </tr>
            </thead>
            <tbody>
              {extendedKPIs.agentBreakdown.map(agent => (
                <tr key={agent.agent} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontWeight: '600' }}>{agent.agent}</td>
                  <td>
                    <div style={{ fontWeight: '600' }}>${agent.activeRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: '#007bff' }}>{((agent.activeRevenue / extendedKPIs.activeRevenue) * 100 || 0).toFixed(1)}% of Active</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>${agent.disabledRevenue.toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: '#e91e63' }}>{((agent.disabledRevenue / extendedKPIs.disabledRevenue) * 100 || 0).toFixed(1)}% of Disabled</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{agent.activeCount}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{((agent.activeCount / extendedKPIs.totalActiveAccounts) * 100 || 0).toFixed(1)}% Load</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{agent.disabledCount}</div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{((agent.disabledCount / extendedKPIs.totalDisabledAccounts) * 100 || 0).toFixed(1)}% Load</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-container" style={{ marginTop: '30px' }}>
        <h3 style={{ padding: '15px' }}>Agent Call Outcomes (Detailed)</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Agent</th><th>Total Calls</th><th>Answer</th><th>No Answer</th><th>Busy</th><th>Unreachable</th></tr>
            </thead>
            <tbody>
              {extendedKPIs.agentBreakdown.map(a => (
                <tr key={a.agent}>
                  <td>{a.agent}</td><td>{a.totalCalls}</td><td>{a.callOutcomes.Answer}</td><td>{a.callOutcomes['Did not answer']}</td><td>{a.callOutcomes.Busy}</td><td>{a.callOutcomes.Unreachable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="table-container" style={{ marginTop: '30px', marginBottom: '50px' }}>
        <h3 style={{ padding: '15px' }}>Response Outcomes Summary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Agent</th><th>Paid</th><th>Promise</th><th>Travel</th><th>Not Interested</th><th>Other</th></tr>
            </thead>
            <tbody>
              {extendedKPIs.agentBreakdown.map(a => (
                <tr key={a.agent}>
                  <td>{a.agent}</td><td>{a.responseOutcomes.Paid}</td><td>{a.responseOutcomes['Promise to pay']}</td><td>{a.responseOutcomes.Travel}</td><td>{a.responseOutcomes['Not interested']}</td><td>{a.responseOutcomes.Other}</td>
                </tr>
              ))}
              <tr style={{ background: '#f8f9fa', fontWeight: 'bold' }}>
                <td>GRAND TOTAL</td>
                <td>{extendedKPIs.responseOutcomes.Paid}</td>
                <td>{extendedKPIs.responseOutcomes['Promise to pay']}</td>
                <td>{extendedKPIs.responseOutcomes.Travel}</td>
                <td>{extendedKPIs.responseOutcomes['Not interested']}</td>
                <td>{extendedKPIs.responseOutcomes.Other}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}